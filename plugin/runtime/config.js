/** runtime/config — extracted behavior; dependencies are explicit ESM imports. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LEGACY_RUNTIME_CONFIG, DEFAULT_LOVE, DEFAULT_INJECT } from "./environment.js";
import z from "@deepseek-ai/schemastery";
import { readJson } from "./storage.js";

export function resolveRuntimeConfig() {
  const env = String(process.env.LOVE_COMPANION_CONFIG || "").trim();
  if (env) return env;
  const homeConfig = path.join(os.homedir(), ".dsh", "love-companion.json");
  if (fs.existsSync(homeConfig)) return homeConfig;
  if (fs.existsSync(LEGACY_RUNTIME_CONFIG)) return LEGACY_RUNTIME_CONFIG;
  return homeConfig;
}

export const RUNTIME_CONFIG = resolveRuntimeConfig();

export const config = z.object({
  enabled: z.boolean().default(true).description("插件总开关"),
  workspace: z.string().default(DEFAULT_LOVE).description("聊天工作区：只有这个目录里的会话会用到灵魂"),
  workspaces: z
    .array(z.string())
    .default([])
    .description(
      "额外的聊天工作区列表（一个插件管多个聊天区，各自一套记忆/心情/心跳/调度）；留空则只用上面的 workspace",
    ),
  proactiveEnabled: z.boolean().default(false).description("主动聊天总开关"),
  minGapHours: z.number().default(4).description("两次主动之间的最短间隔（小时）"),
  maxGapHours: z.number().default(12).description("两次主动之间的最长间隔（小时）"),
  dailySkipChance: z.number().default(0.45).description("当天直接跳过的概率（0–1）"),
  maxPerDay: z.number().default(1).description("每天最多主动几次"),
  maxPerWeek: z.number().default(3).description("每周最多主动几次"),
  groupProactive: z.boolean().default(false).description("允许主动消息发到群（需要配置 groupIds）"),
  groupMemoryEnabled: z.boolean().default(true).description("记录群消息、群友档案和群共享记忆"),
  groupContextMessages: z.number().default(20).description("进群聊时带多少条历史消息作为上下文（0–100）"),
  groupIds: z.array(z.string()).default([]).description("允许主动发消息的 QQ 群号"),
  journalKeepDays: z.number().default(365).description("日记保留天数，超过的移到 journal/archive/"),
  quietAfterChatMinutes: z.number().default(120).description("刚聊完多少分钟内不主动"),
  activeStartHour: z.number().default(10).description("活跃时段开始（0–23）"),
  activeEndHour: z.number().default(22).description("活跃时段结束（1–24）"),
  voiceChance: z.number().default(0.08).description("出现「这次可以发语音」提示的概率"),
  voiceCooldownHours: z.number().default(8).description("两次语音提示之间的最短间隔（小时）"),
  injectPath: z.string().default(DEFAULT_INJECT).description("OneBot 注入队列路径（没有 HTTP 直发时用）"),
  emojiEnabled: z.boolean().default(true).description("QQ 表情自动注解（[QQ表情:id] → 名称 + 含义）"),
  moodInjection: z.boolean().default(true).description("每轮把当前心情注入上下文，让记忆影响语气"),
  autoAppraisal: z.boolean().default(true).description("模型忘了记好感时，按强信号自动 ±1"),
  composeEnabled: z
    .boolean()
    .default(true)
    .description("用模板把主动消息写成可直接发送的一句话（配 HTTP 直发时省一轮模型调用）"),
  autoLearn: z
    .boolean()
    .default(true)
    .description("自动学习：从对话里的「教你/记住/以后可以」这类句子自动记下能力（可能误记，可关）"),
  reflectionEnabled: z
    .boolean()
    .default(true)
    .description("轮次结束后收集真实文字材料供模型增量整理；本地入队不调用模型"),
  memoryReadOnly: z
    .boolean()
    .default(false)
    .description("本插件记忆只读：阻止模型显式写入及自动收集/整理；不限制其他插件或宿主工具"),
  memoryReadOnlySessionIds: z
    .array(z.string())
    .default([])
    .description("记忆只读会话ID，精确匹配；由用户配置，不能由聊天正文或工具参数修改"),
  reflectionBackgroundEnabled: z
    .boolean()
    .default(true)
    .description("使用原会话模型在后台提炼记忆；额外消耗模型预算，可随时关闭"),
  reflectionCooldownMinutes: z.number().default(10).description("同一工作区（含群）后台调用间隔，1–1440 分钟"),
  reflectionMaxCallsPerDay: z
    .number()
    .default(6)
    .description("同一工作区（含群）每天最多后台调用次数，按 UTC 日，1–24"),
  reflectionMaxOutputTokens: z.number().default(4096).description("后台单次输出及推理 token 上限，512–8192"),
  semanticEnabled: z.boolean().default(true).description("装了 dsh-love-semantic 时用语义重排；没装自动退回关键词"),
  injectEnabled: z
    .boolean()
    .default(false)
    .description("调试：主动消息写进 qq-inject.jsonl（onebot 的注入默认关闭，生产别开；正常请配 qqHttpUrl）"),
  channel: z.string().default("qq").description("介质：qq = OneBot；web = 同工作区的网页会话；none = 不接通道"),
  qqHost: z.string().default("127.0.0.1").description("NapCat ws-reverse 地址"),
  qqPort: z.number().default(8643).description("NapCat ws-reverse 端口（用于探活）"),
  qqHttpUrl: z
    .string()
    .default("")
    .description("NapCat HTTP 接口地址（如 http://127.0.0.1:6700），配置后主动消息直接发人话"),
  qqHttpToken: z.string().default("").description("NapCat HTTP 接口 token"),
  napcatDir: z.string().default("").description("NapCat 安装目录（安装向导用它检测）"),
  botQQ: z.number().default(0).description("机器人 QQ 号（注入事件用）"),
  ownerQQ: z.number().default(0).description("主人 QQ 号（注入事件用）"),
});

export function normalize(p) {
  return String(p ?? "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function soulWorkspaces(cfg) {
  const list = Array.isArray(cfg?.workspaces)
    ? cfg.workspaces.filter((p) => typeof p === "string" && p.trim() !== "")
    : [];
  return list.length ? list : [cfg?.workspace || DEFAULT_LOVE];
}

export function matchWorkspace(cwd, list) {
  const n = normalize(cwd);
  if (!n) return undefined;
  for (const workspace of list || []) {
    const w = normalize(workspace);
    if (!w) continue;
    if (n === w) return workspace;
    if (n.endsWith("/love") && w.endsWith("/love") && /harness(项目|椤圭洰)/.test(n)) return workspace;
  }
  return undefined;
}

export function isLovePath(cwd, workspace) {
  return Boolean(matchWorkspace(cwd, [workspace]));
}

export function workspaceOf(exec, cfg) {
  const hit = matchWorkspace(exec?.agent?.session?.header?.cwd, soulWorkspaces(effectiveConfig(cfg)));
  if (!hit) throw new Error("love-companion：只允许在配置的聊天工作区使用");
  return hit;
}

export function readRuntimeConfig() {
  return readJson(RUNTIME_CONFIG, {});
}

export function effectiveConfig(base) {
  // 测试隔离：不读本机的运行时配置，避免临时工作区被真实 workspace 覆盖。
  if (process.env.LOVE_TEST_ISOLATED === "1") return { ...base };
  return { ...base, ...readRuntimeConfig() };
}

export function groupWorkspaceFor(primary, groupId) {
  try {
    const map = readRuntimeConfig().groupWorkspaces || {};
    const candidate = map[String(groupId)];
    if (candidate && fs.existsSync(candidate)) return candidate;
  } catch {}
  return primary;
}
