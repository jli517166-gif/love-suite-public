#!/usr/bin/env node
/**
 * 自动 appraisal 自检：好感/信任不该永远停在 5。
 *
 *   node patches/verify-appraisal.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = process.env.LOVE_PLUGIN_DIR || path.resolve(here, "..");
const profile = process.env.DSH_PROFILE_DIR
  || path.join(process.env.DSH_HOME || path.join(os.homedir(), ".dsh"), "profiles", "desktop");
const asUrl = (p) => `file:///${p.replace(/\\/g, "/")}`;

const plugin = await import(`${asUrl(PLUGIN)}/index.js`);
const appraisal = await import(`${asUrl(PLUGIN)}/appraisal.js`);

const results = [];
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error?.message ?? error}`);
    failed += 1;
  }
}

function tempWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "love-appraisal-"));
  fs.mkdirSync(path.join(dir, "memory", "journal"), { recursive: true });
  return dir;
}

await check("正面信号识别：喜欢你 / 好可爱", () => {
  assert.equal(appraisal.appraise("我好喜欢你").delta, 1);
  assert.equal(appraisal.appraise("你今天好可爱").delta, 1);
});

await check("否定翻转：我不喜欢你 → 不动", () => {
  assert.equal(appraisal.appraise("我不喜欢你这样").delta, 0);
  assert.equal(appraisal.appraise("别滚").delta, 0);
});

await check("负面信号：滚 / 讨厌你", () => {
  assert.equal(appraisal.appraise("滚").delta, -1);
  assert.equal(appraisal.appraise("我讨厌你").delta, -1);
});

await check("表情注解里的「喜欢」不算（先剥标记）", () => {
  assert.equal(appraisal.appraise("[QQ表情:319 比心｜双手比心，喜欢/亲昵]").delta, 0);
  assert.equal(appraisal.appraise("<user_message>\n[QQ表情:14 微笑]\n</user_message>").delta, 0);
});

await check("中性话不乱判", () => {
  assert.equal(appraisal.appraise("今天几点下班").delta, 0);
  assert.equal(appraisal.appraise("").delta, 0);
});

await check("每日上限：+2 封顶", () => {
  const ws = tempWorkspace();
  try {
    const a = plugin.applyFeeling(ws, 1, "test");
    const b = plugin.applyFeeling(ws, 1, "test");
    const c = plugin.applyFeeling(ws, 1, "test");
    assert.equal(a.delta, 1);
    assert.equal(b.delta, 1);
    assert.equal(c.delta, 0, "第三天点应该封顶");
    assert.equal(c.relationship.affection, 7);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("阶段阈值", () => {
  assert.equal(plugin.stageOf(5), "初识");
  assert.equal(plugin.stageOf(21), "熟悉");
  assert.equal(plugin.stageOf(45), "亲近");
  assert.equal(plugin.stageOf(65), "心动");
  assert.equal(plugin.stageOf(81), "恋人");
});

await check("自动 appraisal：+1 落盘，冷却期内不重复", () => {
  const ws = tempWorkspace();
  try {
    const first = plugin.autoAppraise(ws, "我今天好喜欢你");
    assert.equal(first.delta, 1);
    const second = plugin.autoAppraise(ws, "真的好可爱");
    assert.equal(second, null, "15 分钟冷却内不应再来一次");
    const rel = JSON.parse(fs.readFileSync(path.join(ws, "memory", "relationship.json"), "utf8"));
    assert.equal(rel.affection, 6);
    assert.equal(rel.feeling_log.at(-1).delta, 1);
    assert.match(rel.feeling_log.at(-1).reason, /自动评估/);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("自动 appraisal：每日上限到了就不动", () => {
  const ws = tempWorkspace();
  try {
    plugin.applyFeeling(ws, 1, "手动加满");
    plugin.applyFeeling(ws, 1, "手动加满");
    const result = plugin.autoAppraise(ws, "喜欢你");
    assert.equal(result.delta, 0);
    assert.equal(result.reason, "daily-cap");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

console.log(results.join("\n"));
if (failed) {
  console.log(`\n${failed} 项没通过。`);
  process.exitCode = 1;
}
