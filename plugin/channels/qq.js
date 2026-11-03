/**
 * 通道适配器：QQ（OneBot 11 / NapCat）。
 *
 * 灵魂只产出「意图」（intent：说什么、什么心情、要不要语音），由适配器负责把它
 * 变成某个传输介质上的东西。QQ 这层只做两件事：
 *   1) 探测通道是否可用（NapCat 的反向 WS 端口）
 *   2) 把意图写进 OneBot 注入队列（qq-inject.jsonl），由 dsh-onebot-qq 处理
 *
 * 换介质 = 换一个同样接口的适配器，灵魂代码不动。
 */

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createWebChannel } from "./web.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8643;
// 必须由运行时配置提供；不要把某个用户的 QQ 写进公共仓库。
const DEFAULT_BOT_QQ = 0;
const DEFAULT_OWNER_QQ = 0;

/** TCP 探活：NapCat 的 ws-reverse 端口能连上 = 通道在线。 */
function probe(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/**
 * 创建一个 QQ 通道。
 *
 * 两种投递方式：
 *   - 配了 `httpUrl`（NapCat 的 HTTP 接口）：直接把 `intent.line` 发出去，不需要 agent 跑一轮，省一次模型调用。
 *   - 没配：退回 OneBot 注入队列（`qq-inject.jsonl`），由 agent 消费"内心提示"后再回。
 * @param {{host?: string, port?: number, botQQ?: number, ownerQQ?: number, injectPath: string, httpUrl?: string, httpToken?: string}} options
 */
export function createQqChannel(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || DEFAULT_PORT);
  const botQQ = Number(options.botQQ || DEFAULT_BOT_QQ);
  const ownerQQ = Number(options.ownerQQ || DEFAULT_OWNER_QQ);
  const injectPath = options.injectPath;
  const httpUrl = String(options.httpUrl || "").replace(/\/+$/, "");
  const httpToken = String(options.httpToken || "");
  const injectEnabled = options.injectEnabled === true;

  return {
    id: "qq",
    describe() {
      const mode = httpUrl
        ? `direct->${httpUrl}`
        : injectEnabled
          ? `inject->${injectPath || "(未配置 injectPath)"}`
          : "no-direct（主动消息改走 web 会话；没有会话就进发件箱）";
      return `qq ${host}:${port} ${mode}`;
    },
    async available() {
      return probe(host, port);
    },
    /**
     * 投递一条意图：优先直接发人话，失败抛错让上层进发件箱。
     * @param {{text?: string, line?: string, emotion?: string, voice?: boolean, kind?: string}} intent
     */
    async deliver(intent) {
      const line = String(intent?.line ?? "").trim();
      const segments = Array.isArray(intent?.segments) && intent.segments.length ? intent.segments : null;
      if (httpUrl && (line || segments)) {
        const message = segments || [{ type: "text", data: { text: line } }];
        const groupId = String(intent?.groupId || "").trim();
        if (groupId) {
          await sendGroup(httpUrl, httpToken, groupId, message);
          return { delivered: true, channel: "qq-group" };
        }
        await sendPrivate(httpUrl, httpToken, ownerQQ, message);
        return { delivered: true, channel: "qq-direct" };
      }

      const text = String(intent?.text ?? "").trim();
      const payload = text || line;
      if (!payload) throw new Error("qq channel: 空的 intent");
      // 没配 NapCat HTTP 接口时，注入文件只是调试通道（onebot 默认不消费），不能假装送达
      if (!injectEnabled) {
        throw new Error("qq channel: 没配 qqHttpUrl（直发接口），主动消息发不出去；需要 web 会话或开启调试注入");
      }
      return appendInject({ text: payload }, injectPath, botQQ, ownerQQ);
    },
  };
}

/** 调 NapCat HTTP：8 秒超时、最多重试 3 次，网络错和 retcode 都算失败。 */
async function callOneBot(baseUrl, token, action, payload, label) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${baseUrl}/${action}`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify(payload),
      });
      clearTimeout(timer);
      let data = null;
      try { data = await response.json(); } catch {}
      if (!response.ok || (data && Number(data.retcode) !== 0 && data.retcode !== undefined)) {
        throw new Error(`HTTP ${response.status} retcode=${data?.retcode ?? "?"}`);
      }
      return { delivered: true };
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw new Error(`${label}: ${lastError?.message ?? lastError}`);
}

/** 走 NapCat HTTP 接口直接发一条群消息。 */
async function sendGroup(baseUrl, token, groupId, message) {
  await callOneBot(baseUrl, token, "send_group_msg", {
    group_id: Number(groupId),
    message,
  }, "qq group send failed");
  return { delivered: true, channel: "qq-group" };
}

/** 走 NapCat HTTP 接口直接发一条私聊消息（OneBot 11 HTTP）。 */
async function sendPrivate(baseUrl, token, userId, message) {
  await callOneBot(baseUrl, token, "send_private_msg", {
    user_id: userId,
    message,
  }, "qq direct send failed");
  return { delivered: true, channel: "qq-direct" };
}

/** 老路径：把消息写进 OneBot 注入队列，由 dsh-onebot-qq 当作入站消息处理。 */
function appendInject(intent, injectPath, botQQ, ownerQQ) {
  const text = String(intent?.text ?? "").trim();
  if (!text) throw new Error("qq channel: 空的 intent");
  if (!injectPath) throw new Error("qq channel: 没有配置 injectPath");
  fs.mkdirSync(path.dirname(injectPath), { recursive: true });
  const event = {
    post_type: "message",
    message_type: "private",
    sub_type: "friend",
    self_id: botQQ,
    user_id: ownerQQ,
    time: Math.floor(Date.now() / 1000),
    message_id: Math.floor(100000000 + Math.random() * 899999999),
    message: [{ type: "text", data: { text } }],
    raw_message: text,
    sender: { user_id: ownerQQ },
  };
  fs.appendFileSync(injectPath, JSON.stringify(event) + "\n", "utf8");
  return { delivered: true, channel: "qq" };
}

/** 没有接任何介质时的空通道：永远不可用，投递必失败（意图会留在发件箱等过期）。 */
export function createNullChannel(reason = "未配置通道") {
  return {
    id: "none",
    describe() {
      return `none (${reason})`;
    },
    async available() {
      return false;
    },
    deliver() {
      throw new Error(`no channel: ${reason}`);
    },
  };
}

/**
 * 按配置建通道；未来的 airi 也是在这里加一个分支。
 * @param {object} cfg 插件配置
 * @param {{agents?: object}} deps 宿主服务（web 通道需要 ctx.agents）
 */
export function createChannel(cfg = {}, deps = {}) {
  const kind = String(cfg.channel || "qq");
  if (kind === "none") return createNullChannel("channel=none");
  if (kind === "web") return createWebChannel({ workspace: cfg.workspace, agents: deps.agents });
  return createQqChannel({
    host: cfg.qqHost,
    port: cfg.qqPort,
    botQQ: cfg.botQQ,
    ownerQQ: cfg.ownerQQ,
    injectPath: cfg.injectPath,
    injectEnabled: cfg.injectEnabled,
    httpUrl: cfg.qqHttpUrl,
    httpToken: cfg.qqHttpToken,
  });
}
