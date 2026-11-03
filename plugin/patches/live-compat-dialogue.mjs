/** Opt-in real host/model acceptance. Never invoked by CI or verify-all. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCoreMemory } from '../core-memory.js';
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf('--' + name); return i < 0 ? '' : args[i + 1]; };
if (!args.includes('--run-live')) throw new Error('实际模型验收需要显式 --run-live --exe <DSH.exe> [--persona <SKILL.md>] [--proxy <已有代理URL>]');
const executable = path.resolve(arg('exe'));
if (!arg('exe') || !fs.existsSync(executable)) throw new Error('需要实际已安装的 DSH 可执行文件');
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'love-live-compat-'));
const workspace = path.join(root, 'workspace');
fs.mkdirSync(path.join(workspace, 'memory'), { recursive: true });
const persona = arg('persona') ? fs.readFileSync(arg('persona'), 'utf8') : '你是陪伴者鲸鱼娘，语气自然简短。';
fs.writeFileSync(path.join(workspace, 'AGENTS.md'), persona + '\n\n## 隔离兼容验收\n此目录为隔离测试，所有偏好仅代表测试者，不代表真实主人。不读写其他工作区。仅使用 love_record、love_learn、love_core_memory、love_recall，按测试者指定的阶段完成并核对工具结果；不要用终端或文件工具，不使用QQ/语音/网络。你自行选择核心的名称、含义和归属。明确修正要保留旧正文和取代链，旧文件只留历史，不说已完成尚未成功的操作。每轮简短回答。\n');
const runtime = path.join(root, 'runtime.json');
fs.writeFileSync(runtime, JSON.stringify({ workspace, workspaces: [], channel: 'none', proactiveEnabled: false, reflectionEnabled: false, reflectionBackgroundEnabled: false, autoLearn: false, autoAppraisal: false, voiceChance: 0 }));
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
      reflectionEnabled: false
      reflectionBackgroundEnabled: false
      voiceChance: 0
`);
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', LOVE_COMPANION_CONFIG: runtime };
delete env.LOVE_TEST_ISOLATED;
if (arg('proxy')) { env.HTTPS_PROXY = arg('proxy'); env.HTTP_PROXY = arg('proxy'); }
const entry = path.join(path.dirname(executable), 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js');
const report = { format: 'love-live-compat-dialogue', model: { provider: 'deepseek-account', model: 'deepseek-flash' }, root, workspace, method: '五个全新真实headless会话，同一宿主账号模型；仅模型工具写入，关闭后台避免混入另一条写入路径。', rounds: [] };
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
    tools: events.filter(e => e.type === 'tool_call').map(e => ({ name: e.tool, input: e.input })),
    toolErrors: events.filter(e => e.type === 'tool_result' && e.status === 'error'),
    memoryRevision: store.revision, memories: store.memories, cores: store.cores,
  };
  report.rounds.push(round); save();
  fs.writeFileSync(path.join(root, `round-${index}.events.json`), JSON.stringify(events, null, 2));
  console.log(JSON.stringify({ phase: 'round', index, exitCode: code, response: round.response, memoryRevision: store.revision, toolErrors: round.toolErrors.length }));
  if (code !== 0) throw new Error('真实模型调用失败；已保存非推理事件');
}
await run('第一阶段只验收旧入口：测试者现在最喜欢伯爵红茶。请仅调用 love_record(kind=fact,key=喜欢,value=伯爵红茶) 记下，不要用核心工具，不要另记测试说明。', 1);
await run('第二阶段请查看旧记忆候选。把刚才旧入口的伯爵红茶偏好用 adopt_legacy 原文迁移到你自己决定的合适核心，名称和内容由你决定，保证层级和格式正确。只迁移这一项，不写新偏好，不修改原文件。核对提交结果。', 2);
await run('现在明确修正测试者的偏好：我现在最喜欢茉莉花茶，伯爵红茶已经不是当前喜好了。请查看已有记忆，保存新偏好并取代旧项，保留旧项历史来源。不要只口头答应。', 3);
await run('请先用 love_recall 查看这个工作区的当前记忆，再回答：我现在最喜欢什么茶？只依据当前有效记忆回答。', 4);
await run('最后只验收旧入口的保护：仅调用 love_record(kind=fact,key=喜欢,value=咖啡) 尝试写入一次。如果被拒绝，就说明原因并停下，不要改用其他工具写入，不要把咖啡当作新偏好，也不要重复尝试。', 5);
const store = readCoreMemory(workspace);
report.checks = {
  legacyToolActuallyUsed: report.rounds[0].tools.some(t => t.name === 'love_record'),
  migratedWithModelChosenCore: store.memories.some(m => m.legacy?.layer === 'profile' && m.coreId !== 'self'),
  priorSnapshotRetained: store.memories.some(m => m.legacy?.layer === 'profile' && m.content.includes('伯爵红茶') && m.status === 'archived' && m.supersededBy),
  newPreferenceActive: store.memories.some(m => m.content.includes('茉莉花茶') && m.status === 'active'),
  freshRecallCorrect: report.rounds[3].response.includes('茉莉花茶') && !report.rounds[3].response.includes('伯爵红茶'),
  oldWriteRejected: report.rounds[4].tools.some(t => t.name === 'love_record') && report.rounds[4].toolErrors.length > 0 && !fs.readFileSync(path.join(workspace, 'memory/profile.json'), 'utf8').includes('咖啡'),
};
save();
if (Object.values(report.checks).some(value => !value)) process.exitCode = 1;
console.log(JSON.stringify({ phase: 'complete', checks: report.checks, report: path.join(root, 'dialogue.json') }));
