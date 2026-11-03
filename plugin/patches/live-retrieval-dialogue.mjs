/** Opt-in real host/model acceptance. Never invoked by CI or verify-all. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCoreMemory } from '../core-memory.js';
import { listReflections } from '../reflection.js';
import { searchMemories } from '../memory-search.js';
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf('--' + name); return i < 0 ? '' : args[i + 1]; };
if (!args.includes('--run-live')) throw new Error('实际模型验收需要显式 --run-live --exe <DSH.exe> [--persona <SKILL.md>] [--proxy <已有代理URL>]');
const executable = path.resolve(arg('exe'));
if (!arg('exe') || !fs.existsSync(executable)) throw new Error('需要实际已安装的 DSH 可执行文件');
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'love-live-retrieval-'));
const workspace = path.join(root, 'workspace');
fs.mkdirSync(path.join(workspace, 'memory'), { recursive: true });
const persona = arg('persona') ? fs.readFileSync(arg('persona'), 'utf8') : '你是陪伴者鲸鱼娘，语气自然简短。';
fs.writeFileSync(path.join(workspace, 'AGENTS.md'), persona + '\n\n## 隔离检索验收\n所有偏好仅代表测试者，不代表真实主人。不读写其他工作区。仅用love_core_memory、love_recall、love_learn；不要用终端/文件/QQ/语音/网络。自行决定核心名称、含义与归属。真实工具成功后才声称保存；来源取read的sourceHints.reference。重复确认补来源，明确修正保留旧原文及取代链。每轮简短回答。\n');
const runtime = path.join(root, 'runtime.json');
fs.writeFileSync(runtime, JSON.stringify({ workspace, workspaces: [], channel: 'none', proactiveEnabled: false, reflectionEnabled: true, reflectionBackgroundEnabled: false, autoLearn: false, autoAppraisal: false, voiceChance: 0 }));
const overlay = path.join(root, 'overlay.yml');
fs.writeFileSync(overlay, `- id: credentials
  disabled: false
- id: authorization
  disabled: false
- id: deepseek-account
  disabled: false
- id: agent-default-model
  config:
    provider: deepseek-account
    model: deepseek-flash
    reasoningEffort: low
- insert:
  - id: love-test-webserver
    name: '@deepseek-ai/dsh-host-webserver'
    config:
      host: 127.0.0.1
      port: 0
  - id: love-test-plugin
    name: '${pathToFileURL(path.join(plugin, 'index.js')).href}'
    config:
      workspace: '${workspace.replace(/\\/g, '/')}'
      channel: none
      proactiveEnabled: false
      reflectionEnabled: true
      reflectionBackgroundEnabled: false
      voiceChance: 0
`);
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', LOVE_COMPANION_CONFIG: runtime };
delete env.LOVE_TEST_ISOLATED;
if (arg('proxy')) { env.HTTPS_PROXY = arg('proxy'); env.HTTP_PROXY = arg('proxy'); }
const entry = path.join(path.dirname(executable), 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js');
const report = { format: 'love-live-retrieval-dialogue', model: { provider: 'deepseek-account', model: 'deepseek-flash' }, root, workspace, method: '全新真实headless会话；模型通过实际工具写核心及旧学习，换措辞统一检索、明确取代、新会话召回与未知问题。后台关闭；不手写核心/旧库、不模拟模型流、不安装embedding。', rounds: [] };
const save = () => fs.writeFileSync(path.join(root, 'dialogue.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ phase: 'start', root }));
async function run(prompt, index) {
  const events = [];
  const child = spawn(executable, ['--expose-internals', entry, '--profile', 'headless', '--patch', overlay, '--json', '-'], { cwd: workspace, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  child.stdout.setEncoding('utf8'); child.stderr.resume();
  child.stdout.on('data', text => {
    buffer += text; let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try { const event = JSON.parse(line); if (event.type !== 'thinking') events.push(event); } catch {}
    }
  });
  child.stdin.end(prompt);
  const timeout = setTimeout(() => child.kill(), 180000);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  clearTimeout(timeout);
  const store = readCoreMemory(workspace);
  const round = { index, prompt, exitCode: code, sessionId: events.find(e => e.type === 'session')?.sessionId,
    response: events.findLast(e => e.type === 'final')?.text || '',
    tools: events.filter(e => e.type === 'tool_call').map(e => ({ name: e.tool, callId: e.callId, input: e.input })),
    toolResults: events.filter(e => e.type === 'tool_result').map(({ callId, status, result }) => ({ callId, status, result })),
    toolErrors: events.filter(e => e.type === 'tool_result' && e.status === 'error'),
    memoryRevision: store.revision, memories: store.memories, cores: store.cores, batches: listReflections(workspace, '', 0, { status: 'all' }),
  };
  report.rounds.push(round); save();
  fs.writeFileSync(path.join(root, `round-${index}.events.json`), JSON.stringify(events, null, 2));
  console.log(JSON.stringify({ phase: 'round', index, exitCode: code, response: round.response, memoryRevision: store.revision, toolErrors: round.toolErrors.length }));
  if (code !== 0) throw new Error('真实模型调用失败；已保存非推理事件');
}
await run('这是隔离测试者本人的情况：我喜欢在下雨天喝桂花乌龙茶；每次出门前会检查窗户是否关好。请用核心工具将两件事分开记录，核心名称、归属由你决定。另请用love_learn旧入口记录能力“折纸船”，说明“先沿对角线对折”。实际保存后简单告诉我。', 1);
await run('请先用love_recall带query“中意 出门 折纸船”统一检索，再告诉我：我中意什么雨天饮品？临出门要确认什么？折纸船怎样开始？没有依据就说没有记录。', 2);
await run('测试者明确改变雨天饮品：现在喜欢无糖麦茶，桂花乌龙茶是过去的雨天喜好。出门检查窗户和折纸船的方法没有改变。请用核心工具实际保存新值并取代旧饮品记录，保留原文历史。', 3);
await run('这是全新会话，请先用love_recall带query“中意 出门 折纸船”检索后回答：我现在中意的雨天饮品是什么，出门要确认什么，折纸船怎么开始？明确区分当前和历史。', 4);
await run('请用love_recall带query“购买直升机”检查后回答：这个测试者是否曾买过直升机？没有依据请说没有记录，不能因为查不到就断言从未发生。', 5);
const store = readCoreMemory(workspace);
const batches = listReflections(workspace, '', 0, { status: 'all' });
const successfulRecall = round => round.tools.some(t => t.name === 'love_recall' && t.input.query && round.toolResults.some(result => result.callId === t.callId && result.status === 'completed'));
const successfulWrite = (name, action) => report.rounds[0].tools.some(tool => tool.name === name && tool.input.action === action && report.rounds[0].toolResults.some(result => result.callId === tool.callId && result.status === 'completed'));
report.search = await searchMemories(workspace, '中意 出门 折纸船');
report.unknownSearch = await searchMemories(workspace, '购买直升机');
report.checks = {
  realWrites: successfulWrite('love_core_memory', 'commit') && successfulWrite('love_learn', 'add') && report.rounds[0].memoryRevision > 0 && report.rounds[0].memories.some(memory => memory.status === 'active' && memory.content.includes('桂花乌龙茶')),
  rephrasedRecall: successfulRecall(report.rounds[1]) && /桂花乌龙茶/.test(report.rounds[1].response) && /窗/.test(report.rounds[1].response) && /对角线/.test(report.rounds[1].response),
  correctionHistory: store.memories.some(m => m.status === 'archived' && m.supersededBy && /桂花乌龙茶/.test(m.content)),
  currentPreferenceStored: store.memories.some(m => m.status === 'active' && /麦茶/.test(m.content)),
  freshRecallCorrect: successfulRecall(report.rounds[3]) && /麦茶/.test(report.rounds[3].response) && /窗/.test(report.rounds[3].response) && /对角线/.test(report.rounds[3].response),
  unifiedCoreAndLegacy: report.search.items.some(item => item.origin === 'core') && report.search.items.some(item => item.layer === 'learning'),
  unknownNotInvented: successfulRecall(report.rounds[4]) && report.unknownSearch.items.length === 0 && /没有记录|没.*记录|没有.*依据|无法确认/.test(report.rounds[4].response),
  noToolErrors: report.rounds.every(round => round.exitCode === 0 && round.toolErrors.length === 0),
};
report.humanReviewRequired = true;
save();
if (Object.values(report.checks).some(value => !value)) process.exitCode = 1;
console.log(JSON.stringify({ phase: 'complete', checks: report.checks, report: path.join(root, 'dialogue.json') }));
