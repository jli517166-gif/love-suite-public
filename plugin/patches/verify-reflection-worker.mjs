import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.env.LOVE_TEST_ISOLATED = '1';
const { buildRecall, apply } = await import('../index.js');
const queue = await import('../reflection.js');
const { readCoreMemory, commitCoreMemory } = await import('../core-memory.js');
const { exportMemory, importMemory } = await import('../backup.js');
const workerModule = await import('../reflection-worker.js').catch(() => ({}));
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'love-reflection-worker-'));
const put = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
const route = { provider: 'fixture-provider', model: 'fixture-model' };
let clock = Date.UTC(2026, 10, 1, 4);
const seed = (ws, id = 'session', groupId = '', text = '我喜欢安静的雨天') => {
  const events = [
    { type: 'turn/start', seq: 0, time: clock, data: { turn: 1 } },
    { type: 'user/message', seq: 1, time: clock, data: { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] } },
    { type: 'turn/end', seq: 2, time: clock, data: { turn: 1, reason: { kind: 'completed' } } },
  ];
  const session = { id, header: { cwd: ws }, firstLiveSeq: 0, requestHeader: () => ({ config: { ...route, maxTokens: 99999 } }), snapshotEvents: (from, to) => events.filter(e => e.seq >= from && e.seq < to) };
  queue.captureCompletedTurns(ws, session, events.at(-1), { groupId });
  return { session, event: events.at(-1) };
};
try {
  put(path.join(workspace, 'memory/profile.json'), { nickname: 'PRIVATE_ONLY', likes: ['PRIVATE_PREFERENCE'] });
  put(path.join(workspace, 'memory/groups/12345678/group.json'), { id: '12345678', members: {}, notes: [{ text: 'GROUP_A_NOTE' }] });
  put(path.join(workspace, 'memory/groups/23456789/group.json'), { id: '23456789', members: {}, notes: [{ text: 'GROUP_B_NOTE' }] });
  const recall = await buildRecall(workspace, 7, { channel: 'none', voiceChance: 0 }, '', { groupId: '12345678' });
  assert.match(recall, /GROUP_A_NOTE/);
  assert.doesNotMatch(recall, /PRIVATE_ONLY|PRIVATE_PREFERENCE|GROUP_B_NOTE/);
  assert.equal(fs.existsSync(path.join(workspace, 'memory/self.md')), false);
  console.log('ok   后台整理：群召回只含当前群，不读写私聊概况与自我');

  assert.equal(typeof workerModule.createReflectionWorker, 'function', '后台执行器尚未实现');
  const privateWorkspace = path.join(workspace, 'worker');
  seed(privateWorkspace);
  let config = { reflectionEnabled: true, reflectionBackgroundEnabled: true, reflectionCooldownMinutes: 10, reflectionMaxCallsPerDay: 2, reflectionMaxOutputTokens: 4096 };
  let calls = 0, empty = false;
  const requests = [];
  const llm = {
    async prepareCall(input, signal, configure) {
      signal.throwIfAborted();
      const controls = configure({}, { reasoning: { efforts: [{ id: 'low' }, { id: 'high' }] } });
      const preparedConfig = { ...input, ...controls };
      return { config: preparedConfig, stream(options) {
        calls++; requests.push(options);
        for (const [key, value] of Object.entries(preparedConfig)) assert.deepEqual(options[key], value);
        assert.equal(options.maxTokens, 4096);
        assert.equal(options.reasoningEffort, 'low');
        assert.deepEqual(options.tools, []);
        assert.equal(options.messages[0].role, 'user');
        const data = JSON.parse(options.messages[0].content[0].text);
        const reference = data.materials[0].reference;
        return (async function* () {
          yield { type: 'text-delta', index: 0, text: JSON.stringify({ operations: empty ? [] : [{ op: 'record_memory', ref: '$m', coreId: 'self', kind: 'preference', epistemic: 'reported', importance: 4, content: '用户喜欢安静的雨天', reason: '明确偏好', source: { kind: 'conversation', reference } }], reason: empty ? '没有新内容' : '保留偏好' }) };
          yield { type: 'usage', usage: { inputTokens: 500, outputTokens: 100 } };
          yield { type: 'finish', reason: { kind: 'stop' } };
        })();
      } };
    },
  };
  const scopes = () => [{ primary: privateWorkspace, workspace: privateWorkspace, groupId: '' }];
  let worker = workerModule.createReflectionWorker({ llm: () => llm, scopes, config: () => config, now: () => clock });
  await worker.tick();
  assert.equal(calls, 1);
  assert.equal(readCoreMemory(privateWorkspace).memories.length, 1);
  assert.equal(queue.reflectionStatus(privateWorkspace).done, 1);
  assert.equal(worker.describe(privateWorkspace).dailyCalls, 1);
  assert.equal(worker.describe(privateWorkspace).lastResult.status, 'done');
  assert.equal(requests[0].provider, route.provider);
  worker.stop();
  worker = workerModule.createReflectionWorker({ llm: () => llm, scopes, config: () => config, now: () => clock });
  seed(privateWorkspace, 'next-session', '', '新的真实材料');
  await worker.tick();
  assert.equal(calls, 1, '重启后仍受持久化冷却限制');
  clock += 600001; empty = true;
  await worker.tick();
  assert.equal(calls, 2);
  assert.equal(queue.reflectionStatus(privateWorkspace).skipped, 1);
  seed(privateWorkspace, 'daily-limit'); clock += 600001;
  await worker.tick();
  assert.equal(calls, 2, '达到每日上限不再调用');
  assert.equal(worker.describe(privateWorkspace).phase, 'daily_limit');
  clock += 86400000;
  await worker.tick();
  assert.equal(calls, 3, '新UTC日恢复预算');
  assert.equal(worker.describe(privateWorkspace).dailyCalls, 1);
  worker.stop();
  console.log('ok   后台整理：独立模型调用、来源提交、空结果、持久化冷却和每日预算');

  const makeLlm = (generate) => ({ async prepareCall(input) { return { config: input, stream: options => generate(options) }; } });
  const emptyStream = async function* () { yield { type: 'text-delta', index: 0, text: '{"operations":[],"reason":"无新增"}' }; yield { type: 'finish', reason: { kind: 'stop' } }; };
  const makeWorker = (ws, service, extra = {}) => workerModule.createReflectionWorker({ llm: () => service, scopes: () => [{ primary: ws, workspace: ws, groupId: '' }], config: () => ({ ...config, reflectionMaxCallsPerDay: 6 }), now: () => clock, ...extra });
  const branchWorkspace = path.join(workspace, 'model-branch'); seed(branchWorkspace);
  const branchWorker = makeWorker(branchWorkspace, makeLlm(async function* (options) {
    const source = { kind: 'reflection', reference: JSON.parse(options.messages[0].content[0].text).materials[0].reference };
    yield { type: 'text-delta', text: JSON.stringify({ reason: '按本轮意义形成核心和记忆关联', operations: [
      { op: 'create_core', ref: '$core', title: '安静相伴', summary: '对一起安静待着的理解', reason: '本轮文字的意义', evidenceIds: ['$a', '$b'] },
      ...['我理解用户珍惜安静', '我想珍惜一起平静相处的时刻'].map((content, i) => ({ op: 'record_memory', ref: i ? '$b' : '$a', coreId: '$core', content, kind: 'reflection', epistemic: 'inferred', importance: 4, reason: '这是我的理解', source })),
      { op: 'link', ref: '$link', source: '$a', target: '$b', relation: '共同意义', reason: '两段理解来自同一轮实际表达' },
    ] }) };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }));
  await branchWorker.tick();
  const branchStore = readCoreMemory(branchWorkspace);
  assert.equal(branchStore.cores[1].title, '安静相伴');
  assert.ok(branchStore.memories.every(memory => memory.coreId === branchStore.cores[1].id));
  assert.equal(branchStore.links.length, 1);
  assert.equal(branchStore.cores[1].parentId, 'self');
  await branchWorker.stop();
  console.log('ok   后台整理：模型自行命名核心、前向引用归属与星间关联，保留自我总核心层级');
  const evolutionWorkspace = path.join(workspace, 'evolution');
  let evolutionStep = 0;
  const evolutionWorker = makeWorker(evolutionWorkspace, makeLlm(async function* (options) {
    const data = JSON.parse(options.messages[0].content[0].text), reference = data.materials[0].reference;
    const existing = data.existing.memories[0];
    const add = (content) => ({ op: 'record_memory', ref: '$new', coreId: 'self', content, kind: 'preference', epistemic: 'reported', importance: 4, reason: '真实用户依据', source: { kind: 'conversation', reference } });
    const operations = evolutionStep === 0 ? [add('用户最喜欢橙花茶')] : evolutionStep === 1 ? [{ op: 'attach_source', id: existing.id, source: { kind: 'conversation', reference }, epistemic: 'reported', reason: '重复确认同一偏好' }] : [add('用户现在最喜欢薄荷茶'), { op: 'supersede_memory', id: existing.id, replacementId: '$new', source: { kind: 'conversation', reference }, epistemic: 'reported', reason: '用户明确改变偏好' }];
    evolutionStep++;
    yield { type: 'text-delta', text: JSON.stringify({ operations, reason: '依据本轮文字整理' }) };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }));
  for (const [index, content] of ['喜欢橙花茶', '仍然喜欢橙花茶', '现在改成薄荷茶'].entries()) { seed(evolutionWorkspace, 'evolution-' + index, '', content); await evolutionWorker.tick(); clock += 600001; }
  const evolutionStore = readCoreMemory(evolutionWorkspace);
  assert.equal(evolutionStore.memories.length, 2);
  assert.equal(evolutionStore.memories[0].sources.length, 2);
  assert.equal(evolutionStore.memories[0].supersededBy, evolutionStore.memories[1].id);
  assert.equal(evolutionStore.memories[1].status, 'active');
  await evolutionWorker.stop();
  console.log('ok   后台整理：多轮新增、重复来源绑定与明确修正取代经过同一worker提交链');
  const groupWorkspace = path.join(workspace, 'groups');
  const memory = (content, ref = '$seed') => ({ op: 'record_memory', ref, coreId: 'self', content, kind: 'reflection', epistemic: 'inferred', importance: 3, reason: '测试隔离', source: { kind: 'reflection', reference: 'fixture-only' } });
  commitCoreMemory(groupWorkspace, { expectedRevision: 0, operations: [memory('PRIVATE_CORE_ONLY')] });
  commitCoreMemory(groupWorkspace, { expectedRevision: 0, operations: [memory('GROUP_A_CORE')] }, { groupId: '12345678' });
  commitCoreMemory(groupWorkspace, { expectedRevision: 0, operations: [memory('GROUP_B_CORE')] }, { groupId: '23456789' });
  seed(groupWorkspace, 'qq-group-12345678', '12345678', 'GROUP_A_TEXT');
  seed(groupWorkspace, 'qq-group-23456789', '23456789', 'GROUP_B_TEXT');
  const groupInputs = [];
  const groupWorker = makeWorker(groupWorkspace, makeLlm(async function* (options) { groupInputs.push(options.messages[0].content[0].text); yield* emptyStream(); }), { scopes: () => ['12345678', '23456789'].map(groupId => ({ primary: groupWorkspace, workspace: groupWorkspace, groupId })) });
  await groupWorker.tick();
  assert.match(groupInputs[0], /GROUP_A_TEXT|GROUP_A_CORE/);
  assert.doesNotMatch(groupInputs[0], /PRIVATE_CORE_ONLY|GROUP_B_TEXT|GROUP_B_CORE/);
  await groupWorker.tick(); assert.equal(groupInputs.length, 1, '同工作区两个群共享冷却');
  clock += 600001; await groupWorker.tick();
  assert.match(groupInputs[1], /GROUP_B_TEXT|GROUP_B_CORE/);
  assert.doesNotMatch(groupInputs[1], /PRIVATE_CORE_ONLY|GROUP_A_TEXT|GROUP_A_CORE/);
  assert.equal(groupWorker.describe(groupWorkspace).dailyCalls, 2);
  await groupWorker.stop();
  console.log('ok   后台整理：模型输入只有当前群材料和核心，不混私聊或其他群；群共享预算');

  for (const action of ['disable', 'suspend', 'timeout', 'stop']) {
    const ws = path.join(workspace, 'cancel-' + action); seed(ws);
    let release, enter, timeoutCallback;
    const entered = new Promise(resolve => { enter = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let localConfig = { ...config, reflectionBackgroundEnabled: true };
    const w = makeWorker(ws, makeLlm(async function* () { enter(); await gate; yield* emptyStream(); }), {
      config: () => localConfig,
      setTimer(fn, ms) { assert.equal(ms, 90000); timeoutCallback = fn; return { unref() {} }; }, clearTimer() {},
    });
    const pending = w.tick(); await entered;
    assert.equal(w.tick(), pending, '同一时刻只有一个执行批次');
    let resume;
    if (action === 'disable') { localConfig.reflectionBackgroundEnabled = false; w.reconcile(); }
    if (action === 'timeout') timeoutCallback();
    if (action === 'stop') await w.stop();
    if (action === 'suspend') resume = await w.suspend();
    await pending;
    assert.equal(readCoreMemory(ws).revision, 0);
    assert.equal(queue.reflectionStatus(ws).pending, 1);
    assert.equal(w.describe(ws).dailyCalls, 1, '取消的已预留调用仍计预算');
    assert.equal(w.describe(ws).lastResult.status, action === 'timeout' ? 'failed' : 'cancelled');
    release(); resume?.(); await w.stop(); await Promise.resolve();
    assert.equal(readCoreMemory(ws).revision, 0, '取消后迟到输出不能写记忆');
  }
  console.log('ok   后台整理：单批互斥、关闭/卸载/维护暂停/超时均可取消，迟到结果不写回');

  const cases = [
    ['bad-json', async function* () { yield { type: 'text-delta', text: '不是JSON' }; yield { type: 'usage', usage: { inputTokens: 30, outputTokens: 8 } }; yield { type: 'finish', reason: { kind: 'stop' } }; }],
    ['incomplete', async function* () { yield { type: 'text-delta', text: '{"operations":[],"reason":"不完整"}' }; yield { type: 'finish', reason: { kind: 'max-tokens' } }; }],
    ['no-finish', async function* () { yield { type: 'text-delta', text: '{"operations":[],"reason":"缺失终止"}' }; }],
    ['tool-call', async function* () { yield { type: 'tool-call-delta', name: 'send-message' }; }],
    ['too-long', async function* () { yield { type: 'text-delta', text: 'x'.repeat(48001) }; }],
    ['bad-source', async function* () { yield { type: 'text-delta', text: JSON.stringify({ operations: [{ ...memory('坏来源'), source: { kind: 'conversation', reference: 'forged-message' }, epistemic: 'reported' }], reason: '拒绝伪造引用' }) }; yield { type: 'finish', reason: { kind: 'stop' } }; }],
    ['private-error', async function* () { throw new Error('SECRET_CREDENTIAL_SHOULD_NOT_LEAK'); }],
  ];
  for (const [name, generate] of cases) {
    const ws = path.join(workspace, name); seed(ws);
    const w = makeWorker(ws, makeLlm(generate)); await w.tick();
    assert.equal(readCoreMemory(ws).revision, 0);
    assert.equal(queue.reflectionStatus(ws).pending, 1);
    assert.equal(w.describe(ws).lastResult.status, 'failed');
    if (name === 'bad-json') assert.equal(w.describe(ws).lastResult.usage?.outputTokens, 8, '失败输出也保留宿主已经报告的用量');
    assert.doesNotMatch(JSON.stringify(w.describe(ws)), /SECRET_CREDENTIAL/);
    await w.stop();
  }
  console.log('ok   后台整理：坏JSON、截断输出、缺终止、工具调用、超限与伪造来源均拒绝，错误不泄露上游正文');

  const revisionWorkspace = path.join(workspace, 'revision'); seed(revisionWorkspace);
  const revisionWorker = makeWorker(revisionWorkspace, makeLlm(async function* (options) {
    const data = JSON.parse(options.messages[0].content[0].text);
    commitCoreMemory(revisionWorkspace, { expectedRevision: 0, operations: [memory('前台后写入的记忆')] });
    yield { type: 'text-delta', text: JSON.stringify({ operations: [{ ...memory('后台的记忆'), source: { kind: 'conversation', reference: data.materials[0].reference }, epistemic: 'reported' }], reason: '尝试陈旧提交' }) };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }));
  await revisionWorker.tick();
  assert.equal(readCoreMemory(revisionWorkspace).memories.length, 1);
  assert.equal(readCoreMemory(revisionWorkspace).memories[0].content, '前台后写入的记忆');
  assert.equal(queue.reflectionStatus(revisionWorkspace).pending, 1);
  await revisionWorker.stop();
  console.log('ok   后台整理：模型调用期间版本改变，陈旧结果不覆盖前台后续记忆');

  const largeWorkspace = path.join(workspace, 'large'); seed(largeWorkspace, 'large-session', '', '字'.repeat(4000));
  commitCoreMemory(largeWorkspace, { expectedRevision: 0, operations: [memory('基础依据'), ...Array.from({ length: 18 }, (_, i) => ({ op: 'create_core', ref: '$c' + i, title: '已有核心' + i, summary: '核心摘要'.repeat(100), reason: '已有依据', evidenceIds: ['$seed'] }))] });
  let largeCalls = 0;
  const largeWorker = makeWorker(largeWorkspace, makeLlm(async function* () { largeCalls++; yield* emptyStream(); }));
  await largeWorker.tick();
  assert.equal(largeCalls, 0);
  assert.equal(queue.reflectionStatus(largeWorkspace).needs_review, 1);
  assert.equal(largeWorker.describe(largeWorkspace).dailyCalls, 0);
  await largeWorker.stop();
  console.log('ok   后台整理：输入超限转待补读，不悄悄截断来源或消耗模型预算');

  const noRouteWorkspace = path.join(workspace, 'no-route'); seed(noRouteWorkspace);
  const oldQueue = JSON.parse(fs.readFileSync(queue.reflectionFile(noRouteWorkspace), 'utf8')); delete oldQueue.jobs[0].modelRoute; put(queue.reflectionFile(noRouteWorkspace), oldQueue);
  let fallbackCalls = 0;
  const noRoute = makeWorker(noRouteWorkspace, makeLlm(async function* () { fallbackCalls++; yield* emptyStream(); }));
  await noRoute.tick(); assert.equal(fallbackCalls, 0); assert.equal(queue.readReflection(noRouteWorkspace, '', oldQueue.jobs[0].id).attempts, 0); await noRoute.stop();
  const fallback = makeWorker(noRouteWorkspace, makeLlm(async function* () { fallbackCalls++; yield* emptyStream(); }), { routeForSession: () => route });
  await fallback.tick(); assert.equal(fallbackCalls, 1); await fallback.stop();
  console.log('ok   后台整理：旧批次无模型路由时等待；原会话路由恢复后才处理，不私自换模型');

  const restored = path.join(workspace, 'restore');
  const bundle = exportMemory(privateWorkspace); importMemory(restored, bundle);
  const restoredWorker = makeWorker(restored, null);
  assert.equal(restoredWorker.describe(restored).dailyCalls, 1);
  const previous = fs.readFileSync(workerModule.reflectionWorkerFile(restored), 'utf8');
  assert.throws(() => importMemory(restored, { ...bundle, files: { ...bundle.files, 'reflection-worker.json': '{bad' } }));
  assert.equal(fs.readFileSync(workerModule.reflectionWorkerFile(restored), 'utf8'), previous); await restoredWorker.stop();
  console.log('ok   后台整理：预算及运行结果可备份恢复，坏预算导入不半写');

  const receiptWorkspace = path.join(workspace, 'receipt');
  seed(receiptWorkspace, 'qq-group-12345678', '12345678');
  const receiptLease = queue.claimReflection(receiptWorkspace, '12345678', clock);
  assert.throws(() => queue.completeReflection(receiptWorkspace, { jobId: receiptLease.job.id, leaseToken: receiptLease.leaseToken, expectedRevision: 0, operations: [{ ...memory('已经提交的结果'), source: { kind: 'reflection', reference: receiptLease.job.materials[0].reference } }], reason: '模拟确认前退出' }, { groupId: '12345678', now: clock, commit: (...args) => { commitCoreMemory(...args); throw new Error('模拟确认前退出'); } }), /模拟确认前退出/);
  put(workerModule.reflectionWorkerFile(receiptWorkspace), { format: 'love-reflection-worker', schemaVersion: 1, day: new Date(clock).toISOString().slice(0, 10), calls: 6, nextAllowedAt: clock + 600000, runs: [{ id: 'previous-run', jobId: receiptLease.job.id, groupId: '12345678', startedAt: clock, status: 'running', reason: '尚未确认' }] });
  const receiptWorker = makeWorker(receiptWorkspace, makeLlm(async function* () { throw new Error('恢复不应再次调用模型'); }), { scopes: () => [{ primary: receiptWorkspace, workspace: receiptWorkspace, groupId: '' }, { primary: receiptWorkspace, workspace: receiptWorkspace, groupId: '12345678' }] });
  await receiptWorker.tick();
  assert.equal(queue.reflectionStatus(receiptWorkspace, '12345678').done, 1);
  assert.equal(receiptWorker.describe(receiptWorkspace).lastResult.status, 'done');
  await receiptWorker.stop();
  console.log('ok   后台整理：预算耗尽时仍能恢复群批次提交回执与运行结果，不重复调用模型');

  const listeners = new Map(), registered = new Map(), contexts = new Map();
  const dispose = await apply({ tools: { register(tool) { registered.set(tool.name, tool); } }, on(name, fn) { listeners.set(name, fn); }, systemPrompt: { context(item) { contexts.set(item.name, item); } }, logger: { info() {}, warn() {} } }, { enabled: true, workspace, proactiveEnabled: false, channel: 'none', reflectionBackgroundEnabled: false });
  try {
    const execution = { agent: { session: { id: 'qq-group-12345678', header: { cwd: workspace } } } };
    assert.doesNotMatch((await registered.get('love_recall').execute({}, execution)).text, /PRIVATE_ONLY|GROUP_B_NOTE/);
    assert.match((await registered.get('love_recall').execute({}, execution)).text, /GROUP_A_NOTE/);
    assert.equal(contexts.get('love:mood').text(execution), '');
    for (const name of ['love_self', 'love_record', 'love_mood', 'love_learn']) await assert.rejects(() => registered.get(name).execute({}, execution), /仅用于私聊/);
    await assert.rejects(() => registered.get('love_group').execute({ groupId: '23456789', action: 'status' }, execution), /当前群/);
    const fixture = seed(path.join(workspace, 'hook-source'), 'hook');
    listeners.get('session/event')({ ...fixture.session, header: { cwd: workspace } }, fixture.event);
    const job = queue.listReflections(workspace).jobs[0];
    assert.deepEqual(queue.readReflection(workspace, '', job.id).modelRoute, route);
  } finally { dispose?.(); }
  console.log('ok   后台整理：实际工具按会话ID隔离，无群上下文缓存也不读私聊；私聊工具及跨群访问拒绝');
  const host = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-reflection-host.mjs', import.meta.url))], { stdio: 'inherit', timeout: 20000 });
  assert.equal(host.status, 0, host.error?.message || '宿主集成测试失败');
} finally {
  assert.equal(path.dirname(workspace), path.resolve(os.tmpdir()));
  fs.rmSync(workspace, { recursive: true, force: true });
}
