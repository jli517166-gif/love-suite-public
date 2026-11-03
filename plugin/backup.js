/**
 * 记忆导出 / 导入：把 memory/ 下的文本记忆打成一个 JSON 包，换机器时能带走。
 *
 * 只处理文本（JSON / markdown / jsonl）；表情包图片不打包（体积大，重新收即可）。
 * 导入前先把现有 memory/ 整份备份到 .import-backups/<时间>/。
 */

import fs from "node:fs";
import path from "node:path";
import { validateCoreMemory } from './core-memory.js';
import { validateReflectionQueue } from './reflection.js';
import { validateReflectionWorker } from './reflection-worker.js';

const FILES = [
  "profile.json",
  "relationship.json",
  "state.json",
  "mood.json",
  "pulse.json",
  "net.json",
  "learning.json",
  "stickers.json",
  "templates.json",
  "self.md",
  "life.jsonl",
  "activity.jsonl",
  "core-memory.json",
  "reflection-queue.json",
  "reflection-worker.json",
];

export function exportMemory(workspace) {
  const mem = path.join(workspace, "memory");
  const files = {};
  for (const name of FILES) {
    const file = path.join(mem, name);
    if (fs.existsSync(file)) files[name] = fs.readFileSync(file, "utf8");
  }
  const journalDir = path.join(mem, "journal");
  const groupsDir = path.join(mem, 'groups');
  if (fs.existsSync(groupsDir)) {
    for (const groupId of fs.readdirSync(groupsDir)) {
      if (!/^[1-9][0-9]{4,11}$/.test(groupId)) continue;
      for (const name of ['core-memory.json', 'group.json', 'reflection-queue.json']) {
        const file = path.join(groupsDir, groupId, name);
        if (fs.existsSync(file)) files[`groups/${groupId}/${name}`] = fs.readFileSync(file, 'utf8');
      }
    }
  }
  if (fs.existsSync(journalDir)) {
    for (const name of fs.readdirSync(journalDir)) {
      if (!name.endsWith(".md")) continue;
      const file = path.join(journalDir, name);
      if (fs.statSync(file).isFile()) files[`journal/${name}`] = fs.readFileSync(file, "utf8");
    }
  }
  return {
    format: "love-memory",
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace,
    files,
  };
}

export function importMemory(workspace, bundle) {
  if (!bundle || bundle.format !== "love-memory" || bundle.version !== 1) {
    throw new Error("不是 love-memory 导出文件（format/version 不匹配）");
  }
  const entries = Object.entries(bundle.files || {});
  if (!entries.length) throw new Error("导出文件里没有记忆");

  const mem = path.resolve(workspace, "memory");
  for (const [rel, text] of entries) {
    if (typeof text !== 'string') throw new Error(`坏条目：${rel}`);
    const target = path.resolve(mem, rel);
    if (target === mem || !target.startsWith(mem + path.sep)) throw new Error(`非法路径：${rel}`);
    if (path.basename(target) === 'core-memory.json') validateCoreMemory(JSON.parse(text));
    if (path.basename(target) === 'reflection-queue.json') {
      const groupId = rel.match(/^groups[\\/]([1-9][0-9]{4,11})[\\/]reflection-queue\.json$/)?.[1] || '';
      validateReflectionQueue(JSON.parse(text), groupId);
    }
    if (path.basename(target) === 'reflection-worker.json') validateReflectionWorker(JSON.parse(text));
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(path.resolve(workspace), ".import-backups", stamp);
  if (fs.existsSync(mem)) fs.cpSync(mem, path.join(backupDir, "memory"), { recursive: true });

  let written = 0;
  for (const [rel, text] of entries) {
    if (typeof text !== "string") throw new Error(`坏条目：${rel}`);
    const target = path.resolve(mem, rel);
    if (target !== mem && !target.startsWith(mem + path.sep)) throw new Error(`非法路径：${rel}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, "utf8");
    written += 1;
  }
  return { files: written, backup: backupDir };
}
