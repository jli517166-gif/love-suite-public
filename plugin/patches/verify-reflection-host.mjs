/** Exercise actual plugin scheduling + HTTP config cancellation, in a separate isolated process. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'love-reflection-host-'));
process.env.LOVE_COMPANION_CONFIG = path.join(workspace, 'runtime.json');
delete process.env.LOVE_TEST_ISOLATED;
const { apply, handleApi } = await import('../index.js');
const { readCoreMemory } = await import('../core-memory.js');
const listeners = new Map();
let enter, release, timeout, dispose, server;
const entered = new Promise(resolve => { enter = resolve; });
const gate = new Promise(resolve => { release = resolve; });
const cfg = { enabled: true, workspace, workspaces: [], channel: 'none', proactiveEnabled: false, reflectionEnabled: true, reflectionBackgroundEnabled: true };
try {
  dispose = await apply({
    tools: { register() {} }, on(name, listener) { listeners.set(name, listener); }, logger: { info() {}, warn() {} },
    agents: { list() { return []; } },
    llm: { async prepareCall(config) { return { config, stream: async function* () { enter(); await gate; yield { type: 'text-delta', text: '{"operations":[],"reason":"迟到结果"}' }; yield { type: 'finish', reason: { kind: 'stop' } }; } }; } },
  }, cfg);
  server = http.createServer((req, res) => { void handleApi(req, res, cfg); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/love-companion/api';
  const request = async (route, body) => {
    const response = await fetch(base + route, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    assert.equal(response.status, 200);
    return response.json();
  };
  const time = Date.now();
  const events = [
    { type: 'turn/start', seq: 0, time, data: { turn: 1 } },
    { type: 'user/message', seq: 1, time, data: { id: 'real-fixture-message', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '临时工作区的文字材料' }] } },
    { type: 'turn/end', seq: 2, time, data: { turn: 1, reason: { kind: 'completed' } } },
  ];
  const session = { id: 'fixture-session', header: { cwd: workspace }, firstLiveSeq: 0, requestHeader: () => ({ config: { provider: 'fixture', model: 'fixture-model' } }), snapshotEvents: (from, to) => events.filter(e => e.seq >= from && e.seq < to) };
  listeners.get('session/event')(session, events.at(-1));
  const captured = (await request('/status')).reflectionCapture;
  assert.equal(captured.scopedTurns, 1);
  assert.equal(captured.queuedBatches, 1);
  listeners.get('session/event')({ ...session, header: { cwd: path.join(os.tmpdir(), 'outside-love-scope') } }, events.at(-1));
  assert.equal((await request('/status')).reflectionCapture.outsideScopeTurns, 1);
  assert.equal((await request('/status')).reflectionCapture.queuedBatches, 1);
  await Promise.race([entered, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('后台定时器没有自动领取材料')), 12000); })]);
  clearTimeout(timeout);
  assert.equal((await request('/status')).reflectionWorker.running, true);
  const stopped = await request('/config', { reflectionBackgroundEnabled: false, reflectionCooldownMinutes: 2, reflectionMaxCallsPerDay: 3, reflectionMaxOutputTokens: 2048 });
  assert.equal(stopped.config.reflectionBackgroundEnabled, false);
  const paused = await request('/status');
  assert.equal(paused.reflectionWorker.enabled, false);
  assert.equal(paused.reflectionWorker.running, false);
  assert.equal(paused.reflectionWorker.lastResult.status, 'cancelled');
  assert.equal(paused.reflectionWorker.dailyCalls, 1);
  assert.equal(paused.config.reflectionMaxOutputTokens, 2048);
  assert.equal(readCoreMemory(workspace).revision, 0);
  const view = await request('/reflection');
  assert.equal(view.status.pending, 1);
  const item = await request('/reflection?jobId=' + view.jobs[0].id);
  assert.match(item.job.lastError, /取消/);
  assert.equal(item.job.attempts, 0);
  release(); await Promise.resolve();
  console.log('ok   后台整理宿主集成：事件入队后定时器独立启动；HTTP停用立即取消，预算和原因可查看');
} finally {
  clearTimeout(timeout); release?.(); dispose?.();
  if (server) await new Promise(resolve => server.close(resolve));
  assert.equal(path.dirname(workspace), path.resolve(os.tmpdir()));
  fs.rmSync(workspace, { recursive: true, force: true });
}
