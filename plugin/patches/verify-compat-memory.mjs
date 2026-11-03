import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
process.env.LOVE_TEST_ISOLATED = '1';
const { apply, buildRecall, recentSkills, learnSkill, handleApi } = await import('../index.js');
const { readCoreMemory, validateCoreMemory } = await import('../core-memory.js');
const { exportMemory, importMemory } = await import('../backup.js');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'love-compat-'));
const tools = new Map();
const dispose = await apply({ tools: { register(tool) { tools.set(tool.name, tool); } }, on() {}, logger: { info() {}, warn() {} } }, { workspace, channel: 'none', proactiveEnabled: false, reflectionBackgroundEnabled: false, autoLearn: false });
const exec = id => ({ agent: { session: { id: id || 'compat', header: { cwd: workspace } } } });
const call = (name, args, id) => tools.get(name).execute(args, exec(id));
const memory = async (args, id) => JSON.parse((await call('love_core_memory', args, id)).text);
const profileFile = path.join(workspace, 'memory/profile.json');
const learningFile = path.join(workspace, 'memory/learning.json');
try {
  await call('love_record', { kind: 'fact', key: '喜欢', value: '橙花茶' });
  await call('love_record', { kind: 'fact', key: '生日', value: '六月三日' });
  await call('love_record', { kind: 'fact', key: '饮品', value: '橙花茶' });
  await call('love_learn', { action: 'add', name: '沏茶', note: '旧方法先放茶再加水', source: 'user' });
  const rawProfile = fs.readFileSync(profileFile, 'utf8'), rawLearning = fs.readFileSync(learningFile, 'utf8');
  let preview = await memory({ action: 'legacy' });
  const tea = preview.candidates.find(item => item.layer === 'profile' && item.slot?.field === 'likes');
  assert.ok(tea, '旧偏好必须能预览并迁入模型自行选择的核心');
  const skill = preview.candidates.find(item => item.layer === 'learning');
  assert.ok(skill?.content.includes('旧方法先放茶再加水'));
  const birth = preview.candidates.find(item => item.slot?.field === 'birthday');
  const fact = preview.candidates.find(item => item.slot?.field === 'facts' && item.slot.key === '饮品');
  assert.ok(birth && fact);
  const adopt = (ref, candidate, kind) => ({ op: 'adopt_legacy', ref, legacyId: candidate.legacyId, coreId: '$core', kind, importance: 3, reason: '模型主动选择归属，保留旧来源' });
  const changedBeforeCommit = JSON.parse(rawProfile); changedBeforeCommit.birthday = '六月五日';
  fs.writeFileSync(profileFile, JSON.stringify(changedBeforeCommit));
  await assert.rejects(() => memory({ action: 'commit', expectedRevision: 0, operations: [{ ...adopt('$birth', birth, 'fact'), coreId: 'self' }] }), /候选.*不存在|来源.*变化/);
  assert.equal(readCoreMemory(workspace).revision, 0);
  fs.writeFileSync(profileFile, rawProfile);
  const result = await memory({ action: 'commit', expectedRevision: 0, operations: [
    { op: 'create_core', ref: '$core', title: '我理解的日常', summary: '关于日常的记忆', reason: '我决定这样归类', evidenceIds: ['$tea', '$skill'] },
    adopt('$tea', tea, 'preference'), adopt('$skill', skill, 'skill'), adopt('$birth', birth, 'fact'), adopt('$fact', fact, 'preference'),
  ] });
  assert.equal(fs.readFileSync(profileFile, 'utf8'), rawProfile);
  assert.equal(fs.readFileSync(learningFile, 'utf8'), rawLearning);
  const corrupt = structuredClone(readCoreMemory(workspace));
  corrupt.memories[0].legacy.slot.field = 'birthday';
  assert.throws(() => validateCoreMemory(corrupt), /位置.*快照/);
  let recall = await buildRecall(workspace, 7, { channel: 'none', voiceChance: 0 }, '橙花茶');
  assert.equal(recall.split(tea.content).length - 1, 1);
  console.log('ok   兼容记忆：旧工具写入可选择性迁移，模型选核心，原文件不改，召回不重复');

  const source = { kind: 'conversation', reference: 'compat#correction' };
  const replacement = (ref, content, kind) => ({ op: 'record_memory', ref, coreId: result.references.$core, content, kind, epistemic: 'reported', importance: 4, reason: '明确修正', source });
  const replace = (id, ref) => ({ op: 'supersede_memory', id, replacementId: ref, source, epistemic: 'reported', reason: '用户明确修改' });
  await memory({ action: 'commit', expectedRevision: 1, operations: [
    replacement('$new', '用户现在喜欢薄荷茶', 'preference'), replace(result.references.$tea, '$new'), replace(result.references.$fact, '$new'),
    replacement('$newSkill', '沏茶的新方法是先加水再放茶', 'skill'), replace(result.references.$skill, '$newSkill'),
    replacement('$newBirth', '用户的生日改正为六月四日', 'fact'), replace(result.references.$birth, '$newBirth'),
  ] });
  recall = await buildRecall(workspace, 7, { channel: 'none', voiceChance: 0 });
  assert.match(recall, /薄荷茶/); assert.doesNotMatch(recall, /橙花茶|旧方法|六月三日/);
  const learned = await call('love_learn', { action: 'list' });
  assert.match(learned.text, /先加水再放茶/); assert.doesNotMatch(learned.text, /旧方法/);
  assert.ok(recentSkills(workspace, 5).some(item => item.note.includes('先加水再放茶')));
  assert.equal(fs.readFileSync(profileFile, 'utf8'), rawProfile);
  assert.equal(fs.readFileSync(learningFile, 'utf8'), rawLearning);
  const server = http.createServer((req, res) => handleApi(req, res, { workspace, channel: 'none', voiceChance: 0 }).catch(error => {
    res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: error.message }));
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/love-companion/api`;
    const list = await (await fetch(base + '/learning')).json();
    assert.ok(list.items.some(item => item.managed && item.note.includes('先加水再放茶')));
    assert.ok(list.items.every(item => !item.note.includes('旧方法')));
    const response = await fetch(base + '/learning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '沏茶', note: '不要从UI复活旧值' }) });
    assert.equal(response.ok, false);
    assert.match((await response.json()).error, /love_core_memory/);
  } finally { await new Promise(resolve => server.close(resolve)); }
  await assert.rejects(() => call('love_record', { kind: 'fact', key: '偏好', value: '咖啡' }), /love_core_memory/);
  await assert.rejects(() => call('love_record', { kind: 'fact', key: '生日', value: '七月一日' }), /love_core_memory/);
  await assert.rejects(() => call('love_record', { kind: 'fact', key: '饮品', value: '咖啡' }), /love_core_memory/);
  assert.throws(() => learnSkill(workspace, { name: '沏茶', note: '旧入口不能覆盖新版' }), /love_core_memory/);
  assert.equal(fs.readFileSync(profileFile, 'utf8'), rawProfile);
  assert.equal(fs.readFileSync(learningFile, 'utf8'), rawLearning);
  await assert.rejects(() => memory({ action: 'commit', expectedRevision: 2, operations: [{ op: 'release_legacy', id: result.references.$tea, reason: '不能复活被取代项' }] }), /取代/);
  console.log('ok   兼容记忆：取代后各当前读路径不复活旧值，旧写入口明确转交核心工具且不破坏文件');

  await call('love_record', { kind: 'fact', key: '讨厌', value: '熬夜' });
  await call('love_learn', { action: 'add', name: '画画', note: '先画轮廓' });
  preview = await memory({ action: 'legacy' });
  const art = preview.candidates.find(item => item.layer === 'learning' && item.content.includes('画画'));
  const receipt = await memory({ action: 'commit', expectedRevision: 2, operations: [{ ...adopt('$art', art, 'skill'), coreId: result.references.$core }] });
  await memory({ action: 'commit', expectedRevision: 3, operations: [{ op: 'release_legacy', id: receipt.references.$art, reason: '撤回未取代迁移' }] });
  await call('love_learn', { action: 'add', name: '画画', note: '更换轮廓方法' });
  assert.match((await call('love_learn', { action: 'search', query: '画画' })).text, /更换轮廓方法/);
  const changed = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
  changed.likes = ['外部手工修改的偏好'];
  fs.writeFileSync(profileFile, JSON.stringify(changed));
  assert.match(await buildRecall(workspace, 7, { channel: 'none', voiceChance: 0 }), /外部手工修改的偏好/);
  const drift = (await memory({ action: 'legacy' })).candidates.find(item => item.content.includes('外部手工修改'));
  assert.ok(drift && drift.legacyId !== tea.legacyId, '只屏蔽精确快照，不静默隐藏外部变化');
  console.log('ok   兼容记忆：未迁移字段继续兼容、撤回恢复写入，外部改动保持可见且产生新候选');

  const restored = path.join(workspace, 'restored');
  importMemory(restored, exportMemory(workspace));
  assert.deepEqual(readCoreMemory(restored), readCoreMemory(workspace));
  assert.doesNotMatch(await buildRecall(restored, 7, { channel: 'none', voiceChance: 0 }), /橙花茶|旧方法|六月三日/);
  const groupPreview = await memory({ action: 'legacy' }, 'qq-group-12345678');
  assert.ok(groupPreview.candidates.every(item => !['profile', 'learning'].includes(item.layer)));
  assert.doesNotMatch(await buildRecall(workspace, 7, {}, '', { groupId: '12345678', workspace }), /薄荷茶|沏茶|六月四日/);
  console.log('ok   兼容记忆：备份保留来源快照/映射，群聊不泄漏私聊档案和学习项');
} finally {
  dispose?.();
  assert.equal(path.dirname(workspace), path.resolve(os.tmpdir()));
  fs.rmSync(workspace, { recursive: true, force: true });
}
