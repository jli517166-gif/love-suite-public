#!/usr/bin/env node
/**
 * 面板渲染自检：不开浏览器，用假 React 把 Panel 的四个页签各渲染一遍。
 *
 *   node patches/verify-client-render.mjs
 *
 * 抓「插件页面空白」这类运行时错误（上一版就栽在残留的 starKey 未定义上）。
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, "..", "client.js");
const source = fs.readFileSync(file, "utf8");

let captured = null;
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  navigator: { clipboard: { writeText: async () => {} } },
  window: {
    __ModuleLoader__: { load: (registration) => { captured = registration; } },
    location: { origin: "http://127.0.0.1:1234" },
    open: () => {},
  },
};
sandbox.window.document = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, textContent: "" }),
  head: { appendChild: () => {} },
};
sandbox.document = sandbox.window.document;

vm.runInNewContext(source, sandbox, { filename: "client.js" });
if (!captured) throw new Error("client.js 没有调用 __ModuleLoader__.load");

let index = 0;
const values = [];
const React = {
  Component: class { constructor(props) { this.props = props; this.state = {}; } },
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (init) => {
    const i = index++;
    if (i < values.length) return [values[i], () => {}];
    return [typeof init === "function" ? init() : init, () => {}];
  },
  useEffect: () => {},
  useCallback: (fn) => fn,
  useRef: (init) => ({ current: init }),
  useSyncExternalStore: (subscribe, get) => get(),
};

const exportsObj = captured.factory(() => React);
const Panel = exportsObj?.__test?.Panel;
if (typeof Panel !== "function") throw new Error("client.js 没有导出 __test.Panel");

const status = {
  ok: true,
  workspace: "C:\\test\\love",
  workspaces: ["C:\\test\\love"],
  setupDone: true,
  proactiveEnabled: true,
  config: {
    minGapHours: 4, maxGapHours: 12, dailySkipChance: 0.45,
    activeStartHour: 10, activeEndHour: 22, voiceChance: 0.08,
    voiceCooldownHours: 8, quietAfterChatMinutes: 120,
    emojiEnabled: true, moodInjection: true, autoAppraisal: true,
    composeEnabled: true, channel: "qq", qqHost: "127.0.0.1", qqPort: 8643,
    qqHttpUrl: "", napcatDir: "C:\\NapCat", autoLearn: true,
  },
  mood: { emotion: "平静", intensity: 0.3, causes: ["今天聊得少"] },
  state: { last_sent: null, next_at: null, next_after: null, dates: [] },
  relationship: { stage: "初识", affection: 5, trust: 5 },
  pulse: { activity: { id: "reading", label: "在看书" }, needs: { attachment: 0.4, curiosity: 0.6, energy: 0.7 } },
  channel: { id: "qq", describe: "qq" },
  outbox: { fresh: 0, total: 0 },
};
const form = { ...status.config, workspace: status.workspace };

const tabs = ["overview", "learning", "templates", "setup", "settings"];
let failed = 0;
for (const tab of tabs) {
  values.length = 0;
  index = 0;
  // useState 顺序：status, form, tab, msg, err, busy, preview, graphStats, confirmOpen, confirmText, setup, copied
  values.push(
    status, form, tab, "", "", false, "", null, false, "", null, false,
    null, "", "", "",
    { current: "whale", items: [{ key: "whale", name: "鲸鱼娘" }] },
    "", false, "", "", "", "", "",
    { defaults: { activity: { reading: ["默认"] }, emotion: { 开心: ["默认"] } }, custom: { activity: {}, emotion: {} }, effective: { activity: { reading: ["默认"] }, emotion: { 开心: ["默认开心"] } } },
    "", "", "", "",
  );
  try {
    const tree = Panel({ onClose: () => {} });
    const text = JSON.stringify(tree);
    if (tree?.type !== "div" || !tree.children?.length) throw new Error("渲染结果为空");
    console.log(`ok   面板 ${tab} 渲染正常（${text.length} 字符）`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL 面板 ${tab}: ${err?.message ?? err}`);
  }
}

try {
  const html = fs.readFileSync(path.join(here, "..", "star", "index.html"), "utf8");
  for (const pattern of [/function showWebGLFallback/, /function webglSupported/, /try \{ startStarMap\(\); \} catch/, /function switchBrain/, /function createBatchedFlow/, /id="motion-main"/, /function moveWithDamping/]) {
    if (!pattern.test(html)) throw new Error("缺少 WebGL 回退片段：" + pattern);
  }
  const fallback = html.slice(html.indexOf('function showWebGLFallback('), html.indexOf('function startStarMap('));
  const children = [];
  const loading = { classList: { remove: () => {} }, replaceChildren: () => { children.length = 0; }, append: (...items) => children.push(...items), style: {} };
  let retried = false;
  vm.runInNewContext(fallback + '\nshowWebGLFallback(new Error("WebGL unavailable"));', {
    document: { getElementById: () => loading, createElement: () => ({ addEventListener(event, callback) { this[event] = callback; } }) },
    location: { reload: () => { retried = true; } },
  });
  if (children.length !== 3 || !children[0].textContent.includes('硬件加速')) throw new Error('回退提示未显示');
  children[2].click();
  if (!retried) throw new Error('回退重试按钮无效');
  console.log("ok   星图：WebGL 不可用时提示与重试正常，新版渲染/暂停入口齐全");
} catch (err) {
  failed += 1;
  console.log(`FAIL 星图回退: ${err?.message ?? err}`);
}

if (failed) {
  console.log(`\n${failed} 个页签渲染失败。`);
  process.exitCode = 1;
}
