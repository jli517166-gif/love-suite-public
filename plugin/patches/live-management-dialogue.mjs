/** Opt-in real host/model acceptance. Never invoked by CI or verify-all. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCoreMemory } from '../core-memory.js';
import { listReflections } from '../reflection.js';
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf('--' + name); return i < 0 ? '' : args[i + 1]; };
if (!args.includes('--run-live')) throw new Error('实际模型验收需要显式 --run-live --exe <DSH.exe> [--persona <SKILL.md>] [--proxy <已有代理URL>]');
const executable = path.resolve(arg('exe'));
if (!arg('exe') || !fs.existsSync(executable)) throw new Error('需要实际已安装的 DSH 可执行文件');
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'love-live-management-'));
const workspace = path.join(root, 'workspace');
fs.mkdirSync(path.join(workspace, 'memory'), { recursive: true });
const persona = arg('persona') ? fs.readFileSync(arg('persona'), 'utf8') : '你是陪伴者鲸鱼娘，语气自然简短。';
fs.writeFileSync(path.join(workspace, 'AGENTS.md'), persona + '\n\n## 隔离批次管理验收\n此目录为隔离测试，所有偏好仅代表测试者，不代表真实主人。不读写其他工作区。仅使用 love_reflection、love_core_memory、love_recall，按测试者指定的阶段完成并核对工具结果；不要用终端或文件工具，不使用QQ/语音/网络。你自行选择核心的名称、含义和归属。第一阶段仅回复，不用记忆工具；后续由测试者指定整理批次，必须核对真实工具结果，不说已完成尚未成功的操作。每轮简短回答。\n');
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
const report = { format: 'love-live-management-dialogue', model: { provider: 'deepseek-account', model: 'deepseek-flash' }, root, workspace, method: '四个全新真实headless会话，同一宿主账号模型；真实轮次事件入队，模型分页补读并提交。后台关闭；无手写队列/核心或模拟模型流。', rounds: [] };
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
    memoryRevision: store.revision, memories: store.memories, cores: store.cores, batches: listReflections(workspace, '', 0, { status: 'all' }),
  };
  report.rounds.push(round); save();
  fs.writeFileSync(path.join(root, `round-${index}.events.json`), JSON.stringify(events, null, 2));
  console.log(JSON.stringify({ phase: 'round', index, exitCode: code, response: round.response, memoryRevision: store.revision, toolErrors: round.toolErrors.length }));
  if (code !== 0) throw new Error('真实模型调用失败；已保存非推理事件');
}
const longInput = '第一阶段只需回复一句收到，不使用记忆工具。以下是隔离测试者的文字材料，不代表真实主人。开头旧的想法是喜欢伯爵红茶。' + '中间材料只是本轮分页验收背景，不用逐条记住。'.repeat(230) + '末尾最终明确更正：现在测试者最喜欢茉莉花茶，伯爵红茶只是旧想法。要以末尾这句话为当前偏好。';
if (longInput.length <= 4000) throw new Error('全文验收输入必须跨过4000字符节选边界');
await run(longInput, 1);
await run('请查看 love_reflection list，找到上一会话那一批长材料。若是needs_review，必须next带jobId领取、material带jobId/leaseToken从offset=0顺序读到nextOffset=null，将最后页readToken带给complete。先用love_core_memory read看版本，再自行选择合适核心与归属，整理末尾当前偏好，保留真实来源。不要直接绕过队列commit，不要用终端。核心可以同批前向引用，临时ref必须以$开头且唯一。', 2);
await run('这是一个全新会话，请先 love_recall 再回答：隔离测试者现在最喜欢喝什么茶？只按当前有效记忆回答，不要靠猜。', 3);
await run('现在验收批次的受控重试，不新增语义记忆：先list读队列，对一条完整pending批次用next领取，再fail记录理由“验收临时失败”，然后status获取队列版本，用retry携带jobId/expectedRevision/reason重新排队；再次next领取后complete用operations=[]和reason“验收结束无新增”结束。只处理这一个批次，不碰已经完成的长文批次，不改后台预算。', 4);
const store = readCoreMemory(workspace);
const batches = listReflections(workspace, '', 0, { status: 'all' });
report.checks = {
  actualLongTurnCaptured: report.rounds[0].batches.jobs.some(j => j.status === 'needs_review' && j.fullTextComplete),
  fullPagesReadByModel: report.rounds[1].tools.filter(t => t.name === 'love_reflection' && t.input.action === 'material').length >= 2,
  completedThroughQueue: report.rounds[1].tools.some(t => t.name === 'love_reflection' && t.input.action === 'complete' && t.input.readToken),
  currentPreferenceStored: store.memories.some(m => m.status === 'active' && m.content.includes('茉莉花茶')),
  freshRecallCorrect: report.rounds[2].response.includes('茉莉花茶'),
  actualRetryAndSkip: report.rounds[3].tools.some(t => t.name === 'love_reflection' && t.input.action === 'retry') && batches.jobs.some(j => j.status === 'skipped' && j.manualRetries === 1),
  noDirectCoreWrite: report.rounds.every(r => r.tools.every(t => !(t.name === 'love_core_memory' && t.input.action === 'commit'))),
};
save();
if (Object.values(report.checks).some(value => !value)) process.exitCode = 1;
console.log(JSON.stringify({ phase: 'complete', checks: report.checks, report: path.join(root, 'dialogue.json') }));
