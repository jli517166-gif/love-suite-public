import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
process.env.LOVE_TEST_ISOLATED = '1';
const { handleApi } = await import('../index.js');
const queue = await import('../reflection.js');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'love-reflection-ui-'));
function capture(id, text, groupId = '') {
  const events = [
    { type: 'turn/start', seq: 0, data: { turn: 1 } },
    { type: 'user/message', seq: 1, data: { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] } },
    { type: 'turn/end', seq: 2, data: { turn: 1, reason: { kind: 'completed' } } },
  ];
  queue.captureCompletedTurns(workspace, { id, snapshotEvents: (from, to) => events.filter(e => e.seq >= from && e.seq < to) }, events.at(-1), { groupId });
  return queue.listReflections(workspace, groupId).jobs.find(j => j.sessionId === id).id;
}
const id = capture('private-fixture', '私聊全文开头' + '分页测试材料'.repeat(850) + '全文尾部暗号：小鲸鱼');
capture('qq-group-12345678', '群内独立材料', '12345678');
const server = http.createServer((req, res) => handleApi(req, res, { workspace, channel: 'none', reflectionBackgroundEnabled: false }));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: base, pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
const nativeFetch = globalThis.fetch;
const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, URL, window: dom.window, document: dom.window.document, fetch: (url, options) => nativeFetch(new URL(url, base), options), navigator: {}, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window) };
let captured;
dom.window.__ModuleLoader__ = { load(record) { captured = record; } };
vm.runInNewContext(fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8'), sandbox);
const exported = captured.factory(name => name === 'react' ? React : undefined);
const root = createRoot(document.getElementById('root'));
const pause = () => new Promise(resolve => setTimeout(resolve, 90));
const button = label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label);
const body = () => document.body.textContent;
function change(input, value) { const key = Object.keys(input).find(k => k.startsWith('__reactProps')); input[key].onChange({ target: { value } }); }
try {
  assert.equal(typeof exported.__test.ReflectionManager, 'function', '面板必须提供可操作的整理批次管理组件');
  root.render(React.createElement(exported.__test.ReflectionManager, { groupId: '' })); await pause(); await pause();
  assert.match(body(), /private-fixture/); assert.doesNotMatch(body(), /qq-group-12345678/);
  button('查看批次').click(); await pause();
  assert.match(body(), /待补读/);
  assert.match(body(), /本批尚未提交核心记忆/);
  assert.match(body(), /后台按冷却和共享预算处理/);
  button('读取全文').click(); await pause();
  while (button('下一页全文')) { button('下一页全文').click(); await pause(); }
  assert.match(body(), /全文尾部暗号：小鲸鱼/);
  assert.ok(button('跳过此批次').disabled, '必须先填写处理理由');
  change(document.querySelector('[aria-label="批次处理理由"]'), '本轮界面验收后跳过'); await pause();
  button('跳过此批次').click(); await pause(); await pause();
  assert.equal(queue.readReflection(workspace, '', id).status, 'skipped');
  assert.match(body(), /本轮界面验收后跳过/);
  root.render(React.createElement(exported.__test.ReflectionManager, { groupId: '12345678', key: '12345678' })); await pause(); await pause();
  assert.match(body(), /qq-group-12345678/); assert.doesNotMatch(body(), /private-fixture|小鲸鱼/);
  console.log('ok   整理面板：真实React与HTTP读取全文尾部、理由必填、跳过落盘、切群清除私聊材料');
} finally {
  root.unmount(); dom.window.close(); await new Promise(resolve => server.close(resolve));
  assert.equal(path.dirname(workspace), path.resolve(os.tmpdir())); fs.rmSync(workspace, { recursive: true, force: true });
}
