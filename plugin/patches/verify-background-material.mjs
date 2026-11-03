import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as queue from "../reflection.js";
import { readCoreMemory } from "../core-memory.js";
import { createReflectionWorker } from "../reflection-worker.js";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "love-background-material-"));
const route = { provider: "fixture", model: "fixture" };
let time = Date.UTC(2026, 10, 2),
  calls = 0;
const text = "这是需要完整阅读的背景。".repeat(370) + "末尾明确：仅在夜班喝无糖麦茶，不喝含糖饮料。";
function seed(ws, id, body = text, groupId = "", attachment = false) {
  const events = [
    { type: "turn/start", seq: 0, time, data: { turn: 1 } },
    {
      type: "user/message",
      seq: 1,
      time,
      data: {
        id: "u",
        role: "user",
        source: { kind: "user" },
        content: [{ type: "text", text: body }, ...(attachment ? [{ type: "image", url: "fixture-image" }] : [])],
      },
    },
    { type: "turn/end", seq: 2, time, data: { turn: 1, reason: { kind: "completed" } } },
  ];
  queue.captureCompletedTurns(
    ws,
    {
      id,
      firstLiveSeq: 0,
      requestHeader: () => ({ config: route }),
      snapshotEvents: (from, to) => events.filter((e) => e.seq >= from && e.seq < to),
    },
    events[2],
    { groupId },
  );
  return queue.listReflections(ws, groupId).jobs.find((job) => job.sessionId === id).id;
}
const worker = (ws, service, extra = {}) =>
  createReflectionWorker({
    llm: () => service,
    scopes: () => [{ primary: ws, workspace: ws, groupId: "" }],
    config: () => ({}),
    now: () => time,
    ...extra,
  });
const llm = {
  async prepareCall(config) {
    return {
      config,
      stream: async function* (options) {
        calls++;
        const input = JSON.parse(options.messages[0].content[0].text);
        assert.ok(input.materials[0].text.endsWith("末尾明确：仅在夜班喝无糖麦茶，不喝含糖饮料。"));
        assert.equal(input.materials[0].truncated, false);
        assert.ok(Buffer.byteLength(options.system + options.messages[0].content[0].text) <= 24000);
        yield {
          type: "text-delta",
          text: JSON.stringify({
            operations: [
              {
                op: "record_memory",
                ref: "$m",
                coreId: "self",
                content: "测试者仅在夜班喝无糖麦茶，不喝含糖饮料。",
                kind: "preference",
                epistemic: "reported",
                importance: 3,
                reason: "全文末尾明确",
                source: { kind: "conversation", reference: input.materials[0].reference },
              },
            ],
            reason: "已读全文并保留末尾条件/否定",
          }),
        };
        yield { type: "finish", reason: { kind: "stop" } };
      },
    };
  },
};
try {
  const ws = path.join(root, "long");
  const id = seed(ws, "long-session");
  assert.equal(queue.readReflection(ws, "", id).status, "needs_review");
  assert.equal(queue.claimReflection(ws).job, null, "默认前台next语义不变");
  const run = worker(ws, llm);
  await run.tick();
  assert.equal(calls, 1, "完整长文字在预算内应自动顺序补读后调用一次");
  assert.equal(readCoreMemory(ws).memories[0].content, "测试者仅在夜班喝无糖麦茶，不喝含糖饮料。");
  assert.equal(queue.readReflection(ws, "", id).status, "done");
  assert.ok(run.describe(ws).lastResult.materialRead.pages > 1);
  assert.equal(run.describe(ws).lastResult.materialRead.kind, "full-archive");
  assert.equal(run.describe(ws).dailyCalls, 1);
  await run.tick();
  assert.equal(calls, 1);
  await run.stop();
  for (const [name, body, attachment] of [
    ["too-big", "字".repeat(18000), false],
    ["attachment", text, true],
  ]) {
    const dir = path.join(root, name),
      jobId = seed(dir, name, body, "", attachment),
      before = calls,
      w = worker(dir, llm);
    await w.tick();
    await w.tick();
    assert.equal(calls, before);
    assert.equal(w.describe(dir).dailyCalls, 0);
    assert.equal(queue.readReflection(dir, "", jobId).attempts, 0);
    assert.equal(queue.readReflection(dir, "", jobId).status, "needs_review");
    await w.stop();
  }
  const oldWs = path.join(root, "old"),
    oldId = seed(oldWs, "old");
  const file = queue.reflectionFile(oldWs),
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  delete state.jobs[0].materialArchive;
  fs.writeFileSync(file, JSON.stringify(state));
  const oldWorker = worker(oldWs, llm);
  await oldWorker.tick();
  assert.equal(queue.readReflection(oldWs, "", oldId).attempts, 0);
  await oldWorker.stop();
  const groupWs = path.join(root, "group"),
    gid = "12345678";
  seed(groupWs, "qq-group-" + gid, text, gid);
  const groupWorker = worker(groupWs, llm, { scopes: () => [{ primary: groupWs, workspace: groupWs, groupId: gid }] });
  await groupWorker.tick();
  assert.equal(readCoreMemory(groupWs).memories.length, 0);
  assert.equal(readCoreMemory(groupWs, gid).memories.length, 1);
  await groupWorker.stop();
  const cancelledWs = path.join(root, "cancelled"),
    cancelledId = seed(cancelledWs, "cancelled");
  let started;
  const ready = new Promise((resolve) => (started = resolve));
  const held = {
    async prepareCall(config) {
      return {
        config,
        stream: async function* (options) {
          started();
          await new Promise((resolve, reject) =>
            options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }),
          );
        },
      };
    },
  };
  const cancelled = worker(cancelledWs, held),
    inflight = cancelled.tick();
  await ready;
  await cancelled.stop();
  await inflight;
  assert.equal(
    queue.readReflection(cancelledWs, "", cancelledId).status,
    "needs_review",
    "取消补读批次须返回待补读而不是普通pending",
  );
  assert.equal(queue.readReflection(cancelledWs, "", cancelledId).attempts, 0);
  assert.equal(readCoreMemory(cancelledWs).revision, 0);
  assert.equal(cancelled.describe(cancelledWs).dailyCalls, 1, "已启动模型的取消仍保留预算");
  console.log("ok   完整归档顺序补读、末尾条件/否定、一次预算/收据、防超限/附件/缺失误处理、群隔离");
} finally {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  fs.rmSync(root, { recursive: true, force: true });
}
