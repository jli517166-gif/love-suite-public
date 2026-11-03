import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commitCoreMemory, readCoreMemory } from "../core-memory.js";
import { maintenanceContext, saveMaintenanceProposal } from "../maintenance-proposals.js";
const contract = await import("../memory-contract.js").catch(() => ({}));
const errors = await import("../maintenance-errors.js").catch(() => ({}));
const background = await import("./background-evidence.mjs").catch(() => ({}));
assert.equal(typeof background.evaluateBackground, "function", "后台实际验收需要证据检查，不能只看回答关键词");
assert.equal(background.evaluateBackground({ rounds: [] }).structuredChecksPassed, false);
const sampleMemory = [1, 2].map((i) => ({
  id: "m" + i,
  content: "fixture" + i,
  source: { reference: "source" + i },
  coreId: "a",
  status: "active",
}));
const sampleStore = {
  revision: 1,
  memories: sampleMemory,
  cores: [
    { id: "self", status: "active" },
    { id: "a", status: "active" },
  ],
};
const samplePlan = [{ op: "update_core", id: "a", summary: "fixture" }],
  digest = "a".repeat(64);
const sample = {
  rounds: Array.from({ length: 4 }, () => ({
    code: 0,
    events: [{ type: "status", phase: "turn_end", reason: { kind: "completed" } }],
    store: structuredClone(sampleStore),
    beforeHash: "hash",
    afterHash: "hash",
  })),
};
sample.rounds[1].budget = { calls: 1, runs: [{ maintenance: { status: "suggested" } }] };
sample.rounds[1].proposals = { total: 1, items: [{ operations: samplePlan, preview: { previewDigest: digest } }] };
sample.rounds[2].events.push(
  ...["preview", "commit"].flatMap((action) => [
    {
      type: "tool_call",
      callId: action,
      tool: "love_core_memory",
      input: { action, operations: samplePlan, previewDigest: digest },
    },
    { type: "tool_result", callId: action, status: "completed" },
  ]),
);
sample.rounds[2].observations = [{ callId: "preview", hash: "hash" }];
sample.rounds[3].events.push(
  { type: "tool_call", callId: "recall", tool: "love_recall" },
  { type: "tool_result", callId: "recall", status: "completed", result: "m1 source1 m2 source2" },
);
assert.equal(background.evaluateBackground(sample).structuredChecksPassed, true);
const badRecall = structuredClone(sample);
badRecall.rounds[3].events.at(-1).status = "error";
assert.equal(background.evaluateBackground(badRecall).checks.freshRecallHasCurrentSources, false);
const badPlan = structuredClone(sample);
badPlan.rounds[2].events.find((e) => e.callId === "commit" && e.type === "tool_call").input.operations = [];
assert.equal(background.evaluateBackground(badPlan).checks.previewAndExactCommit, false);
assert.equal(typeof contract.memoryOperationsSchema, "function", "需要单一记忆操作契约");
assert.ok(Object.isFrozen(contract.operationDefinitions));
assert.ok(!contract.backgroundOperations.includes("archive"));
assert.ok(!contract.backgroundOperations.includes("update_memory"));
assert.deepEqual(contract.proposalFields.update_memory, ["op", "id", "reason", "coreId"]);
for (const [op, fields] of Object.entries(contract.proposalFields))
  assert.ok(fields.every((field) => contract.operationFields[op].includes(field)));
const schema = contract.memoryOperationsSchema();
assert.match(
  schema.items.oneOf.find((item) => item.properties.op.const === "create_core").properties.evidenceIds.description,
  /记忆ID/,
);
assert.match(
  schema.items.oneOf.find((item) => item.properties.op.const === "create_core").properties.evidenceIds.description,
  /消息/,
);
assert.match(schema.items.oneOf.find((item) => item.properties.op.const === "update_memory").description, /coreId/);
assert.match(schema.items.oneOf.find((item) => item.properties.op.const === "update_memory").description, /当前/);
for (const variant of schema.items.oneOf) {
  const op = variant.properties.op.const;
  assert.deepEqual(Object.keys(variant.properties).sort(), [...contract.operationFields[op]].sort());
  assert.deepEqual(variant.required, ["op", ...contract.operationDefinitions[op].required]);
  assert.ok(Object.isFrozen(contract.operationFields[op]));
}
assert.equal(typeof errors.maintenanceFailure, "function", "需要稳定安全的拒绝原因");
const hidden = "secret-sample-private-memory";
assert.ok(!JSON.stringify(errors.maintenanceFailure(new Error(hidden))).includes(hidden));
assert.equal(errors.maintenanceFailure(new Error(hidden)).code, "MAINTENANCE_INTERNAL");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "love-maintainability-"));
try {
  const seed = commitCoreMemory(root, {
    expectedRevision: 0,
    operations: [
      {
        op: "record_memory",
        ref: "$m",
        coreId: "$a",
        content: "隔离偏好",
        kind: "preference",
        epistemic: "reported",
        importance: 3,
        reason: "测试",
        source: { kind: "conversation", reference: "fixture" },
      },
      { op: "create_core", ref: "$a", title: "偏好", summary: "隔离偏好", reason: "测试", evidenceIds: ["$m"] },
    ],
  });
  const context = maintenanceContext(readCoreMemory(root));
  const attempt = (proposal, ctx = context) => {
    try {
      saveMaintenanceProposal(root, "", { jobId: "a".repeat(64), context: ctx, proposal });
      assert.fail("Should reject");
    } catch (error) {
      assert.ok(error.code?.startsWith("MAINTENANCE_"));
      return errors.maintenanceFailure(error);
    }
  };
  assert.equal(attempt(null).code, "MAINTENANCE_INVALID_PROPOSAL");
  assert.equal(
    attempt({
      reason: "测试",
      operations: [{ op: "update_memory", id: seed.references.$m, content: hidden, reason: "测试" }],
    }).code,
    "MAINTENANCE_FORBIDDEN_OPERATION",
  );
  assert.equal(
    attempt({ reason: "测试", operations: [{ op: "archive", id: "self", reason: "测试" }] }).code,
    "MAINTENANCE_UNREAD_TARGET",
  );
  assert.equal(
    attempt({ reason: "测试", operations: [{ op: "archive", id: seed.references.$a, reason: "仍有孩子" }] }).code,
    "MAINTENANCE_PREVIEW_REJECTED",
  );
  const plan = {
    reason: "测试",
    operations: [{ op: "update_core", id: seed.references.$a, summary: "新摘要", reason: "测试" }],
  };
  assert.equal(attempt(plan, null).code, "MAINTENANCE_INCOMPLETE_CONTEXT");
  commitCoreMemory(root, {
    expectedRevision: 1,
    operations: [{ op: "update_memory", id: seed.references.$m, importance: 4, reason: "并发" }],
  });
  const changed = attempt(plan);
  assert.equal(changed.code, "MAINTENANCE_CONTEXT_CHANGED");
  assert.equal(changed.retryable, true);
  assert.ok(!JSON.stringify(changed).includes(hidden));
} finally {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  fs.rmSync(root, { recursive: true, force: true });
}
console.log("ok   维护契约一致、冻结、拒绝原因/阶段、未知异常脱敏、坏建议无核心副作用");
