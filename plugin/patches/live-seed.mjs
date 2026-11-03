/** Validate model-authored snapshot provenance without assuming a fixed number of commits. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { validateCoreMemory } from "../core-memory.js";
export function loadLiveSeed(reportFile) {
  const file = fs.realpathSync(path.resolve(reportFile)),
    root = path.dirname(file);
  if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) || !path.basename(root).startsWith("love-live-maintenance-"))
    throw new Error("seed-report必须来自隔离前台验收");
  const report = JSON.parse(fs.readFileSync(file, "utf8")),
    revision = report.rounds?.[0]?.memoryRevision;
  if (
    report.format !== "love-live-maintenance-dialogue" ||
    report.evaluation?.structuredChecksPassed !== true ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    throw new Error("前台验收报告未通过结构检查");
  const snapshot = path.join(root, "workspace", "memory", "core-memory-history", revision + ".json");
  if (fs.realpathSync(snapshot) !== snapshot) throw new Error("隔离快照实际路径不符");
  const seed = fs.readFileSync(snapshot),
    store = validateCoreMemory(JSON.parse(seed));
  const sha256 = createHash("sha256").update(seed).digest("hex");
  if (store.revision !== revision || report.rounds?.[1]?.beforeHash !== sha256)
    throw new Error("Fixture does not match actual model-authored first round");
  return { report, seed, revision, sha256 };
}
