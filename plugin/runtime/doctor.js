/** runtime/doctor — extracted behavior; dependencies are explicit ESM imports. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createChannel } from "../channels/qq.js";
import { outboxStats } from "../outbox.js";
import { lovePaths, readJson, defaults } from "./storage.js";
import { readLearning } from "./learning.js";
import { recentActivities } from "./activity.js";
import { readStickers } from "./stickers.js";
import { readProactive, readPulse } from "./pulse-store.js";
import { effectiveConfig } from "./config.js";

export function channelFaceMarkerStatus() {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve("dsh-onebot-qq/package.json");
    const dir = path.join(path.dirname(pkg), "lib");
    const files = ["cq.js", "inbound.js"];
    const missing = files.filter((name) => {
      try {
        return !fs.readFileSync(path.join(dir, name), "utf8").includes("[QQ表情:");
      } catch {
        return false;
      }
    });
    return { patched: missing.length === 0, dir, missing };
  } catch (err) {
    return { patched: false, dir: "", missing: [], error: String(err?.message ?? err) };
  }
}

export function pluginVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return pkg.version || "?";
  } catch {
    return "?";
  }
}

export const onOff = (value) => (value === false ? "关" : "开");

export async function doctorReport(workspace, cfg) {
  const eff = effectiveConfig(cfg);
  const p = lovePaths(workspace);
  const lines = [`dsh-memory-network ${pluginVersion()}`, `工作区：${workspace}`];

  const files = {
    档案: readJson(p.profile, null),
    关系: readJson(p.relationship, null),
    心情: readJson(p.mood, null),
    状态: readJson(p.state, null),
    心跳: readJson(p.pulse, null),
  };
  const missing = Object.entries(files)
    .filter(([, data]) => !data)
    .map(([label]) => label);
  lines.push(missing.length ? `⚠️ 记忆文件缺：${missing.join("、")}（会按默认值重建）` : "✅ 记忆文件齐全");

  const rel = files.关系 || defaults(workspace).relationship;
  lines.push(`关系：${rel.stage}｜好感 ${rel.affection}｜信任 ${rel.trust}`);
  const mood = files.心情 || {};
  lines.push(`心情：${mood.emotion || "平静"}（${Number(mood.intensity ?? 0.3).toFixed(2)}）`);
  const pulse = files.心跳 || readPulse(workspace);
  const needs = pulse.needs || {};
  lines.push(
    `心跳：${pulse.activity?.label || "未知"}｜依恋 ${Number(needs.attachment ?? 0).toFixed(2)}｜精力 ${Number(needs.energy ?? 0).toFixed(2)}`,
  );

  const box = outboxStats(workspace);
  lines.push(`发件箱：${box.fresh} 条待补发（共 ${box.total}）`);

  let selfOk = false;
  try {
    selfOk = fs.readFileSync(lovePaths(workspace).self, "utf8").trim().length > 0;
  } catch {}
  lines.push(
    `${selfOk ? "✅" : "⚠️"} 自我叙事：${selfOk ? "已建立（self.md）" : "还没建立（下次 recall 会自动生成）"}`,
  );
  {
    const journalDir = lovePaths(workspace).journal;
    const count = (dir) => {
      try {
        return fs.readdirSync(dir).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).length;
      } catch {
        return 0;
      }
    };
    const archived = count(path.join(journalDir, "archive"));
    lines.push(`日记：${count(journalDir)} 篇${archived ? `｜归档 ${archived} 篇` : ""}`);
  }
  const activities = recentActivities(workspace, 1);
  const activityLabels = [...new Set(activities.map((item) => item.label))].slice(-3);
  lines.push(
    `活动历史：今天 ${activities.length} 条${activityLabels.length ? `（${activityLabels.join("、")}）` : ""}`,
  );
  lines.push(`表情包图库：${readStickers(workspace).items.length} 张`);
  const learned = readLearning(workspace).items;
  lines.push(
    `学会的事：${learned.length} 件${
      learned.length
        ? `（最近：${learned
            .slice(-2)
            .map((item) => item.name)
            .join("、")}）`
        : ""
    }`,
  );
  let persona = "whale";
  try {
    const raw = fs.readFileSync(path.join(workspace, "persona.txt"), "utf8").trim().toLowerCase();
    if (raw) persona = raw;
  } catch {}
  lines.push(`人格：${persona}（只影响说话方式；记忆、工具、学会的事都不随人格变）`);

  const channel = createChannel(eff, { agents: undefined });
  let online = false;
  try {
    online = await channel.available();
  } catch {}
  lines.push(`${online ? "✅" : "⚠️"} 通道：${channel.describe()}（${online ? "在线" : "不可用，意图会进发件箱"}）`);

  const patch = channelFaceMarkerStatus();
  lines.push(
    `${patch.patched ? "✅" : "❌"} QQ 表情补丁：${patch.patched ? "已应用" : "未应用（表情识别会失效，跑 patches/patch-onebot-face-ids.mjs）"}`,
  );

  const schedule = readProactive(workspace);
  lines.push(
    `主动：${eff.proactiveEnabled ? "开" : "关"}｜上次 ${schedule.last_sent || "无"}｜下次可发 ${schedule.next_after || "未定"}`,
  );
  lines.push(
    `开关：表情注解 ${onOff(eff.emojiEnabled)}｜心情注入 ${onOff(eff.moodInjection)}｜自动好感 ${onOff(eff.autoAppraisal)}｜模板直发 ${onOff(eff.composeEnabled)}`,
  );
  return lines.join("\n");
}
