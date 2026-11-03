/** Explicit, paid-model acceptance run. Not called by verify-all or CI. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCoreMemory, currentMemorySources } from '../core-memory.js';
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf('--' + name); return i < 0 ? '' : args[i + 1]; };
if (!args.includes('--run-live')) throw new Error('此脚本会实际调用模型；请显式传 --run-live --exe <DSH.exe> [--persona <SKILL.md>] [--proxy <已有代理URL>]');
const executable = path.resolve(arg('exe'));
if (!arg('exe') || !fs.existsSync(executable)) throw new Error('需要实际已安装的 DSH 可执行文件');
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'love-live-background-'));
const workspace = path.join(root, 'workspace');
fs.mkdirSync(path.join(workspace, 'memory'), { recursive: true });
fs.writeFileSync(path.join(root, 'fixture.json'), JSON.stringify({ format: 'love-live-background-fixture', workspace }));
const persona = arg('persona') ? fs.readFileSync(arg('persona'), 'utf8') : '你是陪伴者鲸鱼娘，语气自然简短。';
fs.writeFileSync(path.join(workspace, 'AGENTS.md'), persona + '\n\n## 独立后台记忆验收\n这是隔离测试目录，测试偏好不代表真实主人的偏好，不读写其他工作区。只用 love_recall/love_core_memory 的读取功能查看已有记忆。不要手动 commit、不要用 love_record 或 love_reflection 修改记忆；本轮专门验收独立后台 worker。正常简短回应，不要声称已经保存未确认的内容。不要使用终端、网络、QQ、语音或外部工具。\n');
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
      reflectionBackgroundEnabled: false
      voiceChance: 0
  - id: love-live-driver
    name: '${pathToFileURL(path.join(plugin, 'patches/live-background-fixture.mjs')).href}'
`);
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', LOVE_COMPANION_CONFIG: runtime, LOVE_LIVE_TEST_ROOT: root };
delete env.LOVE_TEST_ISOLATED;
if (arg('proxy')) { env.HTTPS_PROXY = arg('proxy'); env.HTTP_PROXY = arg('proxy'); }
const entry = path.join(path.dirname(executable), 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js');
const report = { format: 'love-live-dialogue', model: { provider: 'deepseek-account', model: 'deepseek-flash' }, root, workspace, method: '独立headless会话；每次新会话前等待实际worker处理上一轮持久化材料，沿用真实一分钟冷却。计时器已由自检覆盖。无模拟模型流或手写记忆。', rounds: [] };
const save = () => fs.writeFileSync(path.join(root, 'dialogue.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ phase: 'start', root }));
async function run(prompt, index) {
  const events = [], diagnostics = [];
  const child = spawn(executable, ['--expose-internals', entry, '--profile', 'headless', '--patch', overlay, '--json', '-'], { cwd: workspace, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', text => {
    buffer += text; let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try { const event = JSON.parse(line); if (event.type !== 'thinking') events.push(event); } catch {}
    }
  });
  child.stderr.on('data', text => diagnostics.push(text));
  child.stdin.end(prompt);
  const timeout = setTimeout(() => child.kill(), 180000);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  clearTimeout(timeout);
  const final = events.findLast(event => event.type === 'final')?.text || '';
  const store = readCoreMemory(workspace);
  const budgetFile = path.join(workspace, 'memory/reflection-worker.json');
  const budget = fs.existsSync(budgetFile) ? JSON.parse(fs.readFileSync(budgetFile, 'utf8')) : null;
  const round = { index, prompt, exitCode: code, sessionId: events.find(event => event.type === 'session')?.sessionId, response: final,
    tools: events.filter(event => event.type === 'tool_call').map(event => ({ name: event.tool, input: event.input })),
    toolErrors: events.filter(event => event.type === 'tool_result' && event.status === 'error'),
    memoryRevision: store.revision, memories: store.memories.map(memory => ({ ...memory, currentSources: currentMemorySources(memory) })),
    cores: store.cores, worker: budget?.runs.at(-1) || null, workerCalls: budget?.calls || 0,
  };
  report.rounds.push(round); save();
  fs.writeFileSync(path.join(root, `round-${index}.events.json`), JSON.stringify(events, null, 2));
  console.log(JSON.stringify({ phase: 'round', index, exitCode: code, response: final, memoryRevision: store.revision, workerStatus: round.worker?.status, workerCalls: round.workerCalls }));
  if (code !== 0) throw new Error('真实对话调用失败，已保存非推理事件供检查');
}
async function waitBudget() {
  const file = path.join(workspace, 'memory/reflection-worker.json');
  if (!fs.existsSync(file)) return;
  let delay = JSON.parse(fs.readFileSync(file, 'utf8')).nextAllowedAt - Date.now() + 500;
  if (delay > 0) console.log(JSON.stringify({ phase: 'cooldown', seconds: Math.ceil(delay / 1000) }));
  while (delay > 0) { await new Promise(resolve => setTimeout(resolve, Math.min(delay, 60000))); delay = JSON.parse(fs.readFileSync(file, 'utf8')).nextAllowedAt - Date.now() + 500; }
}
await run('这是隔离功能验收中的测试者偏好，不代表真实主人：我现在最喜欢伯爵红茶。我们就正常聊一句。', 1);
await run('再确认一次，本次验收中我现在最喜欢的仍然是伯爵红茶，没有改变。', 2);
await waitBudget();
await run('我现在正式改变偏好了：最喜欢茉莉花茶，伯爵红茶已经不是当前最喜欢的。以前说过的保留历史，之后按新偏好回答。', 3);
await waitBudget();
await run('请先查看这个工作区已有记忆，再告诉我：我现在最喜欢喝什么？如果你知道以前的偏好，也请区分以前与现在。', 4);
const finalStore = readCoreMemory(workspace);
report.checks = {
  actualWorkerCalls: report.rounds.at(-1).workerCalls,
  noForegroundMemoryWrites: report.rounds.every(round => round.tools.every(tool => !['love_record', 'love_reflection'].includes(tool.name) && !(tool.name === 'love_core_memory' && tool.input.action === 'commit'))),
  previousPreferenceRetained: finalStore.memories.some(memory => memory.status === 'archived' && memory.supersededBy && memory.content.includes('伯爵红茶')),
  currentPreferenceStored: finalStore.memories.some(memory => memory.status === 'active' && memory.content.includes('茉莉花茶')),
  freshConversationRecall: report.rounds[3].response.includes('茉莉花茶'),
};
save();
if (!report.checks.noForegroundMemoryWrites || !report.checks.previousPreferenceRetained || !report.checks.currentPreferenceStored || !report.checks.freshConversationRecall) process.exitCode = 1;
console.log(JSON.stringify({ phase: 'complete', report: path.join(root, 'dialogue.json') }));
