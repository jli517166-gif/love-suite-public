#!/usr/bin/env node
/**
 * 自检：确认「QQ 表情手册」这一路是通的。
 *
 *   node patches/verify-emoji.mjs
 *
 * 检查四件事：
 *   1) 手册能读到、条数够、关键含义没错（微笑 ≠ 开心）
 *   2) 通道补丁在岗（`[QQ表情:id]` 能渲染出来）
 *   3) 插件把标记注解成「名称｜含义」，且幂等
 *   4) `love_emoji` 工具与 pre-step 接缝能挂上、只对 love 工作区生效
 *
 * 只读，不改任何文件。退出码 0 = 全过。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.LOVE_TEST_ISOLATED = "1";

const LOVE = fs.mkdtempSync(path.join(os.tmpdir(), "love-emoji-love-"));
const OTHER = fs.mkdtempSync(path.join(os.tmpdir(), "love-emoji-other-"));

function profileDir() {
  if (process.env.DSH_PROFILE_DIR) return process.env.DSH_PROFILE_DIR;
  const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  return path.join(home, "profiles", "desktop");
}

const profile = profileDir();
const pluginDir = process.env.LOVE_PLUGIN_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cqFile = path.join(profile, "node_modules", "dsh-onebot-qq", "lib", "cq.js");

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

const emoji = await import(`file:///${pluginDir.replace(/\\/g, "/")}/emoji.js`);
const plugin = await import(`file:///${pluginDir.replace(/\\/g, "/")}/index.js`);
let cq = null;
try { cq = await import(`file:///${cqFile.replace(/\\/g, "/")}`); } catch {}

await check("手册可读、条数 300+", () => {
  assert.ok(emoji.faceCount() >= 300, `count=${emoji.faceCount()}`);
});

await check("关键含义正确（微笑=礼貌/疏远，不是开心）", () => {
  assert.match(emoji.gloss("14"), /微笑｜礼貌/);
  assert.match(emoji.gloss("452"), /微笑/);
  assert.match(emoji.gloss("179"), /doge｜狗头/);
});

await check("用户实际发过的 318/319 解码正确", () => {
  assert.match(emoji.gloss("318"), /318 崇拜/);
  assert.match(emoji.gloss("319"), /319 比心/);
});

await check("未收录 id 有兜底", () => {
  assert.match(emoji.annotateMarkers("[QQ表情:9999]").text, /未收录/);
});

await check("注解幂等（跑两遍不会重复套娃）", () => {
  const once = emoji.annotateMarkers("[QQ表情:14]").text;
  assert.equal(emoji.annotateMarkers(once).text, once);
});

if (cq) {
  await check("通道补丁在岗（face → [QQ表情:id]）", () => {
    assert.equal(cq.parseMessage([{ type: "face", data: { id: "14" } }], "").text, "[QQ表情:14]");
  });

  await check("mface 带表情包名字", () => {
    assert.equal(cq.parseMessage([{ type: "mface", data: { summary: "[汪汪]" } }], "").text, "[QQ表情包:汪汪]");
  });
}

await check("apply() 挂上 pre-step 与 love_emoji", async () => {
  const listeners = new Map();
  const tools = new Map();
  const ctx = {
    tools: { register: tool => (tools.set(tool.name, tool), () => tools.delete(tool.name)) },
    logger: { info() {}, warn() {} },
    on: (name, listener) => (listeners.set(name, listener), () => listeners.delete(name)),
  };
  await plugin.apply(ctx, { enabled: true, workspace: LOVE, workspaces: [LOVE], proactiveEnabled: false });
  assert.equal(typeof listeners.get("agent/pre-step"), "function");
  assert.ok(tools.has("love_emoji"));
  globalThis.__verify = { hook: listeners.get("agent/pre-step"), tools, ctx };
});

/** 复刻 DSH 的真实条件：createUserMessage 出来的消息是 deepFreeze 的。 */
function frozenUserMessage(text) {
  const part = Object.freeze({ type: "text", text });
  const message = Object.freeze({ id: "msg-1", role: "user", content: Object.freeze([part]) });
  return message;
}

await check("love 工作区自动注解（消息是冻结的也不炸）", async () => {
  const { hook } = globalThis.__verify;
  const original = frozenUserMessage('<user_message qq="1">\n亲切[QQ表情:319]\n</user_message>');
  const decision = { kind: "enter", messages: Object.freeze([original]) };
  const out = await hook({ agent: { session: { header: { cwd: LOVE } } } }, async () => decision);
  assert.notEqual(out.messages, decision.messages, "应该换一个新 messages 数组");
  assert.match(out.messages[0].content[0].text, /\[QQ表情:319 比心/);
  assert.equal(out.messages[0].id, "msg-1", "id 必须保留");
  assert.equal(out.messages[0].role, "user");
  assert.equal(original.content[0].text, '<user_message qq="1">\n亲切[QQ表情:319]\n</user_message>', "原消息不能被改");
  assert.ok(Object.isFrozen(out.messages[0]), "替换出来的消息也要冻结");
});

await check("其它工作区一个字符都不改（返回同一个 decision）", async () => {
  const { hook } = globalThis.__verify;
  const decision = { kind: "enter", messages: Object.freeze([frozenUserMessage("x[QQ表情:319]")]) };
  const out = await hook({ agent: { session: { header: { cwd: OTHER } } } }, async () => decision);
  assert.equal(out, decision);
  assert.equal(out.messages[0].content[0].text, "x[QQ表情:319]");
});

if (cq) {
  await check("love_emoji status 报告补丁在岗", async () => {
    const { tools } = globalThis.__verify;
    const exec = { agent: { session: { header: { cwd: LOVE } } } };
    const status = await tools.get("love_emoji").execute({ action: "status" }, exec);
    assert.match(status.text, /QQ 通道补丁：/);
  });
}

await check("state.json 记录上次见面与累计消息数（旧版从来不写）", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "love-state-"));
  try {
    plugin.touchState(tmp, 2);
    plugin.touchState(tmp, 1);
    const state = JSON.parse(fs.readFileSync(path.join(tmp, "memory", "state.json"), "utf8"));
    assert.equal(state.message_count, 3);
    assert.match(String(state.last_seen), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

await check("love_record fact 的中文键落到规范字段", () => {
  const profile = { name: null, nickname: null, birthday: null, likes: [], dislikes: [], boundaries: [], facts: {} };
  plugin.applyFact(profile, "称呼", "测试用户");
  plugin.applyFact(profile, "偏好", "喜欢被叫主人");
  plugin.applyFact(profile, "偏好", "喜欢被叫主人"); // 去重
  plugin.applyFact(profile, "讨厌", "被查岗");
  plugin.applyFact(profile, "喜欢的动物", "鲸鱼");
  assert.equal(profile.nickname, "测试用户");
  assert.deepEqual(profile.likes, ["喜欢被叫主人"]);
  assert.deepEqual(profile.dislikes, ["被查岗"]);
  assert.equal(profile.facts["喜欢的动物"], "鲸鱼");
  assert.equal(profile["称呼"], undefined, "不应再写出「称呼」这种野字段");
  assert.equal(profile["偏好"], undefined);
});

console.log(`profile: ${profile}`);
console.log(results.join("\n"));
if (failed) {
  console.log(`\n${failed} 项没通过 —— 表情注解可能没生效。`);
  process.exitCode = 1;
}
