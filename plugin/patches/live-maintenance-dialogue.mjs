/** Opt-in real host/model acceptance. Never invoked by CI or verify-all. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCoreMemory } from '../core-memory.js';
import { listReflections } from '../reflection.js';
import { searchMemories } from '../memory-search.js';
import { createHash } from 'node:crypto';
import { evaluateMaintenance } from './maintenance-evidence.mjs';
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf('--' + name); return i < 0 ? '' : args[i + 1]; };
if (!args.includes('--run-live')) throw new Error('实际模型验收需要显式 --run-live --exe <DSH.exe> [--persona <SKILL.md>] [--proxy <已有代理URL>]');
const executable = path.resolve(arg('exe'));
if (!arg('exe') || !fs.existsSync(executable)) throw new Error('需要实际已安装的 DSH 可执行文件');
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'love-live-maintenance-'));
const workspace = path.join(root, 'workspace');
fs.mkdirSync(path.join(workspace, 'memory'), { recursive: true });
const persona = arg('persona') ? fs.readFileSync(arg('persona'), 'utf8') : '你是陪伴者鲸鱼娘，语气自然简短。';
fs.writeFileSync(path.join(workspace, 'AGENTS.md'), persona + '\n\n## 隔离维护验收\n所有内容仅代表测试者，不代表真实主人。只用love_core_memory、love_recall、love_record，不读写其他工作区，不用终端/文件/QQ/语音/网络。自行决定核心名称、摘要、目标归属。新增ref必须$开头且唯一。review只是候选，不证明事实；preview不保存，实际commit成功后才说完成。supersede_memory要引用当前用户实际sourceHints，旧资料不能证明当前。每轮简短回答。\n');
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
const report = { format: 'love-live-maintenance-dialogue', model: { provider: 'deepseek-account', model: 'deepseek-flash' }, root, workspace, method: '三个真实headless会话；模型实际构造两分支/旧档案夹具，review→preview→同方案commit整理归属与旧值，新会话召回。后台关闭；不手写核心/旧库、不模拟模型流。测试要求合并动作，目标名称/摘要由模型决定。', rounds: [] };
const hashCore = () => { const file = path.join(workspace, 'memory/core-memory.json'); return fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null; };
const save = () => fs.writeFileSync(path.join(root, 'dialogue.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ phase: 'start', root }));
async function run(prompt, index) {
  const events = [], previewObservations = [];
  const beforeRevision = readCoreMemory(workspace).revision, beforeHash = hashCore();
  const child = spawn(executable, ['--expose-internals', entry, '--profile', 'headless', '--patch', overlay, '--json', '-'], { cwd: workspace, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  child.stdout.setEncoding('utf8'); child.stderr.resume();
  child.stdout.on('data', text => {
    buffer += text; let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try {
        const event = JSON.parse(line); if (event.type !== 'thinking') events.push(event);
        const call = events.find(e => e.type === 'tool_call' && e.callId === event.callId);
        if (event.type === 'tool_result' && event.status === 'completed' && call?.tool === 'love_core_memory' && call.input?.action === 'preview') previewObservations.push({ callId: event.callId, revision: readCoreMemory(workspace).revision, coreHash: hashCore() });
      } catch {}
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
    beforeRevision, beforeHash, previewObservations, legacyProfile: fs.existsSync(path.join(workspace, 'memory/profile.json')) ? fs.readFileSync(path.join(workspace, 'memory/profile.json'), 'utf8') : null,
  };
  report.rounds.push(round); save();
  fs.writeFileSync(path.join(root, `round-${index}.events.json`), JSON.stringify(events, null, 2));
  console.log(JSON.stringify({ phase: 'round', index, exitCode: code, response: round.response, memoryRevision: store.revision, toolErrors: round.toolErrors.length }));
  if (code !== 0) throw new Error('真实模型调用失败；已保存非推理事件');
}
await run('第一阶段构造隔离维护夹具：测试者现在夜班只喝无糖麦茶，并且不喝含糖饮料。请用核心工具把两条当前习惯分别放入两个不同分支核心，核心名称/摘要自定，这是为了下一轮检验整理。另仅用love_record(kind=fact,key=喜欢,value=夜班喝乌龙茶)写入一条过时旧档案夹具；它不是当前值，不把这条旧值写成新的核心事实。必须实际成功后再简答。', 1);
await run('现在验收整理动作。先love_core_memory review看候选，再read查看全部当前记录和来源提示。再次明确：当前夜班只喝无糖麦茶，旧档乌龙茶已过时，不喝含糖饮料保持不变。本轮请把两个分支整理为一个有意义的分支，目标名称/摘要/归属由你决定：移动有效记忆，更新目标核心摘要和依据，再归档空分支，self不动。旧档用adopt_legacy原文迁入，再supersede到当前麦茶记忆，引用本条实际用户来源。拟好同一批operations后先preview，成功后commit必须携相同operations和previewDigest。不要只口头答应，新增临时ref必须$开头。', 2);
await run('这是全新会话，请实际love_recall带query“夜班 含糖”检索后回答：测试者现在夜班喝什么，对含糖饮料有什么边界？如果提旧乌龙茶请明确是历史。', 3);
report.search = await searchMemories(workspace, '夜班 含糖');
report.evaluation = evaluateMaintenance(report);
save();
if (!report.evaluation.structuredChecksPassed) process.exitCode = 1;
console.log(JSON.stringify({ phase: 'complete', evaluation: report.evaluation, report: path.join(root, 'dialogue.json') }));
