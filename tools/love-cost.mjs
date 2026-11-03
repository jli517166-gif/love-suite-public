#!/usr/bin/env node
/**
 * 算 love 会话花了多少钱（按 DSH 会话日志里的真实 usage）。
 *
 *   node love-cost.mjs                 # 最近 7 天
 *   node love-cost.mjs --days 30
 *   node love-cost.mjs --dir "C:\...\sessions\--E-...-love--"
 *   node love-cost.mjs --price 2,0.2,3 # 未命中/命中/输出 每百万 token 的价（元）
 *
 * 价格默认按 DeepSeek V3.2 档：未命中 2、缓存命中 0.2、输出 3（元/百万 token）。
 * 你的账号实际单价以控制台为准；换个模型改 --price 即可。
 *
 * 只读会话文件，不写任何东西。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const DAYS = Number(argOf("days", 7));
const PRICE = (() => {
  const raw = argOf("price", "2,0.2,3").split(",").map(Number);
  const [miss, hit, out] = raw.length === 3 && raw.every(Number.isFinite) ? raw : [2, 0.2, 3];
  return { miss, hit, out };
})();

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const SESSIONS_ROOT = path.join(DSH_HOME, "sessions");

/** 找 love 工作区的会话目录：名字里带 love 的桶，或 --dir 指定。 */
function sessionDirs() {
  const explicit = argOf("dir", "");
  if (explicit) return [path.resolve(explicit)];
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(SESSIONS_ROOT, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.includes("love")) out.push(path.join(SESSIONS_ROOT, entry.name));
  }
  return out;
}

function walkSessionFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === "session.v4.jsonl.zstd") out.push(full);
    }
  }
  return out;
}

/** DSH 会话是「多帧 zstd 拼接」，zstdDecompressSync 只吃第一帧，所以要按魔数切开。 */
function readSession(file) {
  const buf = fs.readFileSync(file);
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const starts = [];
  let i = 0;
  while (true) {
    const k = buf.indexOf(magic, i);
    if (k < 0) break;
    starts.push(k);
    i = k + 4;
  }
  const chunks = [];
  for (let j = 0; j < starts.length; j++) {
    const s = starts[j];
    const e = j + 1 < starts.length ? starts[j + 1] : buf.length;
    try {
      chunks.push(zlib.zstdDecompressSync(buf.subarray(s, e)).toString("utf8"));
    } catch {
      // 尾巴被写坏/半帧：忽略，前面能算的都算
    }
  }
  return chunks.join("");
}

const localDay = (ms) => {
  const d = new Date(ms);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const money = (n) => (n >= 1 ? `¥${n.toFixed(2)}` : `¥${n.toFixed(3)}`);

if (typeof zlib.zstdDecompressSync !== "function") {
  console.error("这个 Node 不支持 zstd（需要 Node 22.15+）。用 DSH 自带的 node 跑。");
  process.exit(2);
}

const byDay = new Map();
const turnCosts = [];
let files = 0;
let readErrors = 0;

for (const dir of sessionDirs()) {
  for (const file of walkSessionFiles(dir)) {
    let text = "";
    try {
      text = readSession(file);
      files += 1;
    } catch {
      readErrors += 1;
      continue;
    }
    const turnOf = new Map();
    for (const line of text.split("\n")) {
      if (!line) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === "turn/start" && Number.isFinite(ev.time)) {
        turnOf.set(`t${ev.data?.turn}`, ev.time);
      }
      if (ev.type !== "assistant/message" || !ev.data?.usage) continue;
      const u = ev.data.usage;
      const miss = Number(u.inputTokens ?? 0);
      const hit = Number(u.cacheReadTokens ?? 0);
      const out = Number(u.outputTokens ?? 0);
      const cost = (miss * PRICE.miss + hit * PRICE.hit + out * PRICE.out) / 1e6;
      const day = localDay(Number(ev.time ?? Date.now()));
      const row = byDay.get(day) || { miss: 0, hit: 0, out: 0, cost: 0, steps: 0, files: new Set() };
      row.miss += miss;
      row.hit += hit;
      row.out += out;
      row.cost += cost;
      row.steps += 1;
      row.files.add(file);
      byDay.set(day, row);
      turnCosts.push({ day, turn: ev.data.turn, step: ev.data.step, cost, miss, hit, out });
    }
  }
}

const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, DAYS);
if (!days.length) {
  console.log(`没找到 love 会话（${sessionDirs().join(", ") || SESSIONS_ROOT}）。`);
  process.exit(0);
}

const total = { cost: 0, miss: 0, hit: 0, out: 0, steps: 0 };
console.log(`\nlove 会话花费（${PRICE.miss}/${PRICE.hit}/${PRICE.out} 元每百万 token：未命中/命中/输出）`);
console.log(`价格口径：DeepSeek V3.2 档；换模型用 --price 改。读了 ${files} 个会话文件。\n`);
console.log("日期\t\t步数\t命中率\t\t处理 token\t\t花费");
for (const [day, row] of days) {
  const processed = row.miss + row.hit;
  const hitRate = processed ? ((row.hit / processed) * 100).toFixed(1) : "0.0";
  total.cost += row.cost;
  total.miss += row.miss;
  total.hit += row.hit;
  total.out += row.out;
  total.steps += row.steps;
  console.log(`${day}\t${String(row.steps).padStart(3)}\t${hitRate.padStart(5)}%\t\t${String(processed).padStart(9)}\t\t${money(row.cost)}`);
}

const processed = total.miss + total.hit;
console.log(`\n合计：${total.steps} 步 / 处理 ${processed} token / 输出 ${total.out} token / ${money(total.cost)}`);
console.log(`命中率 ${((total.hit / Math.max(1, processed)) * 100).toFixed(1)}%，平均每步 ${money(total.cost / Math.max(1, total.steps))}`);

const worst = [...turnCosts].sort((a, b) => b.cost - a.cost).slice(0, 3);
if (worst.length) {
  console.log("\n最贵的 3 轮：");
  for (const w of worst) {
    console.log(`  ${w.day} turn ${w.turn} / step ${w.step}: ${money(w.cost)}（miss ${w.miss} hit ${w.hit} out ${w.out}）`);
  }
}

const today = localDay(Date.now());
const todayRow = byDay.get(today);
console.log(`\n今天：${todayRow ? `${money(todayRow.cost)}（${todayRow.steps} 步）` : "还没有会话"}`);
