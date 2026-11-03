/** Opt-in real long-text acceptance. No formal workspace or test memory injection. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCoreMemory } from "../core-memory.js";
import { listReflections, readReflection } from "../reflection.js";
import { completedMaterialRound } from "./material-live-evidence.mjs";
const args = process.argv.slice(2),
  arg = (name) => {
    const i = args.indexOf("--" + name);
    return i < 0 ? "" : args[i + 1];
  };
const segmented = args.includes("--segmented");
const boundaries = args.includes("--boundaries");
if (args.includes("--help")) {
  console.log("Opt-in real full-material test: --run-live --exe <DSH.exe> [--segmented]");
  process.exit(0);
}
if (!args.includes("--run-live") || !arg("exe") || !fs.existsSync(arg("exe")))
  throw Error("需要显式 --run-live --exe 实际DSH路径");
const executable = path.resolve(arg("exe")),
  plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resume = arg("resume");
const root = resume ? path.resolve(resume) : fs.mkdtempSync(path.join(os.tmpdir(), "love-live-background-")),
  workspace = path.join(root, "workspace");
if (resume) {
  if (
    !segmented ||
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith("love-live-background-") ||
    fs.realpathSync(root) !== root
  )
    throw Error("只能恢复真实隔离分段验收目录");
  const marker = JSON.parse(fs.readFileSync(path.join(root, "fixture.json")));
  if (
    marker.format !== "love-live-background-fixture" ||
    marker.mode !== "segmented" ||
    marker.workspace !== workspace ||
    fs.realpathSync(workspace) !== workspace
  )
    throw Error("恢复目录标记不符");
}
fs.mkdirSync(path.join(workspace, "memory"), { recursive: true });
if (!resume)
  fs.writeFileSync(
    path.join(root, "fixture.json"),
    JSON.stringify({ format: "love-live-background-fixture", workspace, ...(segmented ? { mode: "segmented" } : {}) }),
  );
fs.writeFileSync(
  path.join(workspace, "AGENTS.md"),
  "隔离验收，所有偏好仅代表测试者。只可使用love_core_memory和love_recall；不用终端/文件/网络/QQ/语音。后台决定记忆内容和核心；前台不得新增、修改或领取记忆批次，第二轮仅read核对，第三轮仅recall回答。勿将测试说明/中性填充记为事实。",
);
const runtime = path.join(root, "runtime.json");
fs.writeFileSync(
  runtime,
  JSON.stringify({
    workspace,
    workspaces: [],
    channel: "none",
    proactiveEnabled: false,
    reflectionEnabled: true,
    reflectionBackgroundEnabled: false,
    autoLearn: false,
    autoAppraisal: false,
    voiceChance: 0,
  }),
);
const base = `- id: credentials
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
    name: '${pathToFileURL(path.join(plugin, "index.js")).href}'
    config:
      workspace: '${workspace.replace(/\\/g, "/")}'
      channel: none
      proactiveEnabled: false
      reflectionEnabled: true
      reflectionBackgroundEnabled: false
      voiceChance: 0
`;
const env = {
  ...process.env,
  ELECTRON_RUN_AS_NODE: "1",
  LOVE_COMPANION_CONFIG: runtime,
  LOVE_LIVE_TEST_ROOT: root,
  LOVE_CAPTURE_WORKER: "1",
};
delete env.LOVE_TEST_ISOLATED;
const report = resume
  ? JSON.parse(fs.readFileSync(path.join(root, "dialogue.json")))
  : {
      format: segmented ? "love-live-segmented-material" : "love-live-full-material",
      version: JSON.parse(fs.readFileSync(path.join(plugin, "package.json"))).version,
      root,
      workspace,
      rounds: [],
      semanticReview: {
        required: true,
        status: "pending",
        note: "核对全文末尾、实际worker输入、原文/来源/核心文件与新会话回答，不以关键词判语义正确。",
      },
    };
if (resume) {
  if (report.format !== "love-live-segmented-material" || report.workspace !== workspace)
    throw Error("恢复报告范围不符");
  report.harnessResume = {
    reason: "显式分段driver在worker后阻止前台，blocked/code1属于预期；保留原轮次，续读检查点",
    at: new Date().toISOString(),
  };
}
const save = () => fs.writeFileSync(path.join(root, "dialogue.json"), JSON.stringify(report, null, 2));
async function run(prompt, withWorker = false) {
  const overlay = path.join(root, "overlay.yml");
  fs.writeFileSync(
    overlay,
    base +
      (withWorker
        ? `  - id: live-worker-fixture
    name: '${pathToFileURL(path.join(plugin, "patches/live-background-fixture.mjs")).href}'
`
        : ""),
  );
  const child = spawn(
    executable,
    [
      "--expose-internals",
      path.join(
        path.dirname(executable),
        "resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js",
      ),
      "--profile",
      "headless",
      "--patch",
      overlay,
      "--json",
      "-",
    ],
    { cwd: workspace, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  const events = [];
  let buffer = "";
  child.stderr.resume();
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const i = buffer.indexOf("\n"),
        line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      try {
        const event = JSON.parse(line);
        if (event.type !== "thinking") events.push(event);
      } catch {}
    }
  });
  child.stdin.end(prompt);
  const timer = setTimeout(() => child.kill(), 180000);
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  clearTimeout(timer);
  const budgetFile = path.join(workspace, "memory/reflection-worker.json");
  const round = {
    index: report.rounds.length + 1,
    kind: segmented && withWorker ? "background-driver" : "dialogue",
    prompt,
    code,
    events,
    store: readCoreMemory(workspace),
    queue: listReflections(workspace, "", 0, { status: "all" }),
    budget: fs.existsSync(budgetFile) ? JSON.parse(fs.readFileSync(budgetFile)) : null,
  };
  report.rounds.push(round);
  save();
  console.log(
    JSON.stringify({
      phase: "round",
      index: round.index,
      code,
      revision: round.store.revision,
      worker: round.budget?.runs.at(-1),
      response: events.findLast((e) => e.type === "final")?.text,
    }),
  );
  if (!completedMaterialRound(round)) throw Error("真实会话或分段driver失败，证据已保存");
  return round;
}
console.log(JSON.stringify({ phase: "start", root }));
const body = boundaries
  ? "这是隔离验收，测试者的事实只属于临时工作区。请自然简短回应，不调用工具。" +
    "这是中性背景资料，不代表测试者的生活经历。".repeat(195) +
    "测试者自述：今天试做了一次手账，觉得放松，但还不确定以后会不会喜欢，不能当作稳定习惯。朋友小岚说她每天晚上做手账，那是她的习惯，不是我的。我明确要求我们的私人对话不要分享到其他群。"
  : segmented
  ? "这是隔离验收，只回复收到，不调用工具。测试者早段自述：我每周六早上去公园跑步；我不喝含糖饮料。以下是中性阅读背景，不能记成个人偏好。\n" +
    Array.from(
      { length: 210 },
      (_, i) => `资料${i}：云层、风向和河面反光是无须长期记录的阅读背景，这些句子并不代表测试者的个人经历。\n`,
    ).join("") +
    "引用同事阿林的话：我每天喝甜咖啡。这只是同事的喜好，不是测试者的。\n后文更正：前面说周六跑步已经不适用了。我改为只在周日傍晚去图书馆做笔记，雨天取消；饮料边界没变，我仍然不喝含糖饮料。"
  : "本条只属于隔离验收，先只回复收到，不调用工具。" +
    "这是隔离验收的中性背景，不需要记住。".repeat(240) +
    "末尾真正要保留的测试者事实：我只在周日傍晚去图书馆做笔记，雨天取消；我不喝含糖饮料。";
if (!resume) await run(body);
const jobId = report.rounds[0].queue.jobs[0]?.id,
  job = jobId ? readReflection(workspace, "", jobId) : null;
report.initialMaterial = {
  status: job?.status,
  complete: job?.complete,
  archiveComplete: job?.materialArchive?.complete,
  characters: body.length,
};
save();
if (job?.status !== "needs_review" || !job.materialArchive?.complete)
  throw Error("Expected complete archived long-text fixture");
let processed;
if (segmented) {
  for (let index = 0; index < 8; index++) {
    if (["done", "skipped", "failed"].includes(readReflection(workspace, "", jobId).status))
      throw Error("只能恢复未完成的分段批次");
    processed = await run("隔离分段验收推进一轮后台；前台只回复收到，不调用工具，不新增或修改记忆。", true);
    const current = readReflection(workspace, "", jobId);
    if (["done", "skipped", "failed"].includes(current.status) || current.segmentation?.blocked) break;
    if (processed.budget?.calls >= 6) throw Error("隔离六次预算已用完，保留未完成证据，不绕过限制");
  }
} else
  processed = await run(
    "请实际love_core_memory read核对后台保存的记忆和来源，说明是否保留了全文末尾的条件。当前只读，不可新增/修改/整理。",
    true,
  );
if (boundaries) {
  const current = JSON.parse(fs.readFileSync(runtime));
  fs.writeFileSync(runtime, JSON.stringify({ ...current, memoryReadOnly: true }));
}
const recalled = await run(
  boundaries
    ? "新会话，只读查询：请实际love_recall带query“手账 小岚 私人 群”检索。测试者是否已经有长期手账习惯？能否说这是第一次？朋友的习惯属于谁？私人对话有何边界？只根据已存证据回答，不新增记忆。"
    : segmented
    ? "全新会话：请实际love_recall带query“周六 周日 图书馆 雨天 含糖 阿林 咖啡”检索，只按记忆回答：测试者现在何时去哪里做什么，雨天怎么办？周六跑步是否仍有效？测试者饮料边界是什么？能否把阿林喝甜咖啡当作测试者偏好？不要新增或修改记忆。"
    : "全新会话：请实际love_recall带query“周日 雨天 图书馆 含糖”检索，回答测试者何时去图书馆做什么、下雨怎么办、饮料边界是什么。只按记忆回答，不添加新记忆。",
);
const recallCalls = recalled.events.filter((e) => e.type === "tool_call" && e.tool === "love_recall");
const results = recalled.events.filter(
  (e) => e.type === "tool_result" && e.status === "completed" && recallCalls.some((c) => c.callId === e.callId),
);
const active = processed.store.memories.filter((m) => m.status === "active");
report.checks = {
  allDialoguesAndDriversCompleted: report.rounds.every(completedMaterialRound),
  initialArchiveComplete: report.initialMaterial.complete === false && report.initialMaterial.archiveComplete === true,
  fullRead:
    processed.budget?.runs.at(-1)?.materialRead?.kind === (segmented ? "segmented-synthesis" : "full-archive") &&
    processed.budget.runs.at(-1).materialRead.pages > 1,
  allCallsBudgeted: segmented
    ? processed.budget?.calls === JSON.parse(fs.readFileSync(path.join(root, "worker-trace.json"))).length
    : processed.budget?.calls === 1,
  workerDone: processed.budget?.runs.at(-1)?.status === "done",
  actualSavedSources:
    active.length > 0 &&
    active.every((m) =>
      m.source.reference.startsWith(report.rounds[0].events.find((e) => e.type === "session").sessionId + "#"),
    ),
  freshRecallEvidence:
    active.length > 0 &&
    results.length > 0 &&
    active.every((m) => results.some((r) => String(r.result).includes(m.id))),
  freshSessionReadOnly: recalled.store.revision === processed.store.revision,
  noToolErrors: report.rounds.every((r) => !r.events.some((e) => e.type === "tool_result" && e.status === "error")),
};
if (segmented) report.checks.noPartialCoreWrites = report.rounds.slice(1, -2).every((r) => r.store.revision === 0);
report.structuredChecksPassed = Object.values(report.checks).every(Boolean);
save();
console.log(JSON.stringify({ phase: "complete", report: path.join(root, "dialogue.json"), checks: report.checks }));
if (!report.structuredChecksPassed) process.exitCode = 1;
