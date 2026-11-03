/** Explicit, paid-model acceptance run. Not called by verify-all or CI. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCoreMemory, currentMemorySources } from '../core-memory.js';
import { listReflections, readReflection } from '../reflection.js';
import { qualityCases, scoreQuality } from './memory-quality-cases.mjs';
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf('--' + name); return i < 0 ? '' : args[i + 1]; };
if (!args.includes('--run-live')) throw new Error('此脚本会实际调用模型；请显式传 --run-live --exe <DSH.exe> [--persona <SKILL.md>] [--proxy <已有代理URL>]');
const executable = path.resolve(arg('exe'));
if (!arg('exe') || !fs.existsSync(executable)) throw new Error('需要实际已安装的 DSH 可执行文件');
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'love-live-background-quality-'));
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
    name: '${pathToFileURL(path.join(plugin, 'patches/live-quality-fixture.mjs')).href}'
`);
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', LOVE_COMPANION_CONFIG: runtime, LOVE_LIVE_TEST_ROOT: root };
delete env.LOVE_TEST_ISOLATED;
if (arg('proxy')) { env.HTTPS_PROXY = arg('proxy'); env.HTTP_PROXY = arg('proxy'); }
const entry = path.join(path.dirname(executable), 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js');
const report = { format: 'love-live-quality-dialogue', model: { provider: 'deepseek-account', model: 'deepseek-flash' }, root, workspace, cases: qualityCases, method: '4个全新真实会话；前台不写记忆，下一会话前由生产worker实际提炼上一批材料，沿用一分钟冷却。无模拟模型流/手写核心；机械门槛之外需人工审计。', rounds: [] };
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
    tools: events.filter(event => event.type === 'tool_call').map(event => ({ name: event.tool, callId: event.callId, input: event.input })),
    toolResults: events.filter(event => event.type === 'tool_result').map(({ callId, status, result }) => ({ callId, status, result })),
    toolErrors: events.filter(event => event.type === 'tool_result' && event.status === 'error'),
    memoryRevision: store.revision, memories: store.memories.map(memory => ({ ...memory, currentSources: currentMemorySources(memory) })),
    cores: store.cores, worker: budget?.runs.at(-1) || null, workerCalls: budget?.calls || 0,
    sourceReferences: listReflections(workspace, '', 0, { status: 'all' }).jobs.flatMap(job => readReflection(workspace, '', job.id).materials.filter(item => item.role === 'user').map(item => item.reference)),
    batches: listReflections(workspace, '', 0, { status: 'all' }),
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
for (const [index, item] of qualityCases.entries()) { await waitBudget(); await run(item.prompt, index + 1); }
report.evaluation = scoreQuality(report);
save();
if (!report.evaluation.passed) process.exitCode = 1;
console.log(JSON.stringify({ phase: 'complete', evaluation: report.evaluation, report: path.join(root, 'dialogue.json') }));
