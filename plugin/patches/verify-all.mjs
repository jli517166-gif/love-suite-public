#!/usr/bin/env node
/**
 * 一把梭自检：包完整性 + 灵魂 + appraisal + 表情。
 *
 *   node patches/verify-all.mjs
 *
 * 任何一项红了就停下，退出码非 0。改完插件跑一遍再重启，能挡掉「一重启就坏」。
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Full verification is a developer command. Missing tools must not masquerade as green UI checks.
for (const dependency of ['react', 'react-dom/client', 'jsdom', 'acorn', 'eslint-scope', 'esbuild']) {
  try { await import(dependency); }
  catch { console.error('完整自检缺开发依赖，请在仓库根运行 npm ci：' + dependency); process.exit(1); }
}
const suites = [
  ["material-privacy", "verify-material-privacy.mjs"],
  ["memory-boundaries", "verify-memory-boundaries.mjs"],
  ["reflection-guidance", "verify-reflection-guidance.mjs"],
  ["maintainability", "verify-maintainability.mjs"],
  ["maintenance-storage", "verify-maintenance-storage.mjs"],
  ["background-material", "verify-background-material.mjs"],
  ["reflection-segments", "verify-reflection-segments.mjs"],
  ["segmented-worker", "verify-segmented-worker.mjs"],
  ["architecture", "verify-architecture.mjs"],
  ["client-build", "verify-client-build.mjs"],
  ["deployment", "verify-deployment.mjs"],
  ["live-seed", "verify-live-seed.mjs"],
  ["package", "verify-package.mjs"],
  ["packed-install", "verify-packed-install.mjs"],
  ["core-memory", "verify-core-memory.mjs"],
  ["memory-evolution", "verify-memory-evolution.mjs"],
  ["memory-quality", "verify-memory-quality.mjs"],
  ["memory-migration", "verify-memory-migration.mjs"],
  ["memory-maintenance", "verify-memory-maintenance.mjs"],
  ["maintenance-proposals", "verify-maintenance-proposals.mjs"],
  ["compat-memory", "verify-compat-memory.mjs"],
  ["reflection", "verify-reflection.mjs"],
  ["reflection-health", "verify-reflection-health.mjs"],
  ["reflection-management", "verify-reflection-management.mjs"],
  ["reflection-ui", "verify-reflection-ui.mjs"],
  ["reflection-worker", "verify-reflection-worker.mjs"],
  ["retrieval", "verify-retrieval.mjs"],
  ["memory-search", "verify-memory-search.mjs"],
  ["mood", "verify-mood.mjs"],
  ["soul", "verify-soul.mjs"],
  ["appraisal", "verify-appraisal.mjs"],
  ["emoji", "verify-emoji.mjs"],
  ["client", "verify-client-render.mjs"],
  ["ui", "verify-ui-e2e.mjs"],
  ["api", "verify-api.mjs"],
];

let failed = 0;
for (const [name, file] of suites) {
  console.log(`\n===== ${name} =====`);
  const result = spawnSync(process.execPath, [path.join(here, file)], { stdio: "inherit" });
  if (result.status !== 0) {
    failed += 1;
    console.log(`✗ ${name} 没过`);
  }
}

if (failed) {
  console.log(`\n${failed} 组没过，先修再重启。`);
  process.exitCode = 1;
} else {
  console.log("\n全部通过。");
}
