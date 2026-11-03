import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.LOVE_TEST_ISOLATED = '1';
const { apply, buildRecall } = await import('../index.js');
const { readCoreMemory, coreMemoryFile, commitCoreMemory } = await import('../core-memory.js');
const { buildGraph, buildGroupGraph } = await import('../graph.js');
const { exportMemory, importMemory } = await import('../backup.js');
const { legacyCandidates } = await import('../legacy-memory.js');
const { DatabaseSync } = await import('node:sqlite');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'love-migration-'));
const netFile = path.join(workspace, 'memory', 'net.json');
const net = { nodes: { 合作: { mentions: 2, type: 'thing' } }, edges: [], episodes: [
  { date: '2026-11-01', text: '一起完成了星图布局', entities: ['合作'] },
  { date: '2026-11-01', text: '讨论了记忆如何分类', entities: [] },
] };
fs.mkdirSync(path.dirname(netFile), { recursive: true });
const saveNet = () => fs.writeFileSync(netFile, JSON.stringify(net));
saveNet();
const tools = new Map();
const dispose = await apply({ tools: { register(tool) { tools.set(tool.name, tool); } }, on() {}, logger: { info() {}, warn() {} } }, { enabled: true, workspace, workspaces: [], proactiveEnabled: false, heartbeatEnabled: false, channel: 'none' });
const exec = (id = 'migration-test') => ({ agent: { session: { id, header: { cwd: workspace } } } });
const invoke = async (input, id) => JSON.parse((await tools.get('love_core_memory').execute(input, exec(id))).text);
try {
  const preview = await invoke({ action: 'legacy' });
  assert.ok(Array.isArray(preview.candidates), '应提供只读旧记忆候选');
  assert.equal(preview.candidates.length, 2);
  assert.equal(fs.existsSync(coreMemoryFile(workspace)), false);
  const first = preview.candidates.find((item) => item.content.includes('星图'));
  assert.ok(first.legacyId);
  net.episodes.reverse(); saveNet();
  const reordered = await invoke({ action: 'legacy' });
  assert.equal(reordered.candidates.find((item) => item.content.includes('星图')).legacyId, first.legacyId);
  console.log('ok   旧记忆迁移：只读预览、候选稳定引用不受数组重排影响');

  const core = { op: 'create_core', ref: '$core', title: '共同创作', summary: '一起构建和修复事物的经历', reason: '这组经历对我有持续意义', evidenceIds: ['$old'] };
  const adopt = { op: 'adopt_legacy', ref: '$old', legacyId: first.legacyId, coreId: '$core', kind: 'event', importance: 4, reason: '我把它归入共同创作' };
  const originalText = net.episodes.find((item) => item.text.includes('星图')).text;
  net.episodes.find((item) => item.text.includes('星图')).text = '这条来源已修改'; saveNet();
  await assert.rejects(() => invoke({ action: 'commit', expectedRevision: 0, operations: [core, adopt] }), /来源.*变化|候选.*不存在/);
  assert.equal(fs.existsSync(coreMemoryFile(workspace)), false);
  net.episodes.find((item) => item.text === '这条来源已修改').text = originalText; saveNet();
  const before = fs.readFileSync(netFile, 'utf8');
  await assert.rejects(() => invoke({ action: 'commit', expectedRevision: 0, operations: [core, { ...adopt, content: '不能替换原文' }] }), /字段/);
  const committed = await invoke({ action: 'commit', expectedRevision: 0, operations: [core, adopt] });
  const memoryId = committed.references.$old;
  const memory = readCoreMemory(workspace).memories.find((item) => item.id === memoryId);
  assert.equal(memory.content, first.content);
  assert.equal(memory.epistemic, 'inferred');
  assert.equal(memory.source.kind, 'import');
  assert.equal(fs.readFileSync(netFile, 'utf8'), before);
  const graph = await buildGraph(workspace);
  assert.equal(graph.nodes.filter((item) => item.content === first.content).length, 1);
  assert.ok(graph.links.some((link) => link.source === memoryId && link.target === 'ent:合作'));
  assert.equal((await invoke({ action: 'legacy' })).candidates.length, 1);
  await assert.rejects(() => invoke({ action: 'commit', expectedRevision: 1, operations: [{ ...adopt, coreId: committed.references.$core }] }), /已迁移/);
  const recall = await buildRecall(workspace, 7, { voiceChance: 0, channel: 'none' }, '星图');
  assert.equal(recall.split(first.content).length - 1, 1);
  fs.writeFileSync(netFile, JSON.stringify({ ...net, episodes: [] }));
  await assert.rejects(() => invoke({ action: 'commit', expectedRevision: 1, operations: [{ op: 'release_legacy', id: memoryId, reason: '不能假装恢复丢失来源' }] }), /旧来源.*不存在/);
  assert.equal(readCoreMemory(workspace).revision, 1);
  fs.writeFileSync(netFile, before);
  console.log('ok   旧记忆迁移：变更来源整批拒绝、原文不可替换、图谱去重并保留原关联、召回不重复');

  const later = await invoke({ action: 'commit', expectedRevision: 1, operations: [{ op: 'record_memory', ref: '$new', coreId: 'self', content: '我重视一起解决问题的过程', kind: 'reflection', epistemic: 'inferred', importance: 5, reason: '对这段经历的理解', source: { kind: 'reflection', reference: 'test-message' } }, { op: 'update_memory', id: memoryId, content: '共同解决问题让我更理解合作', reason: '我对这段经历有了新的理解' }, { op: 'archive', id: memoryId, reason: '先归档查看' }] });
  assert.ok(!(await buildGraph(workspace)).nodes.some((item) => item.content === first.content), '归档不能使旧记录重新出现');
  await invoke({ action: 'commit', expectedRevision: 2, operations: [{ op: 'release_legacy', id: memoryId, reason: '撤回这一条迁移' }] });
  assert.ok((await buildGraph(workspace)).nodes.some((item) => item.content === first.content && item.id !== memoryId));
  assert.ok(readCoreMemory(workspace).memories.some((item) => item.id === later.references.$new && item.status === 'active'));
  assert.equal(readCoreMemory(workspace).memories.find((item) => item.id === memoryId).content, '共同解决问题让我更理解合作');
  assert.equal(fs.readFileSync(netFile, 'utf8'), before);
  console.log('ok   旧记忆迁移：普通归档不复活旧记录，显式撤回恢复旧图且不覆盖后续记忆');

  const groupDir = path.join(workspace, 'memory', 'groups', '12345678');
  fs.mkdirSync(groupDir, { recursive: true });
  fs.writeFileSync(path.join(groupDir, 'group.json'), JSON.stringify({ members: {}, notes: [{ text: '群里一起学习', at: '2026-11-01' }] }));
  const groupPreview = await invoke({ action: 'legacy' }, 'qq-group-12345678');
  assert.equal(groupPreview.candidates.length, 1);
  assert.match(groupPreview.candidates[0].content, /群里一起学习/);
  await assert.rejects(() => invoke({ action: 'commit', expectedRevision: 0, operations: [{ ...adopt, coreId: 'self' }] }, 'qq-group-12345678'), /候选.*不存在/);
  assert.equal(fs.existsSync(coreMemoryFile(workspace, '12345678')), false);
  await invoke({ action: 'commit', expectedRevision: 0, operations: [{ ...adopt, coreId: 'self', legacyId: groupPreview.candidates[0].legacyId }] }, 'qq-group-12345678');
  assert.equal(readCoreMemory(workspace).revision, 3);
  assert.equal((await buildGroupGraph(workspace, '12345678')).nodes.filter((item) => (item.content || item.text) === '群里一起学习').length, 1);
  const restored = fs.mkdtempSync(path.join(os.tmpdir(), 'love-migration-import-'));
  try {
    importMemory(restored, exportMemory(workspace));
    assert.equal(readCoreMemory(restored, '12345678').memories[0].legacy.id, groupPreview.candidates[0].legacyId);
    assert.equal(readCoreMemory(restored).memories.find((item) => item.id === memoryId).legacy.released, true);
    const groupMemory = readCoreMemory(restored, '12345678').memories[0];
    const restoredCandidates = legacyCandidates(await buildGroupGraph(restored, '12345678', { legacyOnly: true }), { memories: [] }).candidates;
    commitCoreMemory(restored, { expectedRevision: 1, operations: [{ op: 'release_legacy', id: groupMemory.id, reason: '导入后仍可撤回' }] }, { groupId: '12345678', legacyCandidates: restoredCandidates });
    assert.ok((await buildGroupGraph(restored, '12345678')).nodes.some((item) => item.id.startsWith('group-note:') && item.text === '群里一起学习'));
  } finally { assert.equal(path.dirname(restored), path.resolve(os.tmpdir())); fs.rmSync(restored, { recursive: true, force: true }); }
  console.log('ok   旧记忆迁移：群聊范围隔离、群图去重和映射导入导出');

  net.episodes.push(...Array.from({ length: 41 }, (_, index) => ({ date: '2026-11-01', text: `分页来源 ${index}` })), { date: '', text: '长'.repeat(4001) }); saveNet();
  const paged = await invoke({ action: 'legacy' });
  assert.equal(paged.totalCandidates, 43);
  assert.equal(paged.candidates.length, 40);
  assert.equal(paged.nextOffset, 40);
  assert.equal(paged.excluded.length, 1);
  assert.equal((await invoke({ action: 'legacy', offset: 40 })).candidates.length, 3);
  assert.equal((await invoke({ action: 'legacy', query: '分页来源 40' })).candidates[0].content, '2026-11-01 分页来源 40');
  console.log('ok   旧记忆迁移：分页与查询可取完整候选，超长原文明确排除而非截断');

  const meowWorkspace = path.join(workspace, 'meow-test');
  fs.mkdirSync(path.join(meowWorkspace, '.dsh-meow'), { recursive: true });
  const db = new DatabaseSync(path.join(meowWorkspace, '.dsh-meow', 'memory.db'));
  try {
    db.exec('CREATE TABLE fact (id TEXT PRIMARY KEY, content TEXT, keywords TEXT, importance INTEGER, status TEXT)');
    const statement = db.prepare('INSERT INTO fact VALUES (?, ?, ?, ?, ?)');
    statement.run('0123456789-aaaa', '第一条完整 ID 记忆', '["合作"]', 3, 'active');
    statement.run('0123456789-bbbb', '第二条完整 ID 记忆', '["合作"]', 3, 'active');
  } finally { db.close(); }
  const meowGraph = await buildGraph(meowWorkspace, { legacyOnly: true });
  assert.equal(meowGraph.nodes.length, 2);
  assert.equal(new Set(meowGraph.nodes.map((item) => item.id)).size, 2);
  assert.equal(meowGraph.links.length, 1);
  const meowCandidates = legacyCandidates(meowGraph, readCoreMemory(meowWorkspace)).candidates;
  assert.equal(meowCandidates.length, 2);
  const selectedMeow = meowCandidates.find((item) => item.content === '第一条完整 ID 记忆');
  commitCoreMemory(meowWorkspace, { expectedRevision: 0, operations: [{ op: 'adopt_legacy', ref: '$meow', legacyId: selectedMeow.legacyId, coreId: 'self', kind: 'fact', importance: 3, reason: '保留旧记忆及其索引' }] }, { legacyCandidates: meowCandidates });
  const adoptedMeow = (await buildGraph(meowWorkspace)).nodes.find((item) => item.coreId === 'self');
  assert.deepEqual(adoptedMeow.keywords, ['合作']);
  assert.ok(adoptedMeow.aliases.includes('mem:fact:0123456789-aaaa'));
  console.log('ok   旧记忆迁移：meow 相同前缀 ID 不碰撞，原关键词关联保留');

  const archiveDir = path.join(meowWorkspace, 'memory', 'journal', 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(path.join(archiveDir, '2025-01-01.md'), '# 旧日记\n- 归档经历仍可选择迁移\n');
  fs.writeFileSync(path.join(meowWorkspace, 'memory', 'life.jsonl'), Array.from({ length: 90 }, (_, index) => JSON.stringify({ date: '2025-01-01', text: `旧生活 ${index}` })).join('\n'));
  fs.writeFileSync(path.join(meowWorkspace, 'memory', 'net.json'), JSON.stringify({ episodes: Array.from({ length: 950 }, (_, index) => ({ text: `旧事件 ${index}` })) }));
  const complete = await buildGraph(meowWorkspace, { legacyOnly: true });
  assert.equal(complete.nodes.length, 1043);
  assert.ok(complete.nodes.some((item) => item.content.includes('归档经历仍可选择迁移')));
  assert.ok(complete.nodes.some((item) => item.content.endsWith('旧生活 0')));
  assert.ok((await buildGraph(meowWorkspace)).nodes.length <= 900);
  console.log('ok   旧记忆迁移：归档日记、较早小生活及超过900节点来源仍可预览，主图保留显示上限');
} finally {
  dispose?.();
  assert.equal(path.dirname(workspace), path.resolve(os.tmpdir()));
  fs.rmSync(workspace, { recursive: true, force: true });
}
