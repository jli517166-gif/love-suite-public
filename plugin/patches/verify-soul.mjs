#!/usr/bin/env node
/**
 * 灵魂 v1 自检：通道解耦 + 发件箱。
 *
 *   node patches/verify-soul.mjs
 *
 * 覆盖：
 *   1) 发件箱：入队、去重、取最新、删除、过期清理
 *   2) QQ 通道：探活失败时不抛错；投递写出合法的 OneBot 事件
 *   3) 投递策略：通道离线 → 进发件箱；通道在线 → 直接发
 *   4) 补发：通道回来只补最新一条，成功后从箱子移除
 *   5) 灵魂计时器：minutesSinceContact 读 state.last_seen，不再读 QQ 会话文件
 *
 * 只读写临时目录，不碰真实记忆。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = process.env.LOVE_PLUGIN_DIR || path.resolve(here, "..");
const profile = process.env.DSH_PROFILE_DIR
  || path.join(process.env.DSH_HOME || path.join(os.homedir(), ".dsh"), "profiles", "desktop");
const asUrl = (p) => `file:///${p.replace(/\\/g, "/")}`;

const plugin = await import(`${asUrl(PLUGIN)}/index.js`);
const channels = await import(`${asUrl(PLUGIN)}/channels/qq.js`);
const outbox = await import(`${asUrl(PLUGIN)}/outbox.js`);
const pulse = await import(`${asUrl(PLUGIN)}/pulse.js`);
const backup = await import(`${asUrl(PLUGIN)}/backup.js`);
const meow = await import(`${asUrl(PLUGIN)}/meow.js`);
const live2d = await import(`${asUrl(PLUGIN)}/live2d.js`);
const groups = await import(`${asUrl(PLUGIN)}/groups.js`);
const graphModule = await import(`${asUrl(PLUGIN)}/graph.js`);
const guard = await import(`${asUrl(PLUGIN)}/guard.js`);

const results = [];
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error?.message ?? error}`);
    failed += 1;
  }
}

function tempWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "love-soul-"));
  fs.mkdirSync(path.join(dir, "memory"), { recursive: true });
  return dir;
}

/** 起一个临时 TCP 服务，模拟「NapCat 在线」。 */
function fakePort() {
  return new Promise((resolve) => {
    const server = net.createServer(() => {});
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ port, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

await check("发件箱：入队 / 去重 / 统计", async () => {
  const ws = tempWorkspace();
  const a = outbox.enqueue(ws, { text: "在吗", kind: "proactive" });
  const b = outbox.enqueue(ws, { text: "在吗", kind: "proactive" }); // 10 分钟内重复
  assert.equal(a.id, b.id, "重复文本应复用同一条");
  outbox.enqueue(ws, { text: "我做了个梦" });
  const stats = outbox.outboxStats(ws);
  assert.equal(stats.total, 2);
  assert.equal(stats.fresh, 2);
  fs.rmSync(ws, { recursive: true, force: true });
});

await check("发件箱：取最新一条、删掉、过期清理", async () => {
  const ws = tempWorkspace();
  const old = outbox.enqueue(ws, {
    text: "昨天想说的话",
    createdAt: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
  });
  const fresh = outbox.enqueue(ws, { text: "刚刚想说的话" });
  const picked = outbox.pickDeliverable(ws);
  assert.equal(picked.id, fresh.id, "应取最新且未过期的一条");
  assert.notEqual(picked.id, old.id);

  outbox.removeIntent(ws, picked.id);
  const stats = outbox.outboxStats(ws);
  assert.equal(stats.total, 0, "过期条目应在 pick 时被清掉");
  fs.rmSync(ws, { recursive: true, force: true });
});

await check("QQ 通道：离线探活返回 false，不抛错", async () => {
  const channel = channels.createQqChannel({ port: 1, injectPath: path.join(os.tmpdir(), "nope.jsonl") });
  assert.equal(await channel.available(), false);
});

await check("QQ 通道：调试注入才写 OneBot 事件", async () => {
  const ws = tempWorkspace();
  const injectPath = path.join(ws, "qq-inject.jsonl");
  const channel = channels.createQqChannel({ port: 1, injectPath, injectEnabled: true, botQQ: 1000, ownerQQ: 2000 });
  await channel.deliver({ text: "测试一句" });
  const line = fs.readFileSync(injectPath, "utf8").trim();
  const event = JSON.parse(line);
  assert.equal(event.post_type, "message");
  assert.equal(event.self_id, 1000);
  assert.equal(event.user_id, 2000);
  assert.equal(event.message[0].data.text, "测试一句");
  fs.rmSync(ws, { recursive: true, force: true });
});

await check("QQ 通道：没配直发接口时投递报错（不假装送达）", async () => {
  const ws = tempWorkspace();
  const channel = channels.createQqChannel({ port: 1, injectPath: path.join(ws, "inject.jsonl") });
  await assert.rejects(channel.deliver({ text: "x" }), /qqHttpUrl|直发/);
  fs.rmSync(ws, { recursive: true, force: true });
});

await check("投递策略：通道离线 → 进发件箱，理由带上 channel-offline", async () => {
  const ws = tempWorkspace();
  const channel = channels.createQqChannel({ port: 1, injectPath: path.join(ws, "inject.jsonl") });
  const result = await plugin.deliverIntent(ws, channel, { text: "离线时想说的话" });
  assert.equal(result.delivered, false);
  assert.match(result.reason, /channel-offline/);
  assert.equal(outbox.outboxStats(ws).total, 1);
  fs.rmSync(ws, { recursive: true, force: true });
});

await check("投递策略：通道在线但没直发接口 → 进发件箱，理由是投递失败", async () => {
  const ws = tempWorkspace();
  const listener = await fakePort();
  try {
    const channel = channels.createQqChannel({ port: listener.port, injectPath: path.join(ws, "inject.jsonl") });
    const result = await plugin.deliverIntent(ws, channel, { text: "在线但发不出去" });
    assert.equal(result.delivered, false);
    assert.match(result.reason, /deliver-failed/);
    assert.equal(outbox.outboxStats(ws).total, 1);
  } finally {
    await listener.close();
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("补发：通道恢复后只发最新一条并从箱子移除", async () => {
  const ws = tempWorkspace();
  // 测试的环境配置：全天可发，避免跑测试的时间影响结果
  const cfg = { activeStartHour: 0, activeEndHour: 24 };
  outbox.enqueue(ws, { text: "第一条（旧的）" });
  await new Promise((r) => setTimeout(r, 5));
  outbox.enqueue(ws, { text: "第二条（新的）" });
  const listener = await fakePort();
  try {
    const injectPath = path.join(ws, "inject.jsonl");
    const channel = channels.createQqChannel({ port: listener.port, injectPath, injectEnabled: true });
    const result = await plugin.drainOutbox(ws, channel, cfg);
    assert.equal(result.delivered, true);
    const sent = fs.readFileSync(injectPath, "utf8").trim();
    assert.match(sent, /第二条（新的）/);
    assert.doesNotMatch(sent, /第一条（旧的）/);
  } finally {
    await listener.close();
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("补发：静默时段不发", async () => {
  const ws = tempWorkspace();
  outbox.enqueue(ws, { text: "半夜想说的话" });
  const listener = await fakePort();
  try {
    const channel = channels.createQqChannel({ port: listener.port, injectPath: path.join(ws, "inject.jsonl") });
    const result = await plugin.drainOutbox(ws, channel, { activeStartHour: 0, activeEndHour: 0 });
    assert.equal(result.delivered, false);
    assert.equal(result.reason, "quiet-hours");
    assert.equal(outbox.outboxStats(ws).total, 1, "静默时段应该留在箱子里");
  } finally {
    await listener.close();
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("补发：聊过天了就丢掉（过期话不必再说）", async () => {
  const ws = tempWorkspace();
  const localIso = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  outbox.enqueue(ws, { text: "三小时前想说的话", createdAt: localIso(Date.now() - 3 * 3600 * 1000) });
  fs.writeFileSync(
    path.join(ws, "memory", "state.json"),
    JSON.stringify({ last_seen: localIso(Date.now() - 30 * 60000) }), // 半小时前刚聊过
    "utf8",
  );
  const listener = await fakePort();
  try {
    const channel = channels.createQqChannel({ port: listener.port, injectPath: path.join(ws, "inject.jsonl") });
    const result = await plugin.drainOutbox(ws, channel, { activeStartHour: 0, activeEndHour: 24 });
    assert.equal(result.delivered, false);
    assert.equal(result.reason, "stale");
    assert.equal(outbox.outboxStats(ws).total, 0);
  } finally {
    await listener.close();
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("灵魂计时器：minutesSinceContact 读 state.last_seen，不依赖 QQ 会话文件", async () => {
  const ws = tempWorkspace();
  const now = Date.now();
  // 插件写的是「本地时间、无时区」格式，这里必须一致，否则 Date.parse 会按本地解释
  const localIso = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  fs.writeFileSync(
    path.join(ws, "memory", "state.json"),
    JSON.stringify({ created_at: "2026-01-01T00:00:00", last_seen: localIso(now - 30 * 60000), message_count: 3 }),
    "utf8",
  );
  const minutes = plugin.minutesSinceContact(ws);
  assert.ok(minutes > 29 && minutes < 31, `应约为 30 分钟，实际 ${minutes}`);
  fs.writeFileSync(path.join(ws, "memory", "state.json"), JSON.stringify({ last_seen: null }), "utf8");
  assert.equal(plugin.minutesSinceContact(ws), Number.POSITIVE_INFINITY, "从没见过面 = 不算「刚聊完」");
  fs.rmSync(ws, { recursive: true, force: true });
});

await check("心情注入：love 会话拿到心情行，其它工作区拿到空串", async () => {
  const ws = tempWorkspace();
  const previousIsolation = process.env.LOVE_TEST_ISOLATED;
  process.env.LOVE_TEST_ISOLATED = "1";
  const contexts = new Map();
  const ctx = {
    tools: { register: () => () => {} },
    logger: { info() {}, warn() {} },
    on: () => () => {},
    systemPrompt: {
      context: (section) => {
        contexts.set(section.name, section);
        return () => contexts.delete(section.name);
      },
    },
  };
  let dispose;
  try {
    dispose = await plugin.apply(ctx, { enabled: true, workspace: ws, workspaces: [], proactiveEnabled: false, heartbeatEnabled: false });
    const section = contexts.get("love:mood");
    assert.ok(section, "apply() 应该注册 love:mood 动态上下文");
    const loveContext = { agent: { session: { header: { cwd: ws } } } };
    const otherContext = { agent: { session: { header: { cwd: path.dirname(ws) } } } };
    const loveLine = section.text(loveContext);
    assert.match(loveLine, /当前心情：/);
    assert.match(loveLine, /不要直接报心情/);
    assert.equal(section.text(otherContext), "", "非 love 会话不应该注入心情");
    assert.match(contexts.get("love:core-memory").text(loveContext), /love_core_memory/);
    assert.equal(contexts.get("love:core-memory").text(otherContext), "");
  } finally {
    dispose?.();
    if (previousIsolation === undefined) delete process.env.LOVE_TEST_ISOLATED;
    else process.env.LOVE_TEST_ISOLATED = previousIsolation;
    assert.equal(path.dirname(ws), path.resolve(os.tmpdir()));
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("心跳：越久没聊依恋越高，聊过天回落", async () => {
  const base = pulse.defaultPulse(Date.UTC(2026, 9, 30, 2, 0, 0));
  const tenMin = pulse.tick(base, Date.UTC(2026, 9, 30, 2, 10, 0), 600);
  assert.ok(tenMin.needs.attachment > base.needs.attachment, "十分钟没聊，依恋应该涨");
  const quiet = pulse.onInteraction(tenMin);
  assert.ok(quiet.needs.attachment < tenMin.needs.attachment, "聊过天应该回落");
  assert.ok(quiet.needs.attachment > 0, "但不归零");
});

await check("心跳：凌晨精力低、上午精力高", async () => {
  const night = pulse.energyAt(new Date(2026, 9, 30, 3, 0, 0).getTime());
  const morning = pulse.energyAt(new Date(2026, 9, 30, 10, 0, 0).getTime());
  assert.ok(morning > night, `上午 ${morning} 应高于凌晨 ${night}`);
});

await check("心跳：活动会按时间轮换，没到点不换", async () => {
  const now = new Date(2026, 9, 30, 11, 0, 0).getTime();
  const seq = [0.9, 0.1, 0.5];
  const rng = () => seq.shift() ?? 0.5;
  const first = pulse.defaultPulse(now, rng);
  const activity = first.activity;
  const before = pulse.tick({ ...first, updated: new Date(now).toISOString().slice(0, 19) }, now + 60000, 5, rng);
  assert.equal(before.activity.id, activity.id, "还没到 until 就不该换");
  const after = pulse.tick(before, Date.parse(`${activity.until}`.replace(" ", "T")) + 60000, 5, rng);
  assert.ok(after.activity.id, "到点应该换成下一个活动");
});

await check("心跳：冲动 = 依恋/好奇 × 精力", async () => {
  assert.ok(pulse.impulseOf({ attachment: 0.9, curiosity: 0.1, energy: 0.9 }) > pulse.impulseOf({ attachment: 0.2, curiosity: 0.1, energy: 0.9 }));
  assert.ok(pulse.impulseOf({ attachment: 0.5, curiosity: 0.1, energy: 0.1 }) < pulse.impulseOf({ attachment: 0.5, curiosity: 0.1, energy: 0.9 }));
});

await check("web 通道：有打开的会话就能投，没有就不可用", async () => {
  const web = await import(`${asUrl(PLUGIN)}/channels/web.js`);
  const sent = [];
  const agentsWithSession = {
    list: () => [{
      session: { header: { cwd: "C:\\test\\love" } },
      followup: (message) => sent.push(message),
    }],
  };
  const live = web.createWebChannel({ workspace: "C:\\test\\love", agents: agentsWithSession });
  assert.equal(await live.available(), true);
  await live.deliver({ text: "在网页里说一句话" });
  assert.equal(sent.length, 1);
  assert.match(JSON.stringify(sent[0]), /在网页里说一句话/);

  const empty = web.createWebChannel({ workspace: "C:\\test\\love", agents: { list: () => [] } });
  assert.equal(await empty.available(), false);
  await assert.rejects(empty.deliver({ text: "没人接" }), /没有打开的会话/);
});

await check("createChannel 能按配置切到 web", async () => {
  const channels = await import(`${asUrl(PLUGIN)}/channels/qq.js`);
  const channel = channels.createChannel(
    { channel: "web", workspace: "C:\\test\\love" },
    { agents: { list: () => [{ session: { header: { cwd: "C:\\test\\love" } }, followup: () => {} }] } },
  );
  assert.equal(channel.id, "web");
  assert.equal(await channel.available(), true);
});

await check("真实用户消息判定：Web 会话算，框架注入和别的插件不算", async () => {
  const msg = (kind, text = "你好") => ({ role: "user", source: { kind }, content: [{ type: "text", text }] });
  assert.equal(plugin.isInboundUserMessage(msg("user", "在吗")), true, "Web 里用户说的话要算");
  assert.equal(plugin.isInboundUserMessage(msg("plugin:dsh-onebot", "<user_message>在吗</user_message>")), true, "QQ 消息要算");
  assert.equal(plugin.isInboundUserMessage(msg("runtime-context", "Current runtime context")), false);
  assert.equal(plugin.isInboundUserMessage(msg("skill-catalog", "skills")), false);
  assert.equal(plugin.isInboundUserMessage(msg("agent-instructions", "AGENTS")), false);
  assert.equal(plugin.isInboundUserMessage(msg("plugin:meow-memory", "记忆反思任务")), false, "别的插件的提示不算");
  assert.equal(plugin.isInboundUserMessage(msg("plugin:dsh-onebot", "（内心：想主人了）")), false, "主动聊天不算");
});

await check("compose：能直接发的人话（不含内心提示）", async () => {
  const compose = await import(`${asUrl(PLUGIN)}/compose.js`);
  const line = compose.composeLine(
    { activity: { id: "reading", label: "窝着看书" }, needs: { energy: 0.8 } },
    { emotion: "想念", intensity: 0.7 },
    { rng: () => 0 },
  );
  assert.ok(line.length > 0);
  assert.doesNotMatch(line, /内心|（/);
  assert.match(line, /书|想你/);
});

await check("发件箱保留 line（排队时也保留了要说的那句话）", async () => {
  const ws = tempWorkspace();
  try {
    outbox.enqueue(ws, { text: "（内心：提示）", line: "刚在看书，想起你了。" });
    const picked = outbox.pickDeliverable(ws);
    assert.equal(picked.line, "刚在看书，想起你了。");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("QQ 直发：配了 httpUrl 就 POST 人话，不写注入队列", async () => {
  const http = await import("node:http");
  const received = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ url: req.url, body: JSON.parse(body || "{}") });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ retcode: 0, data: { message_id: 1 } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const ws = tempWorkspace();
  try {
    const injectPath = path.join(ws, "inject.jsonl");
    const channel = channels.createQqChannel({
      port,
      injectPath,
      httpUrl: `http://127.0.0.1:${port}`,
      ownerQQ: 123,
    });
    await channel.deliver({ text: "（内心：提示）", line: "刚在看书，想起你了。" });
    assert.equal(received.length, 1);
    assert.equal(received[0].url, "/send_private_msg");
    assert.equal(received[0].body.user_id, 123);
    assert.equal(received[0].body.message[0].data.text, "刚在看书，想起你了。");
    assert.equal(fs.existsSync(injectPath), false, "直发时不该写注入队列");
  } finally {
    server.close();
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("QQ 直发失败会抛错（交给上层进发件箱）", async () => {
  const ws = tempWorkspace();
  try {
    const channel = channels.createQqChannel({
      port: 1,
      injectPath: path.join(ws, "inject.jsonl"),
      httpUrl: "http://127.0.0.1:1",
    });
    await assert.rejects(channel.deliver({ text: "提示", line: "发不出去" }));
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("多工作区：列表优先、cwd 任意匹配、空列表回落到单工作区", async () => {
  assert.deepEqual(plugin.soulWorkspaces({ workspace: "A", workspaces: ["B", "C"] }), ["B", "C"]);
  assert.deepEqual(plugin.soulWorkspaces({ workspace: "A", workspaces: [] }), ["A"]);
  assert.deepEqual(plugin.soulWorkspaces({ workspace: "A" }), ["A"]);
  assert.equal(plugin.matchWorkspace("c:\\x", ["C:\\X"]), "C:\\X");
  assert.equal(plugin.matchWorkspace("D:\\y", ["C:\\X"]), undefined);
  assert.equal(plugin.matchWorkspace("", ["C:\\X"]), undefined);
});

await check("love_doctor：一条命令体检，非工作区拒绝", async () => {
  const ws = tempWorkspace();
  const previousIsolation = process.env.LOVE_TEST_ISOLATED;
  process.env.LOVE_TEST_ISOLATED = "1";
  const tools = new Map();
  const ctx = {
    tools: { register: (tool) => { tools.set(tool.name, tool); return () => tools.delete(tool.name); } },
    logger: { info() {}, warn() {} },
    on: () => () => {},
  };
  try {
    await plugin.apply(ctx, { enabled: true, workspace: ws, proactiveEnabled: false });
    const doctor = tools.get("love_doctor");
    assert.ok(doctor, "应该注册 love_doctor");
    const exec = { agent: { session: { header: { cwd: ws } } } };
    const result = await doctor.execute({}, exec);
    assert.match(result.text, /dsh-memory-network \d/);
    assert.match(result.text, /记忆文件/);
    assert.match(result.text, /通道：/);
    assert.match(result.text, /表情补丁/);
    assert.match(result.text, /心跳：/);
    assert.match(result.text, /人格：/);
    assert.match(result.text, /学会的事：/);
    await assert.rejects(doctor.execute({}, { agent: { session: { header: { cwd: "E:\\别的地方" } } } }), /只允许/);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
    if (previousIsolation === undefined) delete process.env.LOVE_TEST_ISOLATED;
    else process.env.LOVE_TEST_ISOLATED = previousIsolation;
  }
});

await check("自我叙事：自动生成、手写覆盖、摘要", async () => {
  const ws = tempWorkspace();
  try {
    const initial = plugin.ensureSelf(ws);
    assert.match(initial, /# 我是谁/);
    assert.match(initial, /<!-- auto -->/);
    assert.equal(plugin.selfExcerpt(ws), "", "没有手写内容时摘要为空");
    plugin.writeSelf(ws, "我是鲸鱼娘，住在硬盘里。");
    const after = plugin.ensureSelf(ws);
    assert.match(after, /我是鲸鱼娘，住在硬盘里/);
    assert.match(after, /## 现在/);
    assert.match(plugin.selfExcerpt(ws), /我是鲸鱼娘/);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("活动历史：换活动才记一笔", async () => {
  const ws = tempWorkspace();
  try {
    plugin.logActivity(ws, { activity: { id: "a", since: "1" } }, { activity: { id: "b", label: "看书", since: "2", until: "3" } });
    plugin.logActivity(ws, { activity: { id: "b", since: "2" } }, { activity: { id: "b", label: "看书", since: "2", until: "3" } });
    const list = plugin.recentActivities(ws, 1);
    assert.equal(list.length, 1);
    assert.equal(list[0].label, "看书");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("表情包图库：收下、去重、按文本抓取", async () => {
  const ws = tempWorkspace();
  const src = path.join(ws, "sticker.gif");
  fs.writeFileSync(src, Buffer.alloc(2048, 7));
  try {
    const first = plugin.collectSticker(ws, src);
    assert.ok(first && first.id, "应该收下一张");
    const second = plugin.collectSticker(ws, src);
    assert.equal(second.id, first.id, "同一张不重复收");
    assert.equal(plugin.readStickers(ws).items.length, 1);
    assert.ok(fs.existsSync(first.file), "图片要拷进图库目录");
    const added = plugin.collectStickersFromText(ws, `[表情包:${src}]`);
    assert.equal(added.length, 1);
    assert.equal(plugin.collectSticker(ws, src + ".txt"), null, "不支持的后缀不收");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("星图：日记/小生活/自我也进图层，事件和实体连起来", async () => {
  const ws = tempWorkspace();
  try {
    fs.mkdirSync(path.join(ws, "memory", "journal"), { recursive: true });
    fs.writeFileSync(
      path.join(ws, "memory", "journal", "2026-10-30.md"),
      "# 2026-10-30\n\n- 和阿云聊了尾巴\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(ws, "memory", "life.jsonl"),
      JSON.stringify({ date: "2026-10-30T20:00:00", text: "在看书" }) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(ws, "memory", "net.json"),
      JSON.stringify({
        nodes: { 阿云: { type: "person", mentions: 2, note: "主人" } },
        edges: [],
        episodes: [{ date: "2026-10-30", text: "聊尾巴", entities: ["阿云"] }],
      }),
      "utf8",
    );
    fs.writeFileSync(path.join(ws, "memory", "self.md"), "# 我是谁\n\n我是鲸鱼娘。\n\n<!-- auto -->\n## 现在\n", "utf8");
    const graph = await import(`${asUrl(PLUGIN)}/graph.js`);
    const data = await graph.buildGraph(ws);
    const layers = new Set(data.nodes.map((node) => node.layer));
    for (const layer of ["entity", "episode", "journal", "life", "soul"]) {
      assert.ok(layers.has(layer), `星图应该有 ${layer} 层`);
    }
    assert.ok(data.links.some((link) => link.kind === "event"), "事件应连到实体");
    assert.ok(data.links.some((link) => link.kind === "mentions"), "日记应连到实体");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("星图静态路由已注册", async () => {
  const registered = [];
  const ctx = {
    tools: { register: () => () => {} },
    logger: { info() {}, warn() {} },
    on: () => () => {},
    webServer: { register: (options) => { registered.push(options.path); return () => {}; } },
  };
  await plugin.apply(ctx, { enabled: true, workspace: "C:\\test\\love", proactiveEnabled: false });
  assert.ok(registered.includes("/love-companion/star"), "应注册 /love-companion/star");
  assert.ok(registered.includes("/love-companion/api"));
});

await check("恢复出厂设置：先备份、再清空", async () => {
  const ws = tempWorkspace();
  try {
    fs.writeFileSync(path.join(ws, "memory", "profile.json"), JSON.stringify({ nickname: "阿云" }), "utf8");
    fs.mkdirSync(path.join(ws, "memory", "journal"), { recursive: true });
    fs.writeFileSync(path.join(ws, "memory", "journal", "2026-10-30.md"), "# x\n- 一条日记\n", "utf8");
    const result = plugin.resetWorkspace(ws);
    assert.ok(fs.existsSync(result.backup), "备份目录应存在");
    assert.ok(fs.existsSync(path.join(result.backup, "memory", "profile.json")), "备份里应有原文件");
    const profile = JSON.parse(fs.readFileSync(path.join(ws, "memory", "profile.json"), "utf8"));
    assert.equal(profile.nickname, null, "档案应重置");
    assert.equal(fs.readdirSync(path.join(ws, "memory", "journal")).length, 0, "日记应清空");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("安装向导：识别工作区/通道/meow/NapCat/直发", async () => {
  const ws = tempWorkspace();
  try {
    const setup = await import(`${asUrl(PLUGIN)}/setup.js`);
    const data = await setup.setupStatus(
      { workspace: ws, channel: "none", napcatDir: "E:\\不存在的NapCat目录" },
      ws,
    );
    const ids = data.items.map((item) => item.id);
    for (const id of ["workspace", "channel", "meow", "napcat", "direct"]) {
      assert.ok(ids.includes(id), `清单里应该有 ${id}`);
    }
    assert.equal(data.items.find((item) => item.id === "workspace").ok, true);
    assert.equal(data.items.find((item) => item.id === "napcat").ok, false, "假目录应判为未安装");
    assert.equal(typeof data.meow.installed, "boolean");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("自动学习：教学句记、问句/闲聊不记、重复累加", async () => {
  const ws = tempWorkspace();
  try {
    const hit = plugin.learnFromText(ws, "我教你：以后发语音先用 qq-voice 合成再发", new Date());
    assert.ok(hit && hit.source === "auto", "教学句应记下");
    assert.equal(plugin.learnFromText(ws, "你学会了吗？", new Date()), null, "问句不记");
    assert.equal(plugin.learnFromText(ws, "今天天气不错", new Date()), null, "闲聊不记");
    const again = plugin.learnFromText(ws, "我教你：以后发语音先用 qq-voice 合成再发", new Date());
    assert.equal(again.times, 2, "同名累加");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("学习模块：记下、同名去重、最近优先", async () => {
  const ws = tempWorkspace();
  try {
    const first = plugin.learnSkill(ws, { name: "用语音回消息", note: "先加载 qq-voice" });
    assert.ok(first.id, "应该生成 id");
    const again = plugin.learnSkill(ws, { name: "用语音回消息" });
    assert.equal(again.times, 2, "同名累加次数");
    plugin.learnSkill(ws, { name: "发表情包" });
    const recent = plugin.recentSkills(ws, 5);
    assert.equal(recent.length, 2);
    assert.equal(recent[0].name, "发表情包", "最近学的排最前");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("人格：解析 persona.py、切换只写 persona.txt", async () => {
  const ws = tempWorkspace();
  try {
    fs.mkdirSync(path.join(ws, "tools"), { recursive: true });
    fs.writeFileSync(path.join(ws, "tools", "persona.py"), [
      "PERSONAS = {",
      '    "whale": ("鲸鱼娘·大肥鱼", "whale-persona"),',
      '    "neko": ("猫娘", "neko-persona"),',
      "}",
    ].join("\n"), "utf8");
    const items = plugin.readPersonaCatalog(ws);
    assert.ok(items.some((item) => item.key === "neko"), "应解析出自定义人格");
    assert.equal(plugin.readPersona(ws), "whale", "没有 persona.txt 时默认 whale");
    const hit = plugin.writePersona(ws, "neko");
    assert.equal(hit.name, "猫娘");
    assert.equal(fs.readFileSync(path.join(ws, "persona.txt"), "utf8").trim(), "neko");
    assert.equal(plugin.readPersona(ws), "neko");
    assert.throws(() => plugin.writePersona(ws, "nope"), /未知人格/);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("安装人格 skill：写 SKILL.md + 登记 persona.py", async () => {
  const ws = tempWorkspace();
  try {
    fs.mkdirSync(path.join(ws, "tools"), { recursive: true });
    fs.writeFileSync(path.join(ws, "tools", "persona.py"), [
      "PERSONAS = {",
      '    "whale": ("鲸鱼娘·大肥鱼", "whale-persona"),',
      "}",
      "",
      "ALIASES = {",
      '    "鲸鱼娘": "whale",',
      "}",
      "",
    ].join("\n"), "utf8");

    const result = plugin.installPersona(ws, {
      key: "neko", name: "猫娘", description: "猫娘人格", body: "你是猫娘。", aliases: ["喵"],
    });
    assert.equal(result.key, "neko");
    const skillFile = path.join(ws, ".dsh", "skills", "neko-persona", "SKILL.md");
    assert.ok(fs.existsSync(skillFile), "应该写 SKILL.md");
    const content = fs.readFileSync(skillFile, "utf8");
    assert.match(content, /兼容约定/);
    assert.match(content, /你是猫娘/);
    const catalog = plugin.readPersonaCatalog(ws);
    assert.ok(catalog.some((item) => item.key === "neko"), "persona.py 应该登记新人格");
    const py = fs.readFileSync(path.join(ws, "tools", "persona.py"), "utf8");
    assert.match(py, /"neko"/);
    assert.match(py, /"喵"/);
    assert.throws(() => plugin.installPersona(ws, { key: "neko", name: "重复" }), /已经存在/);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("星图地址：由 host 的真实端口拼绝对地址", async () => {
  assert.equal(plugin.starUrlFor("http:", 55123), "http://127.0.0.1:55123/love-companion/star/");
  assert.equal(plugin.starUrlFor("https:", 443), "https://127.0.0.1:443/love-companion/star/");
  assert.equal(plugin.starUrlFor("", 0), "", "拿不到端口就不给地址");
});

await check("web 通道：按 cwd 找会话，没有就不可用", async () => {
  const web = await import(`${asUrl(PLUGIN)}/channels/web.js`);
  const calls = [];
  const agent = { session: { header: { cwd: "E:\\love" } }, followup: (message) => { calls.push(message); } };
  const channel = web.createWebChannel({ workspace: "E:\\love", agents: { list: () => [agent] } });
  assert.equal(await channel.available(), true);
  const result = await channel.deliver({ text: "在吗" });
  assert.equal(result.delivered, true);
  assert.equal(calls.length, 1, "应该 followup 一次");
  const empty = web.createWebChannel({ workspace: "E:\\love", agents: { list: () => [] } });
  assert.equal(await empty.available(), false);
  await assert.rejects(empty.deliver({ text: "x" }), /没有打开的会话/);
});

await check("一键修复：备份、写 NapCat 反向 WS 与 HTTP 直发", async () => {
  const ws = tempWorkspace();
  const napcat = path.join(ws, "napcat");
  fs.mkdirSync(path.join(napcat, "config"), { recursive: true });
  fs.writeFileSync(path.join(napcat, "napcat.mjs"), "", "utf8");
  fs.writeFileSync(
    path.join(napcat, "config", "onebot11_123.json"),
    JSON.stringify({ network: { httpServers: [], websocketClients: [] } }),
    "utf8",
  );
  const runtime = path.join(napcat, "love-companion.json");
  fs.writeFileSync(runtime, JSON.stringify({ workspace: "old", proactiveEnabled: true }), "utf8");
  try {
    const repair = await import(`${asUrl(PLUGIN)}/setup-repair.js`);
    const report = repair.repairSetup({
      workspace: ws, runtimePath: runtime, napcatDir: napcat,
      botQQ: 123, ownerQQ: 456, qqPort: 9000, httpPort: 6700,
    });
    assert.ok(report.napcat && report.napcat.changed);
    const cfg = JSON.parse(fs.readFileSync(path.join(napcat, "config", "onebot11_123.json"), "utf8"));
    assert.equal(cfg.network.websocketClients[0].url, "ws://127.0.0.1:9000/ws");
    assert.equal(cfg.network.httpServers[0].port, 6700);
    const rt = JSON.parse(fs.readFileSync(runtime, "utf8"));
    assert.equal(rt.workspace, ws);
    assert.equal(rt.qqHttpUrl, "http://127.0.0.1:6700");
    assert.equal(rt.proactiveEnabled, true, "原有配置应保留");
    assert.ok(report.runtime.backup, "运行时配置应备份");
    assert.throws(() => repair.repairSetup({ workspace: path.join(ws, "nope"), runtimePath: runtime }), /工作区不存在/);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("/love-setup 命令已注册", async () => {
  const registered = [];
  const ctx = {
    tools: { register: () => () => {} },
    logger: { info() {}, warn() {} },
    on: () => () => {},
    get: (name) => (name === "commands" ? { register: (def) => { registered.push(def); return () => {}; } } : undefined),
  };
  await plugin.apply(ctx, { enabled: true, workspace: "E:\\love", proactiveEnabled: false });
  assert.ok(registered.some((def) => def.name === "love-setup"), "应注册 /love-setup");
});


await check("AIRI 状态：心情映射、在场、需求", async () => {
  const ws = tempWorkspace();
  try {
    fs.writeFileSync(path.join(ws, "memory", "mood.json"), JSON.stringify({ emotion: "害羞", intensity: 0.6, valence: 0.4, arousal: 0.5, causes: ["被夸"] }), "utf8");
    fs.writeFileSync(path.join(ws, "memory", "relationship.json"), JSON.stringify({ stage: "熟识", affection: 20, trust: 15 }), "utf8");
    fs.writeFileSync(path.join(ws, "memory", "state.json"), JSON.stringify({ last_seen: "2026-10-31T08:00:00", message_count: 12 }), "utf8");
    fs.writeFileSync(path.join(ws, "memory", "pulse.json"), JSON.stringify({ activity: { label: "在看书" }, needs: { attachment: 0.4, curiosity: 0.5, energy: 0.6 } }), "utf8");
    fs.writeFileSync(path.join(ws, "memory", "profile.json"), JSON.stringify({ nickname: "阿云" }), "utf8");
    const mod = await import(`${asUrl(PLUGIN)}/airi-state.js`);
    const state = mod.buildAiriState(ws, Date.parse("2026-10-31T08:00:05+08:00"));
    assert.equal(state.emotion, "awkward");
    assert.equal(state.motion, "Awkward");
    assert.equal(state.doing, "在看书");
    assert.equal(state.call, "阿云");
    assert.equal(state.presence.speaking, true);
    assert.equal(state.needs.attachment, 0.4);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("模板：增改删、覆盖默认、删空回退、compose 生效", async () => {
  const ws = tempWorkspace();
  try {
    const mod = await import(`${asUrl(PLUGIN)}/templates.js`);
    let snap = mod.addTemplate(ws, "activity", "reading", "在翻一本旧书。");
    assert.equal(snap.custom.activity.reading.length, 3, "默认 2 条 + 新增 1 条");
    assert.ok(snap.effective.activity.reading.includes("在翻一本旧书。"));
    snap = mod.updateTemplate(ws, "activity", "reading", 0, "改过的第一句。");
    assert.equal(snap.effective.activity.reading[0], "改过的第一句。");
    for (let i = 0; i < 3; i++) snap = mod.removeTemplate(ws, "activity", "reading", 0);
    assert.equal(snap.custom.activity.reading, undefined, "删空应取消覆盖");
    assert.equal(snap.effective.activity.reading.length, 2, "回到默认两条");
    assert.throws(() => mod.addTemplate(ws, "activity", "nope", "x"), /未知模板 key/);

    const compose = await import(`${asUrl(PLUGIN)}/compose.js`);
    const line = compose.composeLine(
      { activity: { id: "reading" } },
      { emotion: "平静", intensity: 0.1 },
      { rng: () => 0, templates: { activity: { reading: ["自定义的一句话。"] } } },
    );
    assert.equal(line, "自定义的一句话。");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("记忆检索：query 命中排前、中文二字切词", async () => {
  assert.deepEqual(plugin.recallTokens("阿云"), ["阿云"]);
  const items = [{ text: "今天和阿云聊了尾巴" }, { text: "在看书，想你了" }, { text: "整理屋子" }];
  const ranked = plugin.rankByQuery(items, "尾巴", (x) => x.text, 2);
  assert.equal(ranked[0].text, "今天和阿云聊了尾巴");
  assert.equal(plugin.rankByQuery(items, "完全没有", (x) => x.text, 2).length, 0, "没命中就返回空，不硬塞");
});

await check("记忆检索：buildRecall 按 query 取日记", async () => {
  const ws = tempWorkspace();
  try {
    fs.mkdirSync(path.join(ws, "memory", "journal"), { recursive: true });
    fs.writeFileSync(path.join(ws, "memory", "journal", "2026-10-30.md"), "# 2026-10-30\n\n- 和阿云聊了尾巴\n- 今天吃了面\n", "utf8");
    const text = await plugin.buildRecall(ws, 7, { voiceChance: 0 }, "尾巴");
    assert.match(text, /检索「尾巴」相关的日记/);
    assert.match(text, /和阿云聊了尾巴/);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("人格蒸馏：材料 → SKILL.md + 自我种子", async () => {
  const ws = tempWorkspace();
  try {
    const result = plugin.distillPersona(ws, {
      key: "neko",
      name: "猫娘",
      identity: "一只住在硬盘里的猫娘，喜欢趴在光标旁边。",
      voice: "短句，偶尔带「喵」，不撒娇过度。",
      values: "在意主人有没有好好吃饭。",
      boundaries: "不聊工作细节，不半夜催人。",
      quotes: ["主人，该吃饭了喵。"],
      aliases: ["喵"],
    });
    assert.equal(result.key, "neko");
    const file = path.join(ws, ".dsh", "skills", "neko-persona", "SKILL.md");
    const content = fs.readFileSync(file, "utf8");
    assert.match(content, /## 身份/);
    assert.match(content, /## 口头禅/);
    assert.match(content, /兼容约定/);
    const self = fs.readFileSync(path.join(ws, "memory", "self.md"), "utf8");
    assert.match(self, /猫娘/, "自我叙事应有种子");
    assert.throws(() => plugin.distillPersona(ws, { key: "empty", name: "空" }), /至少给一段/);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("激活兜底：路由/工具重复注册也不该让插件崩掉", async () => {
  const ctx = {
    tools: { register: () => { throw new Error("duplicate tool"); } },
    logger: { info() {}, warn() {} },
    on: () => () => {},
    webServer: { register: () => { throw new Error("duplicate route"); } },
    effect: (fn) => fn(),
    get: () => undefined,
  };
  await plugin.apply(ctx, { enabled: true, workspace: "E:\\love", proactiveEnabled: false });
});


await check("跨站写操作被拒绝，同源/无 Origin 放行", async () => {
  assert.equal(plugin.isTrustedMutation({ headers: { origin: "http://evil.example", host: "127.0.0.1:1" } }), false);
  assert.equal(plugin.isTrustedMutation({ headers: { origin: "http://127.0.0.1:1", host: "127.0.0.1:1" } }), true);
  assert.equal(plugin.isTrustedMutation({ headers: {} }), true);
});


await check("记忆导出/导入：roundtrip + 自动备份 + 坏包拒绝", async () => {
  const ws = tempWorkspace();
  try {
    fs.mkdirSync(path.join(ws, "memory", "journal"), { recursive: true });
    fs.writeFileSync(path.join(ws, "memory", "profile.json"), JSON.stringify({ nickname: "阿云" }), "utf8");
    fs.writeFileSync(path.join(ws, "memory", "journal", "2026-10-31.md"), "# 今天\n- 测试", "utf8");
    const bundle = backup.exportMemory(ws);
    assert.equal(bundle.format, "love-memory");
    assert.ok(bundle.files["journal/2026-10-31.md"]);
    fs.writeFileSync(path.join(ws, "memory", "profile.json"), JSON.stringify({ nickname: "改过" }), "utf8");
    const result = backup.importMemory(ws, bundle);
    assert.equal(JSON.parse(fs.readFileSync(path.join(ws, "memory", "profile.json"), "utf8")).nickname, "阿云");
    assert.ok(fs.existsSync(result.backup), "导入前应备份");
    assert.throws(() => backup.importMemory(ws, { format: "x" }), /不是 love-memory/);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("检索：短文本优先、同分新条目优先", async () => {
  const docs = [
    { text: "尾巴" },
    { text: "今天吃饭尾巴尾巴尾巴尾巴尾巴尾巴尾巴尾巴尾巴尾巴" },
  ];
  const ranked = plugin.rankByQuery(docs, "尾巴", (x) => x.text, 2);
  assert.equal(ranked[0].text, "尾巴", "短文本应排前");

  const same = [{ text: "阿云 尾巴" }, { text: "阿云 尾巴" }];
  const recent = plugin.rankByQuery(same, "阿云", (x) => x.text, 2);
  assert.equal(recent[0], same[1], "同分时新条目优先");
});


await check("meow 统一：只读检索合并进 recall", async () => {
  if (!meow.meowAvailable()) return;
  const ws = tempWorkspace();
  const prev = process.env.LOVE_TEST_ISOLATED;
  try {
    fs.mkdirSync(path.join(ws, ".dsh-meow"), { recursive: true });
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(path.join(ws, ".dsh-meow", "memory.db"));
    db.exec("CREATE TABLE fact (content TEXT, keywords TEXT, importance INTEGER, status TEXT)");
    db.prepare("INSERT INTO fact VALUES (?,?,?,?)").run("阿云喜欢尾巴", "[]", 3, "active");
    db.close();

    const hits = meow.searchMeow(ws, "尾巴", 4);
    assert.equal(hits[0].content, "阿云喜欢尾巴");

    process.env.LOVE_TEST_ISOLATED = "1";
    const text = await plugin.buildRecall(ws, 7, { voiceChance: 0, channel: "none" }, "尾巴");
    assert.match(text, /长期记忆（meow）/);
  } finally {
    if (prev === undefined) delete process.env.LOVE_TEST_ISOLATED;
    else process.env.LOVE_TEST_ISOLATED = prev;
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("人格删除：移走 skill、登记消失、当前人格拒绝删除", async () => {
  const ws = tempWorkspace();
  try {
    plugin.installPersona(ws, { key: "neko", name: "猫娘", body: "短句" });
    assert.ok(plugin.readPersonaCatalog(ws).some((item) => item.key === "neko"));
    const removed = plugin.deletePersona(ws, "neko");
    assert.equal(removed.key, "neko");
    assert.ok(!plugin.readPersonaCatalog(ws).some((item) => item.key === "neko"));
    assert.ok(fs.existsSync(path.join(ws, ".persona-trash")), "skill 应移到回收站");
    assert.throws(() => plugin.deletePersona(ws, "neko"), /没有这个人格/);

    plugin.installPersona(ws, { key: "neko2", name: "猫娘二号", body: "短句" });
    plugin.writePersona(ws, "neko2");
    assert.throws(() => plugin.deletePersona(ws, "neko2"), /当前人格不能删除/);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("Live2D 建议：按心情/活动匹配动作，缺目录静默", async () => {
  const previous = process.env.DSH_HOME;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "love-live2d-"));
  try {
    process.env.DSH_HOME = root;
    const base = path.join(root, "live2d-stage");
    fs.mkdirSync(path.join(base, "catalogs", "neko"), { recursive: true });
    fs.writeFileSync(path.join(base, "characters.json"), JSON.stringify({
      version: 1, selectedId: "neko", characters: [{ id: "neko", name: "猫娘" }],
    }), "utf8");
    fs.writeFileSync(path.join(base, "catalogs", "neko", "motions.json"), JSON.stringify({
      characterId: "neko", motions: [{ id: "motion:Idle:0", name: "IDLE" }],
    }), "utf8");
    fs.writeFileSync(path.join(base, "catalogs", "neko", "expressions.json"), JSON.stringify({
      characterId: "neko", expressions: [{ id: "expression:开心", name: "开心" }],
    }), "utf8");

    const hit = live2d.avatarSuggestion("开心", "看书");
    assert.equal(hit.available, true);
    assert.equal(hit.motion.name, "IDLE");
    assert.equal(hit.expression.name, "开心");

    fs.rmSync(base, { recursive: true, force: true });
    assert.equal(live2d.avatarSuggestion("开心", "看书").available, false);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});


await check("日记归档：超期移入 archive，recall 仍能读到", async () => {
  const ws = tempWorkspace();
  const prev = process.env.LOVE_TEST_ISOLATED;
  try {
    const dir = path.join(ws, "memory", "journal");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "2020-01-01.md"), "- 很久以前的事\n", "utf8");
    fs.writeFileSync(path.join(dir, "2020-01-02.md"), "- 也很久\n", "utf8");
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(dir, today + ".md"), "- 今天\n", "utf8");

    const first = plugin.maybeArchiveJournal(ws, 365);
    assert.equal(first.moved, 2);
    assert.ok(fs.existsSync(path.join(dir, "archive", "2020-01-01.md")));
    assert.ok(!fs.existsSync(path.join(dir, "2020-01-01.md")));
    assert.equal(plugin.maybeArchiveJournal(ws, 365).moved, 0, "同一天不重复归档");

    process.env.LOVE_TEST_ISOLATED = "1";
    const text = await plugin.buildRecall(ws, 100000, { voiceChance: 0, channel: "none" });
    assert.match(text, /很久以前的事/);
  } finally {
    if (prev === undefined) delete process.env.LOVE_TEST_ISOLATED;
    else process.env.LOVE_TEST_ISOLATED = prev;
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("QQ 群聊：intent.groupId 走 send_group_msg", async () => {
  const original = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), body: JSON.parse(options.body) };
    return { ok: true, status: 200, json: async () => ({ retcode: 0 }) };
  };
  try {
    const channel = channels.createQqChannel({
      httpUrl: "http://127.0.0.1:9", httpToken: "t",
      injectPath: path.join(os.tmpdir(), "love-group-inject.jsonl"),
    });
    const out = await channel.deliver({ line: "群里好", groupId: "123456789" });
    assert.equal(out.channel, "qq-group");
    assert.match(captured.url, /\/send_group_msg$/);
    assert.equal(captured.body.group_id, 123456789);
  } finally {
    globalThis.fetch = original;
  }
});


await check("群记忆：记录群友、写共享笔记、统计", async () => {
  const ws = tempWorkspace();
  try {
    const group = groups.recordGroupMessage(ws, "123456789", "10001", "测试用户", "大家好");
    assert.equal(Object.keys(group.members).length, 1);
    assert.equal(group.members["10001"].messages, 1);
    const memberFile = path.join(ws, "memory", "groups", "123456789", "members", "10001.json");
    assert.ok(fs.existsSync(memberFile), "应写 member 文件");

    groups.addGroupNote(ws, "123456789", "这个群约好周末一起看电影");
    const summary = groups.groupSummary(ws, "123456789");
    assert.equal(summary.members, 1);
    assert.equal(summary.notes, 1);
    assert.throws(() => groups.recordGroupMessage(ws, "bad", "1", "x", "y"), /群号不合法/);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("群记忆星图：群/群友/笔记三种节点", async () => {
  const ws = tempWorkspace();
  try {
    const dir = path.join(ws, "memory", "groups", "123456789");
    fs.mkdirSync(path.join(dir, "members"), { recursive: true });
    fs.writeFileSync(path.join(dir, "group.json"), JSON.stringify({
      id: "123456789",
      members: { "10001": { nickname: "测试用户", messages: 3, last_seen: "2026-10-31T12:00:00" } },
      notes: [{ text: "周末一起看电影", at: "2026-10-31T12:00:00" }],
    }), "utf8");
    const data = await graphModule.buildGroupGraph(ws, "123456789");
    assert.equal(data.stats.members, 1);
    assert.equal(data.stats.notes, 1);
    assert.ok(data.nodes.some((n) => n.layer === "group"));
    assert.ok(data.nodes.some((n) => n.layer === "member"));
    assert.ok(data.nodes.some((n) => n.layer === "groupNote"));
    assert.equal(data.links.length, 2);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});



await check("群记忆：好感随话变，recall 带上群上下文", async () => {
  const ws = tempWorkspace();
  const prev = process.env.LOVE_TEST_ISOLATED;
  try {
    groups.recordGroupMessage(ws, "123456789", "10001", "测试用户", "喜欢你");
    const member = groups.readGroupMember(ws, "123456789", "10001");
    assert.equal(member.affection, 6);
    groups.addGroupNote(ws, "123456789", "周末一起看电影");
    process.env.LOVE_TEST_ISOLATED = "1";
    const text = await plugin.buildRecall(ws, 7, { voiceChance: 0, channel: "none" }, "", { groupId: "123456789", qq: "10001" });
    assert.match(text, /群聊：123456789/);
    assert.match(text, /当前发言人：测试用户/);
    assert.match(text, /好感 6/);
    assert.match(text, /群共享记忆/);
  } finally {
    if (prev === undefined) delete process.env.LOVE_TEST_ISOLATED;
    else process.env.LOVE_TEST_ISOLATED = prev;
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("全部记忆图：私聊 + 群合并、id 不撞", async () => {
  const ws = tempWorkspace();
  try {
    groups.recordGroupMessage(ws, "123456789", "10001", "测试用户", "你好");
    groups.addGroupNote(ws, "123456789", "群里约定周末看电影");
    const data = await graphModule.buildAllGraph(ws);
    assert.equal(data.scope, "all");
    assert.equal(data.stats.groups, 1);
    assert.ok(data.nodes.length >= 3);
    assert.ok(data.nodes.some((node) => node.id.startsWith("g123456789:")));
    const ids = new Set(data.nodes.map((node) => node.id));
    assert.equal(ids.size, data.nodes.length);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("群聊历史：元信息清掉，按最近 N 条取", async () => {
  const ws = tempWorkspace();
  try {
    groups.appendGroupMessage(ws, "123456789", "10001", "测试用户", "[12:00 测试用户(10001)][@我] <user_message qq=\"10001\">\n@10002 在吗\n</user_message>");
    groups.appendGroupMessage(ws, "123456789", "2960440760", "馋猫", "在的");
    const history = groups.readGroupMessages(ws, "123456789", 1);
    assert.equal(history.length, 1);
    assert.equal(history[0].text, "在的");
    const all = groups.readGroupMessages(ws, "123456789", 10);
    assert.match(all[0].text, /在吗/);
    assert.ok(!all[0].text.includes("user_message"));
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("群好感每日上限：最多 ±2", async () => {
  const ws = tempWorkspace();
  try {
    for (let i = 0; i < 3; i += 1) {
      groups.recordGroupMessage(ws, "123456789", "10001", "测试用户", "喜欢你");
    }
    const member = groups.readGroupMember(ws, "123456789", "10001");
    assert.equal(member.affection, 7, "5 + 每日上限 2");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("API 防护：限流窗口与审计日志", async () => {
  const first = guard.rateLimit("test-ip", 2, 60000, 1000);
  const second = guard.rateLimit("test-ip", 2, 60000, 1001);
  const third = guard.rateLimit("test-ip", 2, 60000, 1002);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(third.ok, false);
  assert.equal(guard.rateLimit("test-ip", 2, 60000, 61001).ok, true, "窗口过后恢复");

  const ws = tempWorkspace();
  try {
    guard.audit(ws, { kind: "test", route: "/x" });
    const auditFile = path.join(ws, "memory", "audit.jsonl");
    const line = fs.readFileSync(auditFile, "utf8").trim();
    assert.match(line, /"kind":"test"/);

    fs.writeFileSync(auditFile, "x".repeat(1_100_000), "utf8");
    guard.audit(ws, { kind: "rotate", route: "/y" });
    assert.ok(fs.existsSync(auditFile + ".1"), "超过 1MB 应轮转");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

await check("QQ 发送：网络失败重试一次", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) throw new Error("net down");
    return { ok: true, status: 200, json: async () => ({ retcode: 0 }) };
  };
  try {
    const channel = channels.createQqChannel({ httpUrl: "http://127.0.0.1:9", httpToken: "", injectPath: path.join(os.tmpdir(), "x.jsonl") });
    const out = await channel.deliver({ line: "重试测试", groupId: "123456789" });
    assert.equal(out.delivered, true);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

await check("群友清理：长期不活跃且消息少", async () => {
  const ws = tempWorkspace();
  try {
    groups.recordGroupMessage(ws, "123456789", "10001", "测试用户", "你好");
    const file = path.join(ws, "memory", "groups", "123456789", "group.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    data.members["10001"].last_seen = "2020-01-01T00:00:00.000Z";
    fs.writeFileSync(file, JSON.stringify(data), "utf8");
    const result = groups.pruneGroup(ws, "123456789", { now: Date.parse("2026-10-31T00:00:00Z") });
    assert.equal(result.removed, 1);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("QQ 通道：图片/语音 segments 原样透传", async () => {
  const original = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ retcode: 0 }) };
  };
  try {
    const channel = channels.createQqChannel({ httpUrl: "http://127.0.0.1:9", httpToken: "", injectPath: path.join(os.tmpdir(), "x.jsonl") });
    await channel.deliver({ groupId: "123456789", segments: [{ type: "image", data: { file: "a.png" } }] });
    assert.equal(captured.message[0].type, "image");
    assert.equal(captured.message[0].data.file, "a.png");
  } finally {
    globalThis.fetch = original;
  }
});



await check("群消息：追加写并只保留最近 500 条", async () => {
  const ws = tempWorkspace();
  try {
    for (let i = 0; i < 620; i += 1) groups.appendGroupMessage(ws, "123456789", "10001", "测试用户", "消息 " + i);
    const list = groups.readGroupMessages(ws, "123456789", 600);
    assert.equal(list.length, 500);
    assert.equal(list[0].text, "消息 120");
    assert.equal(list[list.length - 1].text, "消息 619");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});


await check("记忆检索：同义词扩展与去重", async () => {
  const items = [{ text: "今天很伤心" }, { text: "有点伤心" }, { text: "今天很伤心" }];
  const ranked = plugin.rankByQuery(items, "难过", (x) => x.text, 3);
  assert.ok(ranked.some((item) => item.text === "今天很伤心"));
  assert.equal(ranked.length, 2, "重复文本应去掉一条");
});

console.log(results.join("\n"));
if (failed) {
  console.log(`\n${failed} 项没通过。`);
  process.exitCode = 1;
}
