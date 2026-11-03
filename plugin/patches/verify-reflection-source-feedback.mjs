/** Reproduce a real acceptance failure at the worker/source boundary, without paid calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureCompletedTurns, readReflection, listReflections } from '../reflection.js';
import { createReflectionWorker } from '../reflection-worker.js';
import { readCoreMemory } from '../core-memory.js';
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'love-quality-feedback-'));
let time = Date.now(), calls = 0;
try {
  const events = [
    { type: 'turn/start', seq: 0, data: { turn: 1 } },
    { type: 'user/message', seq: 1, data: { id: 'u', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '只修改夜班饮品，白天不变' }] } },
    { type: 'assistant/message', seq: 2, data: { message: { id: 'a', role: 'assistant', content: [{ type: 'text', text: '我理解这是局部变化' }] } } },
    { type: 'turn/end', seq: 3, time, data: { turn: 1, reason: { kind: 'completed' } } },
  ];
  const session = { id: 'fixture', firstLiveSeq: 0, snapshotEvents: (from, to) => events.filter(e => e.seq >= from && e.seq < to), requestHeader: () => ({ config: { provider: 'fixture', model: 'fixture' } }) };
  captureCompletedTurns(workspace, session, events.at(-1));
  const worker = createReflectionWorker({ scopes: () => [{ primary: workspace, workspace, groupId: '' }], now: () => time, config: () => ({ reflectionEnabled: true, reflectionBackgroundEnabled: true, reflectionCooldownMinutes: 1, reflectionMaxCallsPerDay: 6 }), llm: () => ({ async prepareCall(config) { return { config, async *stream(options) {
    calls++;
    const data = JSON.parse(options.messages[0].content[0].text), assistant = data.materials.find(m => m.role === 'assistant');
    assert.ok(assistant);
    if (calls === 2) assert.match(data.previousAttempt.lastError, /conversation.*user.*reflection.*inferred/);
    yield { type: 'text-delta', text: JSON.stringify({ reason: '边界契约测试', operations: [{ op: 'record_memory', ref: '$reflection', coreId: 'self', content: '我理解这是局部变化', kind: 'reflection', epistemic: 'inferred', importance: 2, reason: '真实助手理解来源', source: { kind: calls === 1 ? 'conversation' : 'reflection', reference: assistant.reference } }] }) };
    yield { type: 'finish', reason: { kind: 'stop' } };
  } }; } }) });
  await worker.tick();
  assert.equal(readCoreMemory(workspace).revision, 0, '不放宽角色约束');
  const job = readReflection(workspace, '', listReflections(workspace).jobs[0].id);
  assert.match(job.lastError, /conversation.*user.*reflection.*inferred/, '重试必须能知道来源角色错误，不能只有泛化提交失败');
  time += 60001; await worker.tick();
  assert.equal(calls, 2);
  assert.equal(worker.describe(workspace).dailyCalls, 2, '纠错仍计预算');
  assert.equal(readCoreMemory(workspace).memories[0].source.kind, 'reflection');
  await worker.stop();
  console.log('ok   真实失败回归：助手误标conversation被拒；固定角色反馈进入下次重试，纠正后保存，预算不绕过');
} finally {
  assert.equal(path.dirname(workspace), path.resolve(os.tmpdir()));
  fs.rmSync(workspace, { recursive: true, force: true });
}
