import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { readCoreMemory } from "../core-memory.js";
const helper = await import("./live-seed.mjs").catch(() => ({}));
assert.equal(typeof helper.loadLiveSeed, "function", "真实快照必须按实际首轮版本选择，不能固定revision1");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "love-live-maintenance-seed-"));
try {
  const store = readCoreMemory(path.join(root, "workspace"));
  store.revision = 3;
  const seed = JSON.stringify(store),
    sha256 = createHash("sha256").update(seed).digest("hex");
  fs.mkdirSync(path.join(root, "workspace/memory/core-memory-history"), { recursive: true });
  fs.writeFileSync(path.join(root, "workspace/memory/core-memory-history/3.json"), seed);
  const report = {
    format: "love-live-maintenance-dialogue",
    evaluation: { structuredChecksPassed: true },
    rounds: [{ memoryRevision: 3 }, { beforeHash: sha256 }],
  };
  const file = path.join(root, "dialogue.json");
  fs.writeFileSync(file, JSON.stringify(report));
  assert.equal(helper.loadLiveSeed(file).revision, 3);
  assert.equal(helper.loadLiveSeed(file).sha256, sha256);
  report.rounds[1].beforeHash = "bad";
  fs.writeFileSync(file, JSON.stringify(report));
  assert.throws(() => helper.loadLiveSeed(file), /match/);
  report.evaluation.structuredChecksPassed = false;
  fs.writeFileSync(file, JSON.stringify(report));
  assert.throws(() => helper.loadLiveSeed(file), /未通过/);
  assert.throws(() => helper.loadLiveSeed(new URL("../package.json", import.meta.url)), /path|隔离|type/i);
  console.log("ok   真实验收快照按实际首轮版本、hash校验、失败报告/非隔离路径拒绝");
} finally {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  fs.rmSync(root, { recursive: true, force: true });
}
