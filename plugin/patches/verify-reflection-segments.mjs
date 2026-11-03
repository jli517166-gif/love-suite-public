import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { coreBatchDigest, readCoreMemory } from "../core-memory.js";
import * as queue from "../reflection.js";
const protocol = await import("../reflection-segments.js").catch(() => ({}));
assert.equal(typeof protocol.segmentPlan, "function", "需要有界分段协议");
const material = (text, reference = "session#u") => ({ reference, role: "user", seq: 1, text, truncated: false });
const archive = (materials) => ({ materials, complete: true, reason: "fixture", digest: coreBatchDigest(materials) });
const raw = "条件🙂和否定：".repeat(1100) + "最后修正：仅周日夜班喝无糖麦茶，雨天取消，不喝含糖饮料。";
const source = archive([material(raw)]),
  plan = protocol.segmentPlan(source);
assert.ok(plan.segments.length > 1 && plan.segments.length <= 8);
assert.deepEqual(protocol.segmentPlan(source), plan);
const parts = plan.segments.flatMap((s) => s.materials);
assert.equal(parts.map((p) => p.text.slice(p.start - p.overlapStart)).join(""), raw, "新增覆盖不遗漏或重复");
assert.ok(
  parts.every((p) => !p.text.includes("\ufffd") && Buffer.byteLength(JSON.stringify({ materials: [p] })) <= 8000),
);
assert.ok(parts.slice(1).every((p) => p.start > p.overlapStart));
assert.equal(protocol.segmentPlan(archive([material("字".repeat(18000))])), null);
assert.equal(protocol.segmentPlan({ ...source, complete: false }), null);
const tiny = archive(Array.from({ length: 100 }, (_, i) => material("短消息" + i, "s#" + i)));
assert.ok(protocol.segmentPlan(tiny).segments.length <= 8, "小来源合装，不能每条创建一次请求");
const segment = plan.segments[0];
const good = {
  complete: true,
  items: [{ reference: "session#u", quote: "条件🙂和否定：", meaning: "背景并非事实" }],
  reason: "完整阅读本段",
};
assert.deepEqual(protocol.validateSegmentNote(good, segment), good);
for (const bad of [
  { ...good, complete: false },
  { ...good, items: [{ ...good.items[0], quote: "捏造原文" }] },
  { ...good, items: [{ ...good.items[0], reference: "other#u" }] },
  { ...good, items: [{ ...good.items[0], meaning: "字".repeat(800) }] },
  { ...good, operations: [] },
])
  assert.throws(() => protocol.validateSegmentNote(bad, segment));
const progress = {
  format: "love-segment-progress",
  schemaVersion: 1,
  digest: plan.digest,
  notes: [good],
  blocked: false,
};
protocol.validateSegmentProgress(progress, source);
assert.throws(() => protocol.validateSegmentProgress({ ...progress, digest: "0".repeat(64) }, source));
assert.throws(() => protocol.validateSegmentProgress({ ...progress, notes: Array(9).fill(good) }, source));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "love-segment-protocol-"));
try {
  const events = [
    { type: "turn/start", seq: 0, time: 1, data: { turn: 1 } },
    {
      type: "user/message",
      seq: 1,
      data: { id: "u", role: "user", source: { kind: "user" }, content: [{ type: "text", text: raw }] },
    },
    { type: "turn/end", seq: 2, time: 1, data: { turn: 1, reason: { kind: "completed" } } },
  ];
  queue.captureCompletedTurns(
    root,
    { id: "session", firstLiveSeq: 0, snapshotEvents: (a, b) => events.filter((e) => e.seq >= a && e.seq < b) },
    events[2],
  );
  const id = queue.listReflections(root).jobs[0].id;
  const claim = () => queue.claimReflectionReview(root, { jobId: id }, { now: 100 });
  let lease = claim();
  assert.throws(() =>
    queue.saveReflectionSegment(root, { jobId: id, leaseToken: lease.leaseToken, index: 1, note: good }, { now: 101 }),
  );
  assert.throws(() =>
    queue.saveReflectionSegment(root, { jobId: id, leaseToken: "wrong", index: 0, note: good }, { now: 101 }),
  );
  const checkpoint = queue.saveReflectionSegment(
    root,
    { jobId: id, leaseToken: lease.leaseToken, index: 0, note: good, nextAttemptAt: 150 },
    { now: 101 },
  );
  assert.equal(checkpoint.status, "needs_review");
  assert.equal(queue.readReflection(root, "", id).attempts, 0);
  assert.equal(readCoreMemory(root).revision, 0);
  const detail = queue.reflectionDetail(queue.readReflection(root, "", id));
  assert.equal(detail.segmentProgress.completed, 1);
  assert.equal(detail.segmentation, undefined, "公开详情不能暴露中间notes");
  assert.equal(JSON.stringify(queue.listReflections(root)).includes("背景并非事实"), false);
  lease = claim();
  queue.releaseReflection(root, { jobId: id, leaseToken: lease.leaseToken, reason: "cancel" }, { now: 101 });
  assert.equal(queue.readReflection(root, "", id).segmentation.notes.length, 1, "取消保留已确认进度");
  lease = claim();
  queue.saveReflectionSegment(
    root,
    { jobId: id, leaseToken: lease.leaseToken, index: 1, blockedReason: "本段无法完整概括" },
    { now: 101 },
  );
  assert.equal(queue.readReflection(root, "", id).segmentation.blocked, true);
  assert.equal(readCoreMemory(root).revision, 0);
  const file = queue.reflectionFile(root),
    saved = JSON.parse(fs.readFileSync(file));
  saved.jobs[0].segmentation.digest = "0".repeat(64);
  fs.writeFileSync(file, JSON.stringify(saved));
  assert.throws(() => queue.listReflections(root), "损坏进度不能重置为新任务");
  console.log("ok   有界Unicode分段/覆盖/重叠、逐段引用验证、持久检查点/租约/取消/阻断和公开脱敏");
} finally {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  fs.rmSync(root, { recursive: true, force: true });
}
