/**
 * 一键修复：把「配置」这一半做成可重复执行的本地动作。
 *
 * 能做：写运行时配置、修 NapCat 的 OneBot 反向 WS / HTTP 直发（都先备份）。
 * 不做：装 npm 依赖（那会改正在运行的 profile，交给插件管理或 install.ps1）。
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function backup(file) {
  if (!fs.existsSync(file)) return "";
  const bak = `${file}.bak-repair-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}`;
  fs.copyFileSync(file, bak);
  return bak;
}

/** 找到某个 QQ 的 onebot 配置；找不到就退回 onebot11.json。 */
export function findOnebotConfig(napcatDir, botQQ) {
  const dir = path.join(String(napcatDir || ""), "config");
  if (botQQ) {
    const file = path.join(dir, `onebot11_${botQQ}.json`);
    if (fs.existsSync(file)) return file;
  }
  const fallback = path.join(dir, "onebot11.json");
  return fs.existsSync(fallback) ? fallback : "";
}

/**
 * 修 NapCat 的 OneBot 网络配置。
 * @returns {{file: string, backup: string, changed: boolean, token: string, httpPort: number}}
 */
export function repairNapcat(options = {}) {
  const napcatDir = String(options.napcatDir || "");
  const file = findOnebotConfig(napcatDir, options.botQQ);
  if (!file) throw new Error(`没找到 onebot 配置：${path.join(napcatDir, "config")}`);
  const config = readJson(file) || {};
  if (!config.network) config.network = {};

  const token = String(options.token || config.network?.websocketClients?.[0]?.token || "").trim()
    || createHash("sha256").update(`${Date.now()}-${Math.random()}`).digest("hex").slice(0, 32);
  const qqPort = Number(options.qqPort || 8643);
  const clients = Array.isArray(config.network.websocketClients) ? config.network.websocketClients : [];
  let client = clients.find((item) => item?.name === "dsh-onebot");
  if (!client) {
    client = { name: "dsh-onebot", enable: true, messagePostFormat: "array", reportSelfMessage: false, reconnectInterval: 5000, debug: false, heartInterval: 30000 };
    clients.push(client);
  }
  client.enable = true;
  client.url = `ws://127.0.0.1:${qqPort}/ws`;
  client.token = token;
  config.network.websocketClients = clients;

  const httpPort = Number(options.httpPort || 0);
  if (httpPort > 0) {
    const servers = Array.isArray(config.network.httpServers) ? config.network.httpServers : [];
    let server = servers.find((item) => item?.name === "memory-network-direct");
    if (!server) {
      server = { name: "memory-network-direct", enable: true, host: "127.0.0.1", port: httpPort };
      servers.push(server);
    }
    server.enable = true;
    server.host = "127.0.0.1";
    server.port = httpPort;
    server.token = token;
    config.network.httpServers = servers;
  }

  const bak = backup(file);
  writeJson(file, config);
  return { file, backup: bak, changed: true, token, httpPort };
}

/**
 * 一键修复：运行时配置 + NapCat 网络。
 * @param {{workspace: string, runtimePath: string, napcatDir?: string, botQQ?: string|number, ownerQQ?: string|number, qqPort?: number, httpPort?: number, token?: string, channel?: string}} input
 */
export function repairSetup(input = {}) {
  const workspace = String(input.workspace || "").trim();
  if (!workspace || !fs.existsSync(workspace)) throw new Error(`工作区不存在：${workspace || "(空)"}`);
  const runtimePath = String(input.runtimePath || "");
  if (!runtimePath) throw new Error("没有运行时配置路径");

  const before = readJson(runtimePath) || {};
  const runtime = {
    ...before,
    workspace,
    channel: String(input.channel || before.channel || "qq"),
    qqHost: "127.0.0.1",
    qqPort: Number(input.qqPort || before.qqPort || 8643),
  };
  if (input.botQQ) runtime.botQQ = Number(input.botQQ);
  if (input.ownerQQ) runtime.ownerQQ = Number(input.ownerQQ);
  runtime.napcatDir = String(input.napcatDir || before.napcatDir || "");

  const report = { runtime: { file: runtimePath, backup: "" }, napcat: null, warnings: [] };

  if (runtime.napcatDir) {
    try {
      const patched = repairNapcat({
        napcatDir: runtime.napcatDir,
        botQQ: runtime.botQQ,
        qqPort: runtime.qqPort,
        httpPort: Number(input.httpPort || 0),
        token: input.token || before.qqHttpToken,
      });
      report.napcat = patched;
      if (patched.httpPort > 0) {
        runtime.qqHttpUrl = `http://127.0.0.1:${patched.httpPort}`;
        runtime.qqHttpToken = patched.token;
      }
    } catch (err) {
      report.warnings.push(String(err?.message ?? err));
    }
  } else {
    report.warnings.push("没有 NapCat 目录：只修了运行时配置");
  }

  report.runtime.backup = backup(runtimePath);
  writeJson(runtimePath, runtime);
  report.runtime.channel = runtime.channel;
  report.runtime.qqPort = runtime.qqPort;
  report.runtime.httpUrl = runtime.qqHttpUrl || "";
  return report;
}
