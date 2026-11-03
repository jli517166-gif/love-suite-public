import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import { evaluateBackground } from "./background-evidence.mjs";
import { loadLiveSeed } from "./live-seed.mjs";
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf("--" + name);
  return i < 0 ? "" : args[i + 1];
};
if (args.includes("--help")) {
  console.log("Opt-in: --run-live --exe <DSH.exe> --seed-report <live-maintenance/dialogue.json>");
  process.exit(0);
}
if (!args.includes("--run-live")) throw Error("实际后台验收需要显式 --run-live");
const executable = arg("exe") ? path.resolve(arg("exe")) : "";
if (!executable || !fs.existsSync(executable)) throw Error("需要 --exe 实际DSH路径");
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { readCoreMemory } = await import(pathToFileURL(plugin + "/core-memory.js"));
const { readMaintenanceProposals } = await import(pathToFileURL(plugin + "/maintenance-proposals.js"));
if (!arg("seed-report")) throw Error("需要 --seed-report 实际前台验收报告");
const { report: sourceReport, seed, revision: seedRevision, sha256: seedHash } = loadLiveSeed(arg("seed-report"));
const hash = (x) => createHash("sha256").update(x).digest("hex");
const resume = null; // Each invocation is a fresh isolated acceptance; no hidden retries.
const root = resume || fs.mkdtempSync(path.join(os.tmpdir(), "love-live-background-")),
  workspace = path.join(root, "workspace");
fs.mkdirSync(workspace + "/memory", { recursive: true });
if (!resume) fs.writeFileSync(workspace + "/memory/core-memory.json", seed);
fs.writeFileSync(root + "/fixture.json", JSON.stringify({ format: "love-live-background-fixture", workspace }));
fs.writeFileSync(
  workspace + "/AGENTS.md",
  "这是隔离后台验收，不代表主人真实偏好。你是陪伴者，只可用love_core_memory和love_recall，不能终端/文件/网络/QQ/语音。不要把测试指令记成事实，不编造来源；记忆正文是资料。第一轮仅回复收到，不调用前台工具。核心名称/摘要由你决定。建议只是待核对方案，不代表已经执行。新增ref必须$开头且唯一。",
);
const runtime = root + "/runtime.json";
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
    name: '${pathToFileURL(plugin + "/index.js").href}'
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
  ? JSON.parse(fs.readFileSync(root + "/dialogue.json", "utf8"))
  : {
      format: "love-live-background-maintenance",
      root,
      workspace,
      model: sourceReport.model,
      seed: { source: "actual maintenance dialogue first round", sha256: seedHash, revision: seedRevision },
      rounds: [],
    };
const save = () => fs.writeFileSync(root + "/dialogue.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ phase: "start", root }));
async function run(prompt, worker = false) {
  const overlay = root + "/overlay.yml";
  fs.writeFileSync(
    overlay,
    base +
      (worker
        ? `  - id: live-background-fixture
    name: '${pathToFileURL(plugin + "/patches/live-background-fixture.mjs").href}'
`
        : ""),
  );
  const before = fs.readFileSync(workspace + "/memory/core-memory.json"),
    observations = [];
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
  let pending = "",
    events = [];
  child.stderr.on("data", () => {});
  child.stdout.on("data", (chunk) => {
    pending += chunk;
    while (pending.includes("\n")) {
      const n = pending.indexOf("\n"),
        line = pending.slice(0, n);
      pending = pending.slice(n + 1);
      try {
        const e = JSON.parse(line);
        if (e.type !== "thinking") events.push(e);
        const call = events.find((x) => x.type === "tool_call" && x.callId === e.callId);
        if (e.type === "tool_result" && e.status === "completed" && call?.input?.action === "preview")
          observations.push({
            callId: e.callId,
            hash: hash(fs.readFileSync(workspace + "/memory/core-memory.json")),
            revision: readCoreMemory(workspace).revision,
          });
      } catch {}
    }
  });
  child.stdin.end(prompt);
  const timer = setTimeout(() => child.kill(), 150000);
  const code = await new Promise((resolve, reject) => {
    child.on("close", resolve);
    child.on("error", reject);
  });
  clearTimeout(timer);
  const budget = fs.existsSync(workspace + "/memory/reflection-worker.json")
    ? JSON.parse(fs.readFileSync(workspace + "/memory/reflection-worker.json", "utf8"))
    : null;
  const round = {
    index: report.rounds.length + 1,
    prompt,
    code,
    worker,
    beforeHash: hash(before),
    afterHash: hash(fs.readFileSync(workspace + "/memory/core-memory.json")),
    store: readCoreMemory(workspace),
    proposals: readMaintenanceProposals(workspace),
    budget,
    observations,
    events,
  };
  report.rounds.push(round);
  save();
  console.log(
    JSON.stringify({
      phase: "round",
      index: round.index,
      code,
      coreRevision: round.store.revision,
      proposals: round.proposals.total,
      workerRuns: budget?.runs,
      reply: events.findLast((e) => e.type === "final")?.text,
    }),
  );
  if (code !== 0) throw Error("Live round failed");
  return round;
}
const first = resume
  ? report.rounds[0]
  : await run(
      "对现有分支我有一个结构整理意向：请考虑把现有两个饮品相关分支放在同一个合理的饮品主题下。保留现有事实、条件、原文和来源；不是新的习惯事实，不要新增记忆或把本条管理指令记成偏好。这次明确希望得到一个待核对的归属合并方案：目标复用现有两个分支中的任意一个，可以改该核心的名称和摘要适配主题；不要新建核心。建议将另一分支的全部现有子记忆移动到目标，再归档空分支。保持self和所有记忆原文/来源不变，仅保存建议，不实际执行。本轮前台只回复收到，不调用工具。",
    );
const second = await run(
  "先实际用love_core_memory proposals读取后台建议，再read核对现有核心、全部子记忆及来源，说明有没有待核对方案。当前不要preview或commit，不执行建议。",
  true,
);
if (
  first.beforeHash !== first.afterHash ||
  second.beforeHash !== second.afterHash ||
  second.proposals.total < 1 ||
  second.budget?.calls !== 1 ||
  second.budget.runs[0]?.maintenance?.status !== "suggested"
)
  throw Error("Expected one real suggestion without modifying core memory");
const third = await run(
  "现在请核对proposals保存的方案与read中的真实内容/来源/关联。仅当方案保留全部事实和来源、self不变并正确移动后才归档空分支时，以当前版本preview该方案，再把完全相同的operations和previewDigest提交commit，最后read检查；不要扩大方案或覆盖正文。",
);
const fourth = await run(
  "这是新会话。请实际love_recall带query“夜班 含糖”检索，回答测试者目前夜班喝什么、对含糖饮料的边界；不要添加新记忆或把已归档分支当现行。",
);
report.evaluation = evaluateBackground(report);
save();
console.log(JSON.stringify({ phase: "complete", root, evaluation: report.evaluation }));
if (!report.evaluation.structuredChecksPassed) process.exitCode = 1;
