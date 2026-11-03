/**
 * 生成大量测试记忆，用来压测星图。
 *
 * 用法：
 *   node scripts/gen-test-memories.mjs --out "E:\tmp\galaxy-workspace" --count 700
 *
 * 只写测试工作区，不会碰你正在用的 love 工作区。
 * 生成后把插件设置里的「聊天工作区」指到该目录，重启 DSH 即可看到大图。
 */

import fs from "node:fs";
import path from "node:path";

function arg(name, fallback) {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const out = path.resolve(arg("out", path.join(process.cwd(), "galaxy-workspace")));
const count = Math.max(10, Math.min(2000, Number(arg("count", 700)) || 700));
const memory = path.join(out, "memory");
fs.mkdirSync(path.join(memory, "journal"), { recursive: true });

fs.writeFileSync(path.join(memory, "profile.json"), JSON.stringify({
  name: "测试记忆",
  call: "测试",
  likes: ["银河", "夜航", "旧书"],
  dislikes: ["吵闹"],
  boundaries: ["不编造事实"],
}, null, 2) + "\n", "utf8");

fs.writeFileSync(path.join(memory, "relationship.json"), JSON.stringify({
  stage: "初识", affection: 6, trust: 5, first_met: "2026-01-01",
}, null, 2) + "\n", "utf8");

const life = [];
const learning = [];
for (let i = 0; i < Math.min(count, 300); i += 1) {
  life.push({ at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), text: `测试小生活 ${i + 1}：在窗边看了一会儿夜航船。`, mood: "平静" });
  learning.push({ at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), name: `测试能力 ${i + 1}`, note: "用于压测星图的测试条目。" });
}
fs.writeFileSync(path.join(memory, "life.json"), JSON.stringify({ items: life }, null, 2) + "\n", "utf8");
fs.writeFileSync(path.join(memory, "life.jsonl"), life.map((item) => JSON.stringify(item)).join("\n") + "\n", "utf8");
fs.writeFileSync(path.join(memory, "learning.json"), JSON.stringify({ items: learning }, null, 2) + "\n", "utf8");

const topics = ["夜航", "银河", "旧书", "雨声", "咖啡", "长途车", "海风", "灯塔", "信", "猫"];
for (let i = 0; i < count; i += 1) {
  const date = new Date(Date.UTC(2025, 0, 1 + i));
  const day = date.toISOString().slice(0, 10);
  const topic = topics[i % topics.length];
  fs.writeFileSync(path.join(memory, "journal", day + ".md"), `# ${day}\n\n- 今天想到${topic}。这是第 ${i + 1} 条测试日记，用来让星图长成银河。\n`, "utf8");
}

fs.writeFileSync(path.join(memory, "self.md"), "# 自我叙事\n\n这是一个用于压测的测试工作区。\n", "utf8");

// 可选：造一份 meow 长期记忆库，让星图出现项目/事实/经验/话题四条臂。
try {
  const { DatabaseSync } = await import("node:sqlite");
  const meow = path.join(out, ".dsh-meow");
  fs.mkdirSync(meow, { recursive: true });
  const db = new DatabaseSync(path.join(meow, "memory.db"));
  const tables = { project: 60, fact: 100, lesson: 50, topic: 40, user: 10, rules: 10 };
  for (const [table, count] of Object.entries(tables)) {
    db.exec("CREATE TABLE IF NOT EXISTS " + table + " (id TEXT PRIMARY KEY, title TEXT, content TEXT, importance INTEGER, keywords TEXT, status TEXT)");
    const insert = db.prepare("INSERT OR REPLACE INTO " + table + " (id,title,content,importance,keywords,status) VALUES (?,?,?,?,?,?)");
    for (let index = 0; index < count; index += 1) {
      insert.run(table + "-" + index, "测试" + table + " " + (index + 1), "这是用于压测星图四条臂的" + table + "记录 " + index, 1 + (index % 4), '["测试","银河"]', "active");
    }
  }
  db.close();
  console.log("已生成 .dsh-meow/memory.db");
} catch (error) {
  console.log("跳过 SQLite 测试库：" + error.message);
}
console.log(`生成完成：${out}`);
console.log(`日记 ${count} 条，小生活 ${life.length} 条，学习 ${learning.length} 条`);
console.log("把插件工作区指到这个目录，重启 DSH 后打开星图。");
