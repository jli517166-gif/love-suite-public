import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.LOVE_TEST_ISOLATED = '1';
const core = await import('../core-memory.js');
const reflection = await import('../reflection.js');
const { buildRecall, apply } = await import('../index.js');
const { exportMemory, importMemory } = await import('../backup.js');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'love-memory-evolution-'));
const source = (reference) => ({ kind: 'conversation', reference });
const record = (ref, content, reference) => ({ op: 'record_memory', ref, coreId: 'self', content, kind: 'preference', epistemic: 'reported', importance: 4, reason: '用户明确表达', source: source(reference) });
try {
  const first = core.commitCoreMemory(workspace, { expectedRevision: 0, operations: [record('$old', '用户现在最喜欢橙花茶', 'conversation#u1')] });
  const oldId = first.references.$old;
  core.commitCoreMemory(workspace, { expectedRevision: 1, operations: [{ op: 'attach_source', id: oldId, source: source('conversation#u2'), epistemic: 'reported', reason: '再次确认相同偏好' }] });
  assert.equal(core.currentMemorySources(core.readCoreMemory(workspace).memories[0]).length, 2);
  assert.equal(core.coreMemoryGraph(workspace).nodes[0].sourceCount, 2);
  core.commitCoreMemory(workspace, { expectedRevision: 2, operations: [{ op: 'attach_source', id: oldId, source: source('conversation#u2'), epistemic: 'reported', reason: '重试同一来源' }] });
  assert.equal(core.currentMemorySources(core.readCoreMemory(workspace).memories[0]).length, 2);
  console.log('ok   记忆演进：重复表达绑定多个来源，同一来源重试不重复造星或证据');

  const replaced = core.commitCoreMemory(workspace, { expectedRevision: 3, operations: [
    { op: 'supersede_memory', id: oldId, replacementId: '$new', source: source('conversation#u3'), epistemic: 'reported', reason: '用户明确说现在改成薄荷茶' },
    record('$new', '用户现在最喜欢薄荷茶', 'conversation#u3'),
  ] });
  const newId = replaced.references.$new;
  let store = core.readCoreMemory(workspace);
  assert.equal(store.memories[0].status, 'archived');
  assert.equal(store.memories[0].content, '用户现在最喜欢橙花茶');
  assert.equal(store.memories[0].supersededBy, newId);
  assert.equal(core.currentMemorySources(store.memories[0]).length, 2);
  const recall = await buildRecall(workspace, 7, { channel: 'none', voiceChance: 0 }, '喜欢');
  assert.match(recall, /薄荷茶/); assert.doesNotMatch(recall, /橙花茶/);
  assert.deepEqual(core.coreMemoryGraph(workspace).nodes.map(node => node.id), [newId]);
  assert.equal(core.memoryLineage(store, newId).memories.length, 2);
  console.log('ok   记忆演进：新偏好取代旧偏好，保留旧正文与来源，召回和图谱只读当前有效项');

  assert.throws(() => core.commitCoreMemory(workspace, { expectedRevision: 4, operations: [{ op: 'supersede_memory', id: newId, replacementId: newId, source: source('conversation#u4'), epistemic: 'reported', reason: '不允许自环' }] }), /取代|自身|自己/);
  assert.equal(core.readCoreMemory(workspace).revision, 4);
  assert.throws(() => core.commitCoreMemory(workspace, { expectedRevision: 4, operations: [
    { ...record('$guess', '模型猜测用户其实喜欢咖啡', 'assistant#a1'), kind: 'reflection', epistemic: 'inferred', source: { kind: 'reflection', reference: 'assistant#a1' } },
    { op: 'supersede_memory', id: newId, replacementId: '$guess', source: { kind: 'reflection', reference: 'assistant#a1' }, epistemic: 'inferred', reason: '模型猜测不能顶掉用户陈述' },
  ] }), /推测|取代|认知/);
  assert.equal(core.readCoreMemory(workspace).revision, 4);
  assert.throws(() => core.commitCoreMemory(workspace, { expectedRevision: 0, operations: [{ op: 'attach_source', id: newId, source: source('group#u1'), epistemic: 'reported', reason: '群中不能绑定私聊ID' }] }, { groupId: '12345678' }), /目标|不存在/);
  console.log('ok   记忆演进：坏引用、自环、推测取代陈述及跨群目标整批拒绝');

  const again = core.commitCoreMemory(workspace, { expectedRevision: 4, operations: [record('$again', '用户现在最喜欢橙花茶', 'conversation#u5'), { op: 'supersede_memory', id: newId, replacementId: '$again', source: source('conversation#u5'), epistemic: 'reported', reason: '后来又改回橙花茶' }] });
  store = core.readCoreMemory(workspace);
  assert.equal(core.memoryLineage(store, again.references.$again).memories.length, 3);
  assert.equal(store.memories.filter(item => item.status === 'active').length, 1);
  const restored = path.join(workspace, 'restore'); importMemory(restored, exportMemory(workspace));
  assert.deepEqual(core.readCoreMemory(restored), store);
  console.log('ok   记忆演进：偏好改回也保留完整链，导出导入保留来源与取代关系');

  const events = [
    { type: 'turn/start', seq: 0, time: Date.now(), data: { turn: 1 } },
    { type: 'user/message', seq: 1, time: Date.now(), data: { id: 'u6', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '现在我最喜欢柚子茶' }] } },
    { type: 'assistant/message', seq: 2, time: Date.now(), data: { message: { id: 'a6', role: 'assistant', content: [{ type: 'text', text: '我猜是咖啡' }] } } },
    { type: 'turn/end', seq: 3, time: Date.now(), data: { turn: 1, reason: { kind: 'completed' } } },
  ];
  reflection.captureCompletedTurns(workspace, { id: 'evolution-session', header: { cwd: workspace }, firstLiveSeq: 0, snapshotEvents: (from, to) => events.filter(e => e.seq >= from && e.seq < to) }, events.at(-1));
  const lease = reflection.claimReflection(workspace);
  const input = { jobId: lease.job.id, leaseToken: lease.leaseToken, expectedRevision: store.revision, reason: '按用户修正偏好', operations: [record('$last', '用户现在最喜欢柚子茶', 'evolution-session#u6'), { op: 'supersede_memory', id: again.references.$again, replacementId: '$last', source: source('evolution-session#a6'), epistemic: 'reported', reason: '伪装用户来源应拒绝' }] };
  assert.throws(() => reflection.completeReflection(workspace, input), /来源|角色|推测/);
  input.operations[1].source = source('evolution-session#u6');
  reflection.completeReflection(workspace, input);
  assert.equal(core.readCoreMemory(workspace).memories.filter(item => item.status === 'active')[0].content, '用户现在最喜欢柚子茶');
  console.log('ok   记忆演进：提炼取代也要本批真实用户依据，助手不能冒充用户确认');
  const corrupt = structuredClone(core.readCoreMemory(workspace));
  const tail = corrupt.memories.find(item => item.status === 'active');
  tail.status = 'archived'; tail.supersededBy = oldId; tail.supersessionReason = '伪造环'; tail.supersessionSource = { ...source('bad#cycle'), epistemic: 'reported' };
  assert.throws(() => core.validateCoreMemory(corrupt), /成环/);
  const editWorkspace = path.join(workspace, 'explicit-edit');
  const initial = core.commitCoreMemory(editWorkspace, { expectedRevision: 0, operations: [record('$m', '原始正文', 'edit#u1')] });
  core.commitCoreMemory(editWorkspace, { expectedRevision: 1, operations: [{ op: 'attach_source', id: initial.references.$m, source: source('edit#u2'), epistemic: 'reported', reason: '绑定原始正文' }] });
  core.commitCoreMemory(editWorkspace, { expectedRevision: 2, operations: [{ op: 'update_memory', id: initial.references.$m, content: '后来明确修正的正文', source: source('edit#u3'), epistemic: 'reported', reason: '显式带来源的正文修正' }] });
  const edited = core.readCoreMemory(editWorkspace).memories[0];
  assert.equal(edited.sources.length, 2);
  assert.deepEqual(core.currentMemorySources(edited).map(item => item.reference), ['edit#u3']);
  console.log('ok   记忆演进：导入拒绝取代环；旧正文来源留历史，不冒充新正文的支持证据');
  assert.throws(() => core.commitCoreMemory(path.join(workspace, 'bad-fields'), { expectedRevision: 0, operations: [{ ...record('$bad', '未知字段', 'bad#u1'), title: '不能猜字段' }] }), /record_memory.*title/);
  const toolWorkspace = path.join(workspace, 'actual-tools');
  const tools = new Map();
  const dispose = await apply({ tools: { register(tool) { tools.set(tool.name, tool); } }, on() {}, logger: { info() {}, warn() {} } }, { workspace: toolWorkspace, channel: 'none', proactiveEnabled: false, reflectionBackgroundEnabled: false });
  try {
    const execute = { agent: { session: { id: 'tool-session', seq: 4, header: { cwd: toolWorkspace }, snapshotEvents: () => events } } };
    const memoryTool = tools.get('love_core_memory');
    const view = JSON.parse((await memoryTool.execute({ action: 'read' }, execute)).text);
    assert.ok(view.sourceHints.some(item => item.reference === 'tool-session#u6' && item.role === 'user'));
    const operationSchemas = memoryTool.parameters.properties.operations.items.oneOf;
    assert.ok(operationSchemas.find(item => item.properties.op.const === 'record_memory').required.includes('reason'));
    assert.ok(operationSchemas.find(item => item.properties.op.const === 'create_core').required.includes('evidenceIds'));
    await assert.rejects(() => memoryTool.execute({ action: 'commit', expectedRevision: 0, operations: [record('$fake', '不能伪造当前会话来源', '口头描述而不是消息引用')] }, execute), /来源/);
    await memoryTool.execute({ action: 'commit', expectedRevision: 0, operations: [record('$real', '用户现在最喜欢柚子茶', 'tool-session#u6')] }, execute);
    assert.equal(core.readCoreMemory(toolWorkspace).revision, 1);
  } finally { dispose?.(); }
  console.log('ok   记忆演进：真实工具给出精确必填字段及消息来源提示，拒绝口头伪造的来源引用');
} finally {
  assert.equal(path.dirname(workspace), path.resolve(os.tmpdir()));
  fs.rmSync(workspace, { recursive: true, force: true });
}
