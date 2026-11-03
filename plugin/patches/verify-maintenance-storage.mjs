import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  readMaintenanceProposals,
  maintenanceProposalFile,
  maintenanceContext,
  saveMaintenanceProposal,
} from "../maintenance-proposals.js";
import { commitCoreMemory, readCoreMemory } from "../core-memory.js";
import { maintenanceFailure } from "../maintenance-errors.js";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "love-storage-diagnostics-"));
const file = maintenanceProposalFile(root),
  valid = JSON.stringify({ format: "love-maintenance-proposals", schemaVersion: 1, items: [] });
const fault = (method, code, action) => {
  const original = fs[method];
  try {
    fs[method] = function (target, ...args) {
      if (String(target) === file) throw Object.assign(new Error("PRIVATE_PATH_TOKEN_TEXT"), { code });
      return original.call(this, target, ...args);
    };
    return action();
  } finally {
    fs[method] = original;
  }
};
const classify = (action) => {
  try {
    action();
    assert.fail("must reject");
  } catch (error) {
    return maintenanceFailure(error);
  }
};
try {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, valid);
  for (const method of ["statSync", "readFileSync"])
    for (const code of ["EACCES", "EIO"]) {
      const result = fault(method, code, () => classify(() => readMaintenanceProposals(root)));
      assert.equal(result.code, "MAINTENANCE_STORAGE_FAILED", method + ":" + code + "应提示访问/磁盘问题");
      assert.equal(result.stage, "storage");
      assert.equal(result.retryable, true);
      assert.match(result.reason, /权限|访问/);
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PATH_TOKEN_TEXT/);
    }
  assert.equal(fault("statSync", "ENOENT", () => readMaintenanceProposals(root)).total, 0);
  assert.equal(
    fault("readFileSync", "ENOENT", () => classify(() => readMaintenanceProposals(root))).code,
    "MAINTENANCE_STORAGE_FAILED",
    "stat后文件消失不能冒充空库",
  );
  assert.equal(fs.readFileSync(file, "utf8"), valid);
  for (const text of ["bad-json", "{}"]) {
    fs.writeFileSync(file, text);
    const result = classify(() => readMaintenanceProposals(root));
    assert.equal(result.code, "MAINTENANCE_STORAGE_INVALID");
    assert.equal(result.retryable, false);
    assert.equal(fs.readFileSync(file, "utf8"), text);
  }
  fs.writeFileSync(file, valid);
  const seeded = commitCoreMemory(root, {
    expectedRevision: 0,
    operations: [
      {
        op: "record_memory",
        ref: "$m",
        coreId: "$c",
        content: "隔离测试依据",
        kind: "fact",
        epistemic: "reported",
        importance: 3,
        reason: "测试",
        source: { kind: "conversation", reference: "fixture" },
      },
      { op: "create_core", ref: "$c", title: "测试", summary: "测试", reason: "测试", evidenceIds: ["$m"] },
    ],
  });
  const input = {
    jobId: "a".repeat(64),
    context: maintenanceContext(readCoreMemory(root)),
    proposal: {
      reason: "测试",
      operations: [{ op: "update_core", id: seeded.references.$c, summary: "测试新摘要", reason: "测试" }],
    },
  };
  for (const method of ["mkdirSync", "writeFileSync", "renameSync"]) {
    const original = fs[method];
    try {
      fs[method] = function (target, ...args) {
        if (method === "mkdirSync" ? String(target) === path.dirname(file) : String(target).startsWith(file + "."))
          throw Object.assign(new Error("PRIVATE_PATH_TOKEN_TEXT"), {
            code: method === "writeFileSync" ? "ENOSPC" : "EACCES",
          });
        return original.call(this, target, ...args);
      };
      const result = classify(() => saveMaintenanceProposal(root, "", input));
      assert.equal(result.code, "MAINTENANCE_STORAGE_FAILED");
      assert.equal(result.retryable, true);
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PATH_TOKEN_TEXT/);
    } finally {
      fs[method] = original;
    }
    assert.equal(fs.readFileSync(file, "utf8"), valid);
    assert.equal(readCoreMemory(root).revision, 1);
  }
  console.log("ok   建议文件stat/read权限与磁盘错误、ENOENT竞争、JSON/schema错误准确分类且不改文件");
} finally {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  fs.rmSync(root, { recursive: true, force: true });
}
