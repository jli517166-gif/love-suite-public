import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.LOVE_TEST_ISOLATED = '1';
const reflection = await import('../reflection.js');
const { commitCoreMemory, readCoreMemory, coreMemoryFile } = await import('../core-memory.js');
const { apply } = await import('../index.js');
const { exportMemory, importMemory } = await import('../backup.js');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'love-reflection-'));
const now = Date.now();
const message = (id, role, kind, text) => ({ id, role, source: { kind }, content: [{ type: 'text', text }] });
const events = [
  { type: 'turn/start', seq: 0, time: now, data: { turn: 1 } },
  { type: 'user/message', seq: 1, time: now, data: message('u1', 'user', 'user', '我喜欢安静的雨天') },
  { type: 'user/message', seq: 2, time: now, data: message('internal', 'user', 'runtime-context', '内部提示不是用户的喜好') },
  { type: 'assistant/message', seq: 3, time: now, data: { turn: 1, message: message('a1', 'assistant', 'model', '我觉得雨声很适合一起安静待着') } },
  { type: 'tool/call', seq: 4, time: now, data: { turn: 1, callId: 'c1', name: 'read', arguments: '{}' } },
  { type: 'tool/result', seq: 5, time: now, data: { turn: 1, message: { ...message('t1', 'tool', 'tool', '实际读取结果'), toolCallId: 'c1' } } },
  { type: 'tool/result', seq: 6, time: now, data: { turn: 1, error: { reason: '失败' }, message: { ...message('t2', 'tool', 'tool', '失败内容不能证明已执行'), toolCallId: 'bad' } } },
  { type: 'turn/end', seq: 7, time: now, data: { turn: 1, reason: { kind: 'completed' } } },
];
events[3].data.message.content.unshift({ type: 'reasoning', text: '内部推理不进入材料' });
const session = { id: 'session-test', header: { cwd: workspace }, firstLiveSeq: 0, seq: 8, snapshotEvents(from, to) { return events.filter((event) => event.seq >= from && event.seq < to); }, isOwnSeq() { return true; } };
const record = (reference, content = '用户喜欢安静的雨天') => ({ op: 'record_memory', ref: '$memory', coreId: 'self', kind: 'preference', epistemic: 'reported', importance: 4, content, reason: '用户明确表达了偏好', source: { kind: 'conversation', reference } });
try {
  assert.equal(reflection.captureCompletedTurns(workspace, session, events.at(-1)).queued, 1);
  assert.equal(reflection.captureCompletedTurns(workspace, session, events.at(-1)).queued, 0);
  assert.equal(reflection.reflectionStatus(workspace).pending, 1);
  const claimed = reflection.claimReflection(workspace, '', now + 1);
  assert.equal(claimed.job.materials.length, 3);
  assert.ok(!claimed.job.materials.some((item) => item.text.includes('内部提示') || item.text.includes('失败内容') || item.text.includes('内部推理')));
  assert.equal(reflection.claimReflection(workspace, '', now + 2).job, null);
  console.log('ok   反思队列：真实完成轮次入队一次，内部提示和失败工具结果排除，领取互斥');
  const ownToolWorkspace = path.join(workspace, 'own-tools');
  const ownToolEvents = structuredClone(events);
  ownToolEvents.at(-1).seq = 9;
  ownToolEvents.splice(-1, 0, { type: 'tool/call', seq: 7, time: now, data: { callId: 'memory-call', name: 'love_reflection' } }, { type: 'tool/result', seq: 8, time: now, data: { message: { ...message('memory-result', 'tool', 'tool', '旧记忆正文'.repeat(8000)), toolCallId: 'memory-call' } } });
  reflection.captureCompletedTurns(ownToolWorkspace, { ...session, snapshotEvents: (from, to) => ownToolEvents.filter(event => event.seq >= from && event.seq < to) }, ownToolEvents.at(-1));
  assert.equal(reflection.reflectionStatus(ownToolWorkspace).pending, 1, '本插件记忆工具的回传不能再次变成材料或挤爆批次');

  const userReference = claimed.job.materials.find((item) => item.role === 'user').reference;
  const assistantReference = claimed.job.materials.find((item) => item.role === 'assistant').reference;
  const input = { jobId: claimed.job.id, leaseToken: claimed.leaseToken, expectedRevision: 0, operations: [record(userReference)], reason: '记录明确偏好' };
  assert.throws(() => reflection.completeReflection(workspace, { ...input, operations: [record('不存在的消息')] }), /来源/);
  assert.throws(() => reflection.completeReflection(workspace, { ...input, operations: [record(assistantReference)] }), /来源|推测/);
  assert.equal(fs.existsSync(coreMemoryFile(workspace)), false);
  let crashed = false;
  assert.throws(() => reflection.completeReflection(workspace, input, { commit: (...args) => { const result = commitCoreMemory(...args); crashed = true; throw new Error('模拟核心提交后、队列确认前崩溃'); } }), /模拟/);
  assert.equal(crashed, true);
  assert.equal(readCoreMemory(workspace).memories.length, 1);
  commitCoreMemory(workspace, { expectedRevision: 1, operations: [{ op: 'record_memory', ref: '$later', coreId: 'self', kind: 'reflection', epistemic: 'inferred', content: '后续的新记忆应保留', importance: 3, reason: '确认重试不覆盖后来内容', source: { kind: 'reflection', reference: 'later-message' } }] });
  const finished = reflection.completeReflection(workspace, input);
  assert.equal(finished.status, 'done');
  assert.equal(readCoreMemory(workspace).revision, 2);
  assert.equal(readCoreMemory(workspace).memories.length, 2);
  assert.throws(() => reflection.completeReflection(workspace, { ...input, operations: [record(userReference, '不能覆盖已提交批次')] }), /其他内容/);
  assert.equal(reflection.reflectionStatus(workspace).done, 1);
  console.log('ok   反思队列：来源校验、模型理解不得转述成用户事实、跨文件确认重试不会重复写入');

  const recoveryWorkspace = path.join(workspace, 'recovery');
  const recoverySession = { ...session, id: 'recovery-session', header: { cwd: recoveryWorkspace } };
  reflection.captureCompletedTurns(recoveryWorkspace, recoverySession, events.at(-1));
  const recovery = reflection.claimReflection(recoveryWorkspace);
  const recoveryInput = { jobId: recovery.job.id, leaseToken: recovery.leaseToken, expectedRevision: 0, operations: [record(recovery.job.materials.find((item) => item.role === 'user').reference)], reason: '恢复一次已保存结果' };
  assert.throws(() => reflection.completeReflection(recoveryWorkspace, recoveryInput, { commit: (...args) => { commitCoreMemory(...args); throw new Error('确认前停止'); } }), /确认前停止/);
  assert.throws(() => reflection.completeReflection(recoveryWorkspace, { ...recoveryInput, operations: [] }), /已经保存/);
  assert.equal(reflection.claimReflection(recoveryWorkspace).job, null);
  assert.equal(reflection.reflectionStatus(recoveryWorkspace).done, 1);
  assert.equal(readCoreMemory(recoveryWorkspace).memories.length, 1);
  console.log('ok   反思队列：已保存回执可自动恢复确认，不会被改作空批次或重新提炼');

  const groupEvents = events.map((event) => ({ ...event, data: event.data }));
  const groupSession = { ...session, id: 'qq-group-12345678', snapshotEvents: (from, to) => groupEvents.filter((event) => event.seq >= from && event.seq < to) };
  reflection.captureCompletedTurns(workspace, groupSession, groupEvents.at(-1), { groupId: '12345678' });
  assert.equal(reflection.reflectionStatus(workspace, '12345678').pending, 1);
  assert.equal(reflection.reflectionStatus(workspace).pending, 0);
  const groupClaim = reflection.claimReflection(workspace, '12345678', now + 10);
  reflection.failReflection(workspace, { jobId: groupClaim.job.id, leaseToken: groupClaim.leaseToken, reason: '暂时没有整理好' }, { groupId: '12345678', now: now + 11 });
  assert.equal(reflection.claimReflection(workspace, '12345678', now + 12).job, null);
  const retried = reflection.claimReflection(workspace, '12345678', now + 900000);
  assert.equal(retried.job.attempts, 2);
  reflection.completeReflection(workspace, { jobId: retried.job.id, leaseToken: retried.leaseToken, expectedRevision: 0, operations: [], reason: '这轮没有需要新增的内容' }, { groupId: '12345678', now: now + 900001 });
  assert.equal(fs.existsSync(coreMemoryFile(workspace, '12345678')), false);
  console.log('ok   反思队列：群范围隔离、失败退避重试与空结果不造记忆');

  const reviewEvents = structuredClone(events);
  reviewEvents[1].data.content.push({ type: 'image', image: 'synthetic-test-only' });
  const reviewSession = { ...session, id: 'qq-group-23456789', snapshotEvents: (from, to) => reviewEvents.filter((event) => event.seq >= from && event.seq < to) };
  reflection.captureCompletedTurns(workspace, reviewSession, reviewEvents.at(-1), { groupId: '23456789' });
  assert.equal(reflection.reflectionStatus(workspace, '23456789').needs_review, 1);
  assert.equal(reflection.claimReflection(workspace, '23456789').job, null);
  const review = reflection.listReflections(workspace, '23456789').jobs[0];
  reflection.skipReflection(workspace, { jobId: review.id, reason: '需要原会话图片，暂不据此造记忆' }, { groupId: '23456789' });
  assert.equal(fs.existsSync(coreMemoryFile(workspace, '23456789')), false);
  console.log('ok   反思队列：附件不完整材料不进入自动提交，可附理由跳过');

  const boundaryWorkspace = path.join(workspace, 'boundary');
  const longEvents = structuredClone(events);
  longEvents[1].data.content[0].text = '长'.repeat(5000);
  const longSession = { ...session, id: 'long-message', snapshotEvents: (from, to) => longEvents.filter((event) => event.seq >= from && event.seq < to) };
  reflection.captureCompletedTurns(boundaryWorkspace, longSession, longEvents.at(-1));
  const longJob = reflection.readReflection(boundaryWorkspace, '', reflection.listReflections(boundaryWorkspace).jobs[0].id);
  assert.equal(longJob.status, 'needs_review');
  assert.equal(longJob.materials[0].truncated, true);
  assert.equal(longJob.materials[0].text.length, 4000);
  const failedEvents = structuredClone(events); failedEvents.at(-1).data.reason = { kind: 'aborted' };
  assert.equal(reflection.captureCompletedTurns(boundaryWorkspace, { ...session, id: 'failed-turn', snapshotEvents: (from, to) => failedEvents.filter((event) => event.seq >= from && event.seq < to) }, failedEvents.at(-1)).queued, 0);
  assert.equal(reflection.captureCompletedTurns(boundaryWorkspace, { ...session, id: 'loaded-history', firstLiveSeq: 8 }, events.at(-1)).queued, 0);
  assert.equal(reflection.captureCompletedTurns(boundaryWorkspace, { ...session, header: { cwd: workspace, origin: 'subagent' } }, events.at(-1)).queued, 0);
  const replyEvents = structuredClone(events);
  replyEvents[1].data.source = { kind: 'user-question-reply', outcome: 'answered' };
  assert.equal(reflection.captureCompletedTurns(boundaryWorkspace, { ...session, id: 'answered-reply', snapshotEvents: (from, to) => replyEvents.filter((event) => event.seq >= from && event.seq < to) }, replyEvents.at(-1)).queued, 1);
  replyEvents[1].data.source.outcome = 'dismissed';
  assert.equal(reflection.captureCompletedTurns(boundaryWorkspace, { ...session, id: 'dismissed-reply', snapshotEvents: (from, to) => replyEvents.filter((event) => event.seq >= from && event.seq < to) }, replyEvents.at(-1)).queued, 0);
  const offWorkspace = path.join(workspace, 'off-then-on');
  reflection.captureCompletedTurns(offWorkspace, session, events.at(-1), { collect: false });
  assert.equal(reflection.captureCompletedTurns(offWorkspace, session, events.at(-1)).queued, 0);
  assert.equal(reflection.reflectionStatus(offWorkspace).pending, 0);
  console.log('ok   反思队列：超长正文明确待补读，失败轮次、已加载历史和子代理材料不自动入队');

  const leaseSession = { ...session, id: 'qq-group-34567890' };
  reflection.captureCompletedTurns(workspace, leaseSession, events.at(-1), { groupId: '34567890' });
  const lease1 = reflection.claimReflection(workspace, '34567890', now + 20);
  const lease2 = reflection.claimReflection(workspace, '34567890', now + 300021);
  assert.equal(lease2.job.attempts, 2);
  assert.notEqual(lease2.leaseToken, lease1.leaseToken);
  assert.throws(() => reflection.completeReflection(workspace, { jobId: lease1.job.id, leaseToken: lease1.leaseToken, operations: [], reason: '旧租约不能提交' }, { groupId: '34567890', now: now + 300022 }), /失效/);
  reflection.failReflection(workspace, { jobId: lease2.job.id, leaseToken: lease2.leaseToken, reason: '失败重试' }, { groupId: '34567890', now: now + 300023 });
  const lease3 = reflection.claimReflection(workspace, '34567890', now + 500000);
  reflection.failReflection(workspace, { jobId: lease3.job.id, leaseToken: lease3.leaseToken, reason: '第三次失败后停下' }, { groupId: '34567890', now: now + 500001 });
  assert.equal(reflection.reflectionStatus(workspace, '34567890').failed, 1);
  assert.equal(reflection.claimReflection(workspace, '34567890', now + 900000).job, null);
  console.log('ok   反思队列：租约过期恢复、新旧领取隔离、三次失败停止重试');

  const overflowWorkspace = path.join(workspace, 'overflow');
  const manyEvents = Array.from({ length: 101 }, (_, index) => [
    { type: 'turn/start', seq: index * 3, time: now, data: { turn: index + 1 } },
    { type: 'user/message', seq: index * 3 + 1, time: now, data: message('u' + index, 'user', 'user', '真实轮次 ' + index) },
    { type: 'turn/end', seq: index * 3 + 2, time: now, data: { turn: index + 1, reason: { kind: 'completed' } } },
  ]).flat();
  const overflowSession = { ...session, id: 'overflow-session', snapshotEvents: (from, to) => manyEvents.filter((event) => event.seq >= from && event.seq < to) };
  const capture = reflection.captureCompletedTurns(overflowWorkspace, overflowSession, manyEvents.at(-1));
  assert.equal(capture.queued, 100); assert.equal(capture.overflow, true);
  const slot = reflection.claimReflection(overflowWorkspace, '', now);
  reflection.completeReflection(overflowWorkspace, { jobId: slot.job.id, leaseToken: slot.leaseToken, expectedRevision: 0, operations: [], reason: '没有新增' }, { now });
  assert.equal(reflection.captureCompletedTurns(overflowWorkspace, overflowSession, manyEvents.at(-1)).queued, 1);
  assert.equal(reflection.reflectionStatus(overflowWorkspace).pending, 100);
  console.log('ok   反思队列：满载不越过未保存来源，腾出空间后按游标补入');

  const restored = fs.mkdtempSync(path.join(os.tmpdir(), 'love-reflection-restore-'));
  try {
    const bundle = exportMemory(workspace);
    importMemory(restored, bundle);
    assert.equal(reflection.reflectionStatus(restored).done, 1);
    assert.equal(reflection.reflectionStatus(restored, '34567890').failed, 1);
    const previous = fs.readFileSync(reflection.reflectionFile(restored), 'utf8');
    assert.throws(() => importMemory(restored, { ...bundle, files: { ...bundle.files, 'reflection-queue.json': '{bad' } }));
    assert.equal(fs.readFileSync(reflection.reflectionFile(restored), 'utf8'), previous);
  } finally { assert.equal(path.dirname(restored), path.resolve(os.tmpdir())); fs.rmSync(restored, { recursive: true, force: true }); }
  console.log('ok   反思队列：待处理、失败状态与核心回执可备份恢复，坏队列导入不半写');

  const listeners = new Map(), tools = new Map(), contexts = new Map();
  const dispose = await apply({ tools: { register(tool) { tools.set(tool.name, tool); } }, on(name, listener) { listeners.set(name, listener); }, systemPrompt: { context(item) { contexts.set(item.name, item); } }, logger: { info() {}, warn() {} } }, { enabled: true, workspace, workspaces: [], proactiveEnabled: false, channel: 'none' });
  try {
    assert.ok(listeners.has('session/event'));
    assert.ok(tools.has('love_reflection'));
    const execution = { agent: { session: { id: 'session-test', header: { cwd: workspace } } } };
    assert.equal(JSON.parse((await tools.get('love_reflection').execute({ action: 'status' }, execution)).text).done, 1);
    const live = { ...session, id: 'live-session' };
    listeners.get('session/event')(live, events.at(-1));
    assert.equal(reflection.reflectionStatus(workspace).pending, 1);
    assert.match(contexts.get('love:reflection').text(execution), /真实对话材料待整理/);
    assert.equal(contexts.get('love:reflection').text({ agent: { session: { header: { cwd: path.dirname(workspace) } } } }), '');
    await assert.rejects(() => tools.get('love_reflection').execute({ action: 'status' }, { agent: { session: { header: { cwd: path.dirname(workspace) } } } }), /只允许/);
  } finally { dispose?.(); }
  const disabledListeners = new Map();
  const disabledWorkspace = path.join(workspace, 'disabled');
  const stopDisabled = await apply({ tools: { register() {} }, on(name, listener) { disabledListeners.set(name, listener); }, logger: { info() {}, warn() {} } }, { enabled: true, workspace: disabledWorkspace, workspaces: [], proactiveEnabled: false, reflectionEnabled: false, groupMemoryEnabled: false, channel: 'none' });
  try {
    disabledListeners.get('session/event')({ ...session, header: { cwd: disabledWorkspace } }, events.at(-1));
    assert.equal(reflection.reflectionStatus(disabledWorkspace).pending, 0);
    assert.equal(JSON.parse(fs.readFileSync(reflection.reflectionFile(disabledWorkspace), 'utf8')).cursors[0].seq, 7);
  } finally { stopDisabled?.(); }
  console.log('ok   反思队列：宿主真实事件签名、模型工具注册与工作区限制');
} finally {
  assert.equal(path.dirname(workspace), path.resolve(os.tmpdir()));
  fs.rmSync(workspace, { recursive: true, force: true });
}
