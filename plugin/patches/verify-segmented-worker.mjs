import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as queue from "../reflection.js";
import { readCoreMemory, commitCoreMemory } from "../core-memory.js";
import { createReflectionWorker, reflectionInput } from "../reflection-worker.js";
import { segmentPlan } from "../reflection-segments.js";
import { apply as applyLiveFixture } from "./live-background-fixture.mjs";
const liveEvidence = await import("./material-live-evidence.mjs").catch(() => ({}));
assert.equal(typeof liveEvidence.completedMaterialRound, "function", "分段driver应区分主动阻止前台与真正模型失败");
const expectedDriver = {
  kind: "background-driver",
  code: 1,
  events: [{ type: "status", phase: "turn_end", reason: { kind: "blocked" } }],
  budget: { runs: [{ status: "staged" }] },
};
assert.equal(liveEvidence.completedMaterialRound(expectedDriver), true);
assert.equal(liveEvidence.completedMaterialRound({ ...expectedDriver, kind: "dialogue" }), false);
assert.equal(
  liveEvidence.completedMaterialRound({ ...expectedDriver, events: [...expectedDriver.events, { type: "tool_call" }] }),
  false,
);
assert.equal(
  liveEvidence.completedMaterialRound({ ...expectedDriver, budget: { runs: [{ status: "failed" }] } }),
  false,
);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "love-segment-worker-"));
const raw =
  "早段自述：我每周六早上跑步。" +
  "以下仅为无须记忆的天气观察背景。".repeat(520) +
  "后文更正：我改为仅周日夜班散步，下雨取消；不再周六跑步。";
let time = Date.UTC(2026, 10, 2),
  calls = 0;
function seed(ws, body = raw, groupId = "") {
  const events = [
    { type: "turn/start", seq: 0, time, data: { turn: 1 } },
    {
      type: "user/message",
      seq: 1,
      time,
      data: { id: "u", role: "user", source: { kind: "user" }, content: [{ type: "text", text: body }] },
    },
    { type: "turn/end", seq: 2, time, data: { turn: 1, reason: { kind: "completed" } } },
  ];
  queue.captureCompletedTurns(
    ws,
    {
      id: "s",
      firstLiveSeq: 0,
      requestHeader: () => ({ config: { provider: "fixture", model: "fixture" } }),
      snapshotEvents: (a, b) => events.filter((e) => e.seq >= a && e.seq < b),
    },
    events[2],
    { groupId },
  );
  return queue.listReflections(ws, groupId).jobs[0].id;
}
function note(input) {
  const items = [];
  for (const m of input.materials)
    for (const quote of ["早段自述：我每周六早上跑步。", "后文更正：我改为仅周日夜班散步，下雨取消；不再周六跑步。"])
      if (m.text.includes(quote)) items.push({ reference: m.reference, quote, meaning: quote });
  return { complete: true, items, reason: "逐段读完" };
}
const llm = {
  async prepareCall(config) {
    return {
      config,
      stream: async function* (options) {
        calls++;
        const input = JSON.parse(options.messages[0].content[0].text);
        assert.ok(Buffer.byteLength(options.system + options.messages[0].content[0].text) <= 24000);
        let out;
        if (input.segment) {
          out = note(input);
        } else {
          assert.equal(input.segmentNotes.complete, true);
          const quotes = input.segmentNotes.segments.flatMap((n) => n.items).map((i) => i.quote);
          assert.ok(
            quotes.some((q) => q.includes("周六早上跑步")) && quotes.some((q) => q.includes("不再周六跑步")),
            "合成必须看到早段和最后修正",
          );
          assert.ok(
            input.materials.every((m) => m.truncated),
            "摘录不能冒充模型读到了全文",
          );
          out = {
            operations: [
              {
                op: "record_memory",
                ref: "$m",
                coreId: "self",
                content: "测试者仅周日夜班散步，下雨取消；不再周六跑步。",
                kind: "fact",
                epistemic: "reported",
                importance: 3,
                reason: "后文明确更正",
                source: { kind: "conversation", reference: "s#u" },
              },
            ],
            reason: "读完全部段后统一修正",
          };
        }
        yield { type: "text-delta", text: JSON.stringify(out) };
        yield { type: "finish", reason: { kind: "stop" } };
      },
    };
  },
};
const worker = (ws, service = llm, extra = {}) =>
  createReflectionWorker({
    llm: () => service,
    scopes: () => [{ primary: ws, workspace: ws, groupId: "" }],
    config: () => ({ reflectionCooldownMinutes: 1, reflectionMaxCallsPerDay: 2 }),
    now: () => time,
    ...extra,
  });
try {
  const ws = path.join(root, "resume"),
    id = seed(ws);
  let w = worker(ws);
  await w.tick();
  assert.equal(calls, 1, "超单次输入的完整文字应进入第一段调用");
  assert.equal(readCoreMemory(ws).revision, 0, "未读完前禁止核心写入");
  assert.equal(queue.readReflection(ws, "", id).segmentation.notes.length, 1);
  assert.equal(queue.readReflection(ws, "", id).attempts, 0);
  const budgetFile = path.join(ws, "memory/reflection-worker.json"),
    budgetCrash = JSON.parse(fs.readFileSync(budgetFile));
  budgetCrash.runs.at(-1).status = "running";
  fs.writeFileSync(budgetFile, JSON.stringify(budgetCrash));
  const recoveredWorker = worker(ws);
  await recoveredWorker.tick();
  assert.equal(
    recoveredWorker.describe(ws).lastResult.status,
    "staged",
    "检查点已保存但预算尾写中断，要恢复为已分段而不是未确认",
  );
  await recoveredWorker.stop();
  await w.tick();
  assert.equal(calls, 1, "冷却不能绕过");
  await w.stop();
  w = worker(ws);
  time += 60001;
  await w.tick();
  assert.equal(queue.readReflection(ws, "", id).segmentation.notes.length, 2, "新worker续下一段");
  time += 60001;
  await w.tick();
  assert.equal(calls, 2, "共享每日预算阻止继续");
  time += 86400000;
  for (let n = 0; n < 10 && queue.readReflection(ws, "", id).status !== "done"; n++) {
    const before = queue.readReflection(ws, "", id).segmentation.notes.length;
    await w.tick();
    const job = queue.readReflection(ws, "", id);
    if (job.status !== "done") assert.equal(readCoreMemory(ws).revision, 0);
    assert.ok((job.segmentation?.notes.length ?? 0) >= before);
    time += 60001;
    if (w.describe(ws).dailyCalls >= 2) time += 86400000;
  }
  assert.equal(queue.readReflection(ws, "", id).status, "done");
  const core = readCoreMemory(ws);
  assert.equal(core.revision, 1);
  assert.equal(core.memories.length, 1);
  assert.match(core.memories[0].content, /下雨取消/);
  assert.equal(w.describe(ws).lastResult.materialRead.kind, "segmented-synthesis");
  const doneCalls = calls;
  await w.tick();
  assert.equal(calls, doneCalls);
  await w.stop();
  // A model unable to preserve a dense segment must park rather than truncate/retry forever.
  const blockedWs = path.join(root, "blocked"),
    blockedId = seed(blockedWs);
  const incomplete = {
    async prepareCall(config) {
      return {
        config,
        stream: async function* () {
          yield { type: "text-delta", text: JSON.stringify({ complete: false, items: [], reason: "无法完整表达" }) };
          yield { type: "finish", reason: { kind: "stop" } };
        },
      };
    },
  };
  const blocked = worker(blockedWs, incomplete);
  await blocked.tick();
  time += 60001;
  await blocked.tick();
  assert.equal(blocked.describe(blockedWs).dailyCalls, 1);
  assert.equal(queue.readReflection(blockedWs, "", blockedId).segmentation.blocked, true);
  assert.equal(readCoreMemory(blockedWs).revision, 0);
  await blocked.stop();
  // Interrupted model calls preserve confirmed checkpoints and still count their request.
  const cancelWs = path.join(root, "cancel"),
    cancelId = seed(cancelWs);
  let started;
  const ready = new Promise((r) => (started = r));
  const held = {
    async prepareCall(config) {
      return {
        config,
        stream: async function* (options) {
          started();
          await new Promise((r, j) =>
            options.signal.addEventListener("abort", () => j(options.signal.reason), { once: true }),
          );
        },
      };
    },
  };
  const cancelled = worker(cancelWs, held),
    pending = cancelled.tick();
  await ready;
  await cancelled.stop();
  await pending;
  assert.equal(queue.readReflection(cancelWs, "", cancelId).status, "needs_review");
  assert.equal(queue.readReflection(cancelWs, "", cancelId).attempts, 0);
  assert.equal(cancelled.describe(cancelWs).dailyCalls, 1);
  assert.equal(readCoreMemory(cancelWs).revision, 0);
  // A checkpoint write failure may retry that segment, but cannot advance or write core data.
  const ioWs = path.join(root, "checkpoint-io"),
    ioId = seed(ioWs),
    originalRename = fs.renameSync;
  let faultArmed = true;
  const ioLLM = {
    async prepareCall(config) {
      return {
        config,
        stream: async function* (options) {
          const value = note(JSON.parse(options.messages[0].content[0].text));
          if (faultArmed)
            fs.renameSync = function (from, ...args) {
              if (String(from).startsWith(queue.reflectionFile(ioWs) + ".")) {
                faultArmed = false;
                fs.renameSync = originalRename;
                throw Object.assign(new Error("private IO sentinel"), { code: "EIO" });
              }
              return originalRename.call(this, from, ...args);
            };
          yield { type: "text-delta", text: JSON.stringify(value) };
          yield { type: "finish", reason: { kind: "stop" } };
        },
      };
    },
  };
  const io = worker(ioWs, ioLLM);
  try {
    await io.tick();
  } finally {
    fs.renameSync = originalRename;
  }
  assert.equal(queue.readReflection(ioWs, "", ioId).segmentation, undefined);
  assert.equal(readCoreMemory(ioWs).revision, 0);
  assert.equal(io.describe(ioWs).dailyCalls, 1);
  assert.doesNotMatch(JSON.stringify(io.describe(ioWs)), /private IO sentinel/);
  time += 120001;
  await io.tick();
  assert.equal(queue.readReflection(ioWs, "", ioId).segmentation.notes.length, 1);
  await io.stop();
  // Group scope can be disabled between confirmed segments without reading another segment.
  const groupWs = path.join(root, "group-custom"),
    gid = "12345678",
    groupId = seed(groupWs, raw, gid);
  let groupEnabled = true;
  const group = worker(groupWs, llm, {
    scopes: () => [{ primary: root, workspace: groupWs, groupId: gid }],
    config: () => ({ groupMemoryEnabled: groupEnabled, reflectionCooldownMinutes: 1, reflectionMaxCallsPerDay: 24 }),
  });
  await group.tick();
  groupEnabled = false;
  time += 60001;
  const groupCalls = calls;
  await group.tick();
  assert.equal(calls, groupCalls);
  assert.equal(queue.readReflection(groupWs, gid, groupId).segmentation.notes.length, 1);
  assert.equal(readCoreMemory(groupWs).revision, 0);
  assert.equal(readCoreMemory(groupWs, gid).revision, 0);
  await group.stop();
  // Final synthesis uses the original source receipt AND a fresh optimistic core revision.
  for (const emptyFinal of [false, true]) {
    const staleWs = path.join(root, emptyFinal ? "stale-empty-final" : "stale-final"),
      staleId = seed(staleWs);
    let changed = false;
    const staleLLM = {
      async prepareCall(config) {
        return {
          config,
          stream: async function* (options) {
            const value = JSON.parse(options.messages[0].content[0].text);
            if (value.segment) {
              yield { type: "text-delta", text: JSON.stringify(note(value)) };
            } else {
              if (!changed) {
                changed = true;
                commitCoreMemory(
                  staleWs,
                  {
                    expectedRevision: 0,
                    operations: [
                      {
                        op: "record_memory",
                        ref: "$other",
                        coreId: "self",
                        content: "另一次独立修改",
                        kind: "fact",
                        epistemic: "reported",
                        importance: 1,
                        reason: "concurrent fixture",
                        source: { kind: "conversation", reference: "other#u" },
                      },
                    ],
                  },
                  { sessionId: "other" },
                );
              }
              yield {
                type: "text-delta",
                text: JSON.stringify({
                  operations: emptyFinal
                    ? []
                    : [
                        {
                          op: "record_memory",
                          ref: "$m",
                          coreId: "self",
                          content: "最终笔记",
                          kind: "fact",
                          epistemic: "reported",
                          importance: 1,
                          reason: "fixture",
                          source: { kind: "conversation", reference: "s#u" },
                        },
                      ],
                  reason: "合成",
                }),
              };
            }
            yield { type: "finish", reason: { kind: "stop" } };
          },
        };
      },
    };
    const stale = worker(staleWs, staleLLM, {
      config: () => ({ reflectionCooldownMinutes: 1, reflectionMaxCallsPerDay: 24 }),
    });
    for (let n = 0; n < 10 && !changed; n++) {
      await stale.tick();
      time += 120001;
    }
    assert.equal(changed, true);
    assert.equal(readCoreMemory(staleWs).memories.length, 1, "并发修订导致最终提交拒绝");
    assert.equal(queue.readReflection(staleWs, "", staleId).status, "needs_review");
    const completeJob = queue.readReflection(staleWs, "", staleId);
    const manual = queue.claimReflectionReview(staleWs, { jobId: staleId }, { now: time });
    assert.throws(
      () =>
        queue.completeReflection(
          staleWs,
          {
            jobId: staleId,
            leaseToken: manual.leaseToken,
            segmentDigest: completeJob.materialArchive.digest,
            operations: [],
            reason: "fake final",
          },
          { now: time },
        ),
      /readToken/,
      "最终合成即使空结果也必须完整凭据",
    );
    queue.releaseReflection(
      staleWs,
      { jobId: staleId, leaseToken: manual.leaseToken, reason: "return" },
      { now: time },
    );
    await stale.stop();
  }
  // Reserve the largest allowed notes before spending any requests, not just empty notes.
  const reservedWs = path.join(root, "reserve-notes"),
    reservedId = seed(reservedWs);
  commitCoreMemory(reservedWs, {
    expectedRevision: 0,
    operations: [
      {
        op: "record_memory",
        ref: "$e",
        coreId: "self",
        content: "已有依据",
        kind: "fact",
        importance: 1,
        reason: "fixture",
        epistemic: "reported",
        source: { kind: "conversation", reference: "existing#u" },
      },
      ...Array.from({ length: 12 }, (_, i) => ({
        op: "create_core",
        ref: "$c" + i,
        title: "已有核心" + i,
        summary: "上下文".repeat(80),
        reason: "fixture",
        evidenceIds: ["$e"],
      })),
    ],
  });
  const reservedJob = queue.readReflection(reservedWs, "", reservedId),
    reservedPlan = segmentPlan(reservedJob.materialArchive);
  const emptyInput = reflectionInput(
    { workspace: reservedWs, groupId: "" },
    {
      ...reservedJob,
      materials: reservedJob.materialArchive.materials.map((m) => ({ ...m, text: "", truncated: true })),
      segmentNotes: { complete: false, segments: [] },
    },
  );
  const emptyBytes = Buffer.byteLength(emptyInput.system + emptyInput.text);
  assert.ok(
    emptyBytes < 24000 && emptyBytes + reservedPlan.segments.length * 1220 > 24000,
    "夹具应能装下空笔记，却装不下最大合法笔记",
  );
  const reserved = worker(reservedWs),
    reserveCalls = calls;
  await reserved.tick();
  assert.equal(calls, reserveCalls, "开始分段前必须为全部笔记预留合成空间");
  assert.equal(reserved.describe(reservedWs).dailyCalls, 0);
  assert.equal(queue.readReflection(reservedWs, "", reservedId).segmentation.blocked, true);
  assert.match(queue.readReflection(reservedWs, "", reservedId).lastError, /合成|笔记/);
  await reserved.stop();
  // Newly relevant large memories can change the final selection after checkpoints.
  const growthWs = path.join(root, "final-context-growth"),
    growthId = seed(growthWs);
  const growth = worker(growthWs, llm, {
    config: () => ({ reflectionCooldownMinutes: 1, reflectionMaxCallsPerDay: 24 }),
  });
  const total = segmentPlan(queue.readReflection(growthWs, "", growthId).materialArchive).segments.length;
  for (let i = 0; i < total; i++) {
    await growth.tick();
    time += 120001;
  }
  assert.equal(readCoreMemory(growthWs).revision, 0);
  const growthBefore = growth.describe(growthWs).dailyCalls;
  commitCoreMemory(growthWs, {
    expectedRevision: 0,
    operations: Array.from({ length: 9 }, (_, i) => ({
      op: "record_memory",
      ref: "$e" + i,
      coreId: "self",
      content: i < 5 ? "周六周日跑步散步".repeat(250) + i : "新近简短记录" + i,
      kind: "fact",
      importance: 1,
      reason: "fixture",
      epistemic: "reported",
      source: { kind: "conversation", reference: "old#" + i },
    })),
  });
  await growth.tick();
  assert.equal(growth.describe(growthWs).dailyCalls, growthBefore, "最终上下文超限应停放，不能再调用合成模型");
  const grown = queue.readReflection(growthWs, "", growthId);
  assert.equal(grown.segmentation.notes.length, total);
  assert.equal(grown.segmentation.blocked, true);
  assert.equal(grown.attempts, 0);
  assert.equal(grown.outcome, undefined);
  assert.match(grown.lastError, /人工补读/);
  await growth.stop();
  // The live segmented driver must never let a foreground model claim other batches.
  const liveRoot = fs.mkdtempSync(path.join(os.tmpdir(), "love-live-background-")),
    oldLiveRoot = process.env.LOVE_LIVE_TEST_ROOT;
  try {
    const liveWs = path.join(liveRoot, "workspace");
    seed(liveWs);
    fs.writeFileSync(
      path.join(liveRoot, "fixture.json"),
      JSON.stringify({ format: "love-live-background-fixture", workspace: liveWs, mode: "segmented" }),
    );
    process.env.LOVE_LIVE_TEST_ROOT = liveRoot;
    let listener,
      foreground = false;
    const dispose = applyLiveFixture({
      llm,
      on: (event, fn) => {
        listener = fn;
        return () => {};
      },
    });
    const result = await listener({ agent: { session: { header: { cwd: liveWs } } } }, async () => {
      foreground = true;
      return { kind: "enter", messages: [] };
    });
    assert.equal(foreground, false, "隔离分段driver必须在后台tick后阻止前台模型操作");
    assert.equal(result.kind, "reject");
    assert.equal(readCoreMemory(liveWs).revision, 0);
    await dispose();
  } finally {
    if (oldLiveRoot === undefined) delete process.env.LOVE_LIVE_TEST_ROOT;
    else process.env.LOVE_LIVE_TEST_ROOT = oldLiveRoot;
    assert.equal(path.dirname(liveRoot), path.resolve(os.tmpdir()));
    fs.rmSync(liveRoot, { recursive: true, force: true });
  }
  const bigWs = path.join(root, "too-big"),
    bigId = seed(bigWs, "字".repeat(18000)),
    before = calls,
    big = worker(bigWs);
  await big.tick();
  assert.equal(calls, before);
  assert.equal(queue.readReflection(bigWs, "", bigId).attempts, 0);
  await big.stop();
  console.log("ok   分段检查点/重启续读、共享预算/冷却/跨日、最终统一提交及取消/不完整笔记停放");
} finally {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  fs.rmSync(root, { recursive: true, force: true });
}
