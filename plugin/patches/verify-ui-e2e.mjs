#!/usr/bin/env node
/**
 * 面板端到端自检：用真实 React + jsdom 点一遍关键交互。
 *
 *   node patches/verify-ui-e2e.mjs
 *
 * 依赖（只在开发/CI 装，不随插件发布）：react、react-dom、jsdom。
 * 没装就跳过，退出码 0，避免本地没网时卡住。
 *
 * 覆盖：
 *   1) 设置 → 主动聊天 → 改跳过概率 → 保存，POST /config 带上新值
 *   2) 模板 → 展开一组 → 加一条 → 添加，POST /templates 带上 op=add
 */

let React, createRoot, JSDOM;
try {
  React = (await import("react")).default;
  ({ createRoot } = await import("react-dom/client"));
  ({ JSDOM } = await import("jsdom"));
} catch {
  if (process.env.CI) {
    console.error("FAIL 面板端到端：CI 缺 react / react-dom / jsdom");
    process.exit(1);
  }
  console.log("skip 面板端到端：未安装 react / react-dom / jsdom");
  process.exit(0);
}

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "..", "client.js"), "utf8");

const dom = new JSDOM('<!doctype html><html><body><div id="app"><div id="plugin-slot" style="display:contents"></div></div></body></html>', {
  url: "http://127.0.0.1:1234/",
  pretendToBeVisual: true,
});
const host = dom.window.document.getElementById('app');
let hostWidth = 960;
Object.defineProperty(host, 'clientWidth', { get: () => hostWidth });
const sizeObservers = new Set();
dom.window.ResizeObserver = class {
  constructor(callback) { this.callback = callback; }
  observe(target) { this.target = target; sizeObservers.add(this); }
  disconnect() { sizeObservers.delete(this); }
};
const resizeHost = (width) => {
  hostWidth = width;
  for (const observer of sizeObservers) observer.callback([{ target: host, contentRect: { width } }]);
};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true }); } catch {}

const status = {
  ok: true, version: "0.0.0-test", workspace: "E:\\test\\love", workspaces: ["E:\\test\\love"],
  setupDone: true, workspaceExists: true, proactiveEnabled: true,
  config: {
    minGapHours: 4, maxGapHours: 12, dailySkipChance: 0.45, activeStartHour: 10, activeEndHour: 22,
    voiceChance: 0.08, voiceCooldownHours: 8, quietAfterChatMinutes: 120, maxPerWeek: 3,
    emojiEnabled: true, moodInjection: true, autoAppraisal: true, composeEnabled: true, autoLearn: true, channel: "qq",
  },
  mood: { emotion: "开心", intensity: 0.6, causes: [] },
  state: {}, relationship: { stage: "初识", affection: 6, trust: 5 },
  pulse: { activity: { id: "reading", label: "看书" }, needs: { attachment: 0.5, curiosity: 0.5, energy: 0.8 } },
  channel: { id: "qq", describe: "offline" }, outbox: { fresh: 0, total: 0 },
  starUrl: "http://127.0.0.1:1234/love-companion/star/",
};
const templates = {
  ok: true, defaults: {}, custom: {},
  effective: {
    activity: { reading: ["在看一本书", "窝着看书"] },
    emotion: { 开心: ["今天心情不错"] },
  },
};
const persona = { ok: true, current: "whale", items: [{ key: "whale", name: "鲸鱼娘" }, { key: "neko", name: "猫娘" }] };

const calls = [];
const json = (data) => ({ ok: true, status: 200, json: async () => data });
async function fetchMock(url, options = {}) {
  const route = String(url).replace("http://127.0.0.1:1234", "").split("?")[0];
  const method = options.method || "GET";
  let body = null;
  try { body = options.body ? JSON.parse(options.body) : null; } catch {}
  calls.push({ route, method, body });

  if (route === "/love-companion/api/status") return json(status);
  if (route === "/love-companion/api/persona") return json(persona);
  if (route === "/love-companion/api/doctor") return json({ ok: true, text: "" });
  if (route === "/love-companion/api/stickers") return json({ ok: true, count: 0, items: [] });
  if (route === "/love-companion/api/templates" && method === "GET") return json(templates);
  if (route === "/love-companion/api/templates" && method === "POST") return json(templates);
  if (route === "/love-companion/api/config" && method === "POST") {
    Object.assign(status.config, body || {});
    return json(status);
  }
  return json({ ok: true });
}

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval, Promise,
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  fetch: fetchMock, URL,
  navigator: { clipboard: { writeText: async () => {} } },
  window: dom.window, document: dom.window.document,
};
sandbox.window.fetch = fetchMock;
sandbox.window.URL = URL;
sandbox.window.confirm = () => true;
sandbox.window.__ModuleLoader__ = { load: (record) => { sandbox.__captured = record; } };
vm.runInNewContext(source, sandbox, { filename: "client.js" });

const exportsObj = sandbox.__captured.factory((name) => (name === "react" ? React : undefined));
const existingStyle = dom.window.document.createElement('style');
existingStyle.dataset.loveCompanionCss = 'true';
existingStyle.textContent = '/* old plugin CSS */';
dom.window.document.head.append(existingStyle);
exportsObj.apply({ get: () => null, slots: { inject() {} } });
assert.notEqual(existingStyle.textContent, '/* old plugin CSS */', '客户端重新激活须更新已有样式');
const mount = dom.window.document.getElementById('plugin-slot');
const root = createRoot(mount);
root.render(React.createElement(exportsObj.__test.Panel, { onClose: () => {} }));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const textOf = () => dom.window.document.body.textContent || "";
const button = (label) => [...dom.window.document.querySelectorAll("button")].find((el) => el.textContent.trim() === label);
const section = (title) => [...dom.window.document.querySelectorAll("section")].find((el) => el.textContent.includes(title));

function setInput(input, value) {
  const key = Object.keys(input).find((name) => name.startsWith("__reactProps"));
  const handler = key ? input[key]?.onChange : null;
  if (handler) {
    handler({ target: { value } });
    return;
  }
  input.value = value;
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

await sleep(500);
assert.ok(textOf().includes("陪伴"), "面板应渲染");
assert.equal(dom.window.document.querySelectorAll('[role="tab"]').length, 6, "应有 6 个页签");
const firstTab = dom.window.document.querySelector('[role="tab"][aria-selected="true"]');
assert.equal(firstTab?.textContent, "概览", "默认选中概览");
const autoFit = () => dom.window.document.querySelector('[aria-label="自动适配面板"]');
assert.ok(autoFit(), '应提供自动适配入口');
assert.equal(autoFit().getAttribute('aria-pressed'), 'true', '默认自动适配');
resizeHost(1440);
await sleep(80);
assert.equal(dom.window.document.querySelector('.lc-root').style.zoom, '1.5', '宽面板应自动放大');
resizeHost(1140);
await sleep(50);
assert.equal(dom.window.document.querySelector('.lc-root').style.zoom, '1.19', '应按面板尺寸连续适配');
resizeHost(720);
await sleep(80);
assert.equal(dom.window.document.querySelector('.lc-root').style.zoom, '1', '窄面板恢复正常字号，使用流式布局');
dom.window.document.querySelector('[aria-label="放大面板"]').click();
await sleep(50);
assert.equal(dom.window.document.querySelector('.lc-root').style.zoom, '1.1');
assert.equal(autoFit().getAttribute('aria-pressed'), 'false');
resizeHost(1440);
await sleep(50);
assert.equal(dom.window.document.querySelector('.lc-root').style.zoom, '1.1', '自动计算不能覆盖手动选择');
autoFit().click();
await sleep(50);
assert.equal(dom.window.document.querySelector('.lc-root').style.zoom, '1.5', '切回自动立即按当前容器适配');
resizeHost(0);
await sleep(50);
assert.equal(dom.window.document.querySelector('.lc-root').style.zoom, '1.5', '隐藏面板的零尺寸不应重置缩放');
resizeHost(960);
await sleep(50);
assert.equal(dom.window.document.querySelector('.lc-root').style.zoom, '1');
console.log('ok   概览自动适配：容器变宽/变窄、隐藏恢复、手动覆盖与切回自动');
dom.window.document.querySelector('[role="tablist"]').dispatchEvent(
  new dom.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
);
await sleep(150);
assert.equal(dom.window.document.querySelector('[role="tab"][aria-selected="true"]')?.textContent, "心跳", "方向键应切换页签");
button("设置").click();

// 1) 设置 → 主动聊天 → 改跳过概率 → 保存
button("设置").click();
await sleep(300);
const skipInput = dom.window.document.querySelector('input[aria-label="跳过概率"]');
assert.ok(skipInput, "设置页应有「当天跳过概率」输入框");
setInput(skipInput, "0.6");
await sleep(100);
const proactive = section("主动聊天");
assert.ok(proactive, "应有「主动聊天」分组");
const save = [...proactive.querySelectorAll("button")].find((el) => el.textContent.trim() === "保存");
assert.ok(save, "主动聊天应有保存按钮");
save.click();
await sleep(300);
const configCall = calls.filter((call) => call.method === "POST" && call.route === "/love-companion/api/config").at(-1);
assert.ok(configCall, "保存应 POST /config");
assert.equal(Number(configCall.body.dailySkipChance), 0.6, "保存应带上新的跳过概率");

// 后台提炼预算和停用开关确实发送保存请求。
const reflection = section('后台整理');
assert.ok(reflection);
setInput(reflection.querySelector('input[aria-label="整理间隔（分钟）"]'), '20');
await sleep(50);
setInput(reflection.querySelector('input[aria-label="每天最多调用"]'), '4');
await sleep(50);
[...reflection.querySelectorAll('button')].find(el => el.textContent === '保存整理预算').click();
await sleep(200);
const budgetCall = calls.filter(call => call.method === 'POST' && call.route.endsWith('/config')).at(-1);
assert.equal(budgetCall.body.reflectionCooldownMinutes, 20);
assert.equal(budgetCall.body.reflectionMaxCallsPerDay, 4);
[...reflection.querySelectorAll('button')].find(el => el.textContent === '暂停后台整理').click();
await sleep(200);
assert.equal(calls.filter(call => call.method === 'POST' && call.route.endsWith('/config')).at(-1).body.reflectionBackgroundEnabled, false);
console.log('ok   面板 E2E：后台提炼预算保存和暂停开关');

// 2) 模板 → 展开一组 → 加一条 → 添加
button("模板").click();
await sleep(500);
const details = dom.window.document.querySelector("details.lc-tmpl");
assert.ok(details, "模板页应渲染分组");
details.querySelector("summary").click();
await sleep(100);
const add = [...details.querySelectorAll("button")].find((el) => el.textContent.includes("加一条"));
assert.ok(add, "模板组应有「+ 加一条」");
add.click();
await sleep(100);
const input = details.querySelector('input[aria-label="新增模板"]');
assert.ok(input, "应出现新增模板输入框");
setInput(input, "测试一句模板");
await sleep(100);
const submit = [...details.querySelectorAll("button")].find((el) => el.textContent.trim() === "添加");
assert.ok(submit, "应有添加按钮");
submit.click();
await sleep(300);
const templateCall = calls.filter((call) => call.method === "POST" && call.route === "/love-companion/api/templates").at(-1);
assert.ok(templateCall, "添加模板应 POST /templates");
assert.equal(templateCall.body.op, "add");
assert.equal(templateCall.body.text, "测试一句模板");

// jsdom has no layout engine: viewport geometry is checked in the native host.
assert.equal(exportsObj.__test.clampPanelZoom('broken'), 1);
for (let i = 0; i < 5; i += 1) {
  dom.window.document.querySelector('[aria-label="放大面板"]').click();
  await sleep(30);
}
assert.equal(dom.window.document.querySelector('.lc-root').style.zoom, '1.5');
assert.equal(dom.window.document.querySelector('[aria-label="放大面板"]').disabled, true);
for (let i = 0; i < 7; i += 1) {
  dom.window.document.querySelector('[aria-label="缩小面板"]').click();
  await sleep(30);
}
assert.equal(dom.window.document.querySelector('.lc-root').style.zoom, '0.8');
assert.equal(dom.window.document.querySelector('[aria-label="缩小面板"]').disabled, true);
console.log('ok   面板缩放：80%–150% 边界与按钮交互（几何布局需宿主验收）');

console.log("ok   面板 E2E：设置保存 + 模板新增");
root.unmount();
assert.equal(sizeObservers.size, 0, '关闭面板应清理尺寸监听');
resizeHost(1440);
const reopened = createRoot(mount);
reopened.render(React.createElement(exportsObj.__test.Panel, { onClose: () => {} }));
await sleep(150);
assert.equal(dom.window.document.querySelector('.lc-root').style.zoom, '0.8', '重新打开应保留手动模式与倍率');
assert.equal(autoFit().getAttribute('aria-pressed'), 'false');
autoFit().click();
await sleep(50);
assert.equal(dom.window.document.querySelector('.lc-root').style.zoom, '1.5');
reopened.unmount();
assert.equal(sizeObservers.size, 0);
console.log('ok   面板缩放：重开保留手动选择，切回自动重新计算');
process.exit(0);
