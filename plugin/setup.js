/**
 * 安装/配置自检：告诉面板「还差什么」，而不是让用户自己猜。
 *
 * 只做检测，不做安装。安装动作仍交给插件管理（meow）和用户（NapCat 安装包）。
 */

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

export const DEFAULT_NAPCAT_DIR = process.env.NAPCAT_DIR || path.join(os.homedir(), "NapCat");

/** meow-memory 是否装在这个 profile 里。 */
export function detectMeow() {
  try {
    const require = createRequire(import.meta.url);
    const pkgFile = require.resolve("meow-memory/package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
    return { installed: true, version: String(pkg.version || ""), dir: path.dirname(pkgFile) };
  } catch {
    return { installed: false, version: "", dir: "" };
  }
}

/** NapCat 是否在预期目录里。 */
export function detectNapcat(dir = DEFAULT_NAPCAT_DIR) {
  const root = String(dir || DEFAULT_NAPCAT_DIR);
  const entry = path.join(root, "napcat.mjs");
  return {
    installed: fs.existsSync(entry),
    dir: root,
    entry,
  };
}

/** 端口通不通（OneBot 反向 WS / NapCat HTTP）。 */
export function checkPort(host, port, timeout = 900) {
  const h = String(host || "127.0.0.1");
  const p = Number(port);
  if (!Number.isFinite(p) || p <= 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    const socket = net.connect({ host: h, port: p });
    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/**
 * 面板「安装与配置」用的清单。
 * @param {object} cfg 生效配置（含 workspace/channel/qqPort/napcatDir）
 * @param {string} workspace 当前工作区
 */
export async function setupStatus(cfg, workspace) {
  const pathExists = Boolean(workspace) && fs.existsSync(workspace);
  const napcat = detectNapcat(cfg?.napcatDir || DEFAULT_NAPCAT_DIR);
  const meow = detectMeow();
  const channel = String(cfg?.channel || "qq");
  const port = Number(cfg?.qqPort || 8643);
  const onebot = channel === "qq" ? await checkPort("127.0.0.1", port) : false;
  const httpUrl = String(cfg?.qqHttpUrl || "");
  let directSend = false;
  if (channel === "qq" && httpUrl) {
    try {
      const url = new URL(httpUrl);
      directSend = await checkPort(url.hostname, Number(url.port || (url.protocol === "https:" ? 443 : 80)));
    } catch {
      directSend = false;
    }
  }

  const items = [
    {
      id: "workspace",
      label: "聊天工作区",
      ok: pathExists,
      detail: pathExists ? workspace : "目录不存在，换一个存在的目录",
      fix: "在下面的输入框里填绝对路径，保存。",
    },
    {
      id: "channel",
      label: "消息通道",
      ok: channel !== "qq" || onebot,
      detail: channel === "qq"
        ? `OneBot 反向 WS 127.0.0.1:${port} ${onebot ? "在线" : "没连上"}`
        : channel === "web"
          ? "投给同工作区开着的 Web 会话"
          : "不接通道（只留记忆和星图）",
      fix: "在 NapCat 里开 WebSocket 反向，URL 填 ws://127.0.0.1:8643，token 与下面一致。",
    },
    {
      id: "meow",
      label: "长期记忆（meow-memory）",
      ok: meow.installed,
      detail: meow.installed ? `已安装 ${meow.version}` : "未安装（灵魂仍可用，只是少一层长期记忆）",
      fix: "在 DSH 插件管理里安装 meow-memory；装完点「重新检测」。",
    },
    {
      id: "napcat",
      label: "QQ 客户端（NapCat）",
      ok: napcat.installed,
      detail: napcat.installed ? napcat.dir : `没在 ${napcat.dir} 找到 napcat.mjs`,
      fix: "从 NapCatQQ 的 Release 下载后放到该目录；已有其它目录就改上面的路径。",
    },
    {
      id: "direct",
      label: "主动消息直发（可选）",
      ok: !httpUrl || directSend,
      detail: httpUrl ? `${httpUrl} ${directSend ? "可达" : "不可达"}` : "没配，主动消息会走 agent 或进发件箱",
      fix: "NapCat 的 HTTP 服务开在 127.0.0.1:6700 后，把地址和 token 填到下面。",
    },
  ];

  return {
    ok: true,
    channel,
    workspace,
    items,
    done: items.filter((item) => item.ok).length,
    total: items.length,
    meow,
    napcat,
    onebot: { host: "127.0.0.1", port, online: onebot },
    direct: { url: httpUrl, online: directSend },
  };
}
