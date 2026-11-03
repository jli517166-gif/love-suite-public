/** love_record tool; policy and implementation stay together. */
import { toolOutput } from "../runtime/messages.js";
import { workspaceOf } from "../runtime/config.js";
import { lovePaths, readJson, defaults, writeJson, localIso } from "../runtime/storage.js";
import { appendJournal } from "../runtime/journal.js";
import {
  recomputeMood,
  FACT_ALIASES,
  PROFILE_ARRAYS,
  PROFILE_SCALARS,
  applyFact,
  applyFeeling,
} from "../runtime/mood.js";
import { assertLegacyWriteAllowed } from "../legacy-memory.js";
import { readCoreMemory } from "../core-memory.js";

export function createRecordTool(cfg) {
  return {
    name: "love_record",
    description:
      "兼容旧版 love 记录：note、fact、feeling、milestone。已迁移的档案字段禁止再写旧文件，请用 love_core_memory 自主决定内容与归属；明确修正用 supersede_memory，旧入口未迁移项可先 legacy/adopt_legacy。只在 love 工作区可用。",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: {
        kind: { type: "string", enum: ["note", "fact", "feeling", "milestone"] },
        text: { type: "string", description: "note/milestone 内容" },
        key: { type: "string", description: "fact 的键，如 likes" },
        value: { type: "string", description: "fact 的值" },
        append: { type: "boolean", default: false, description: "fact 是否追加到数组" },
        delta: { type: "integer", description: "feeling 好感变化，-5~2" },
        reason: { type: "string", description: "feeling 原因" },
      },
    },
    output: toolOutput(),
    async execute(args, exec) {
      const ws = workspaceOf(exec, cfg);
      const p = lovePaths(ws);
      const kind = String(args?.kind || "");
      if (kind === "note") {
        const text = String(args?.text || "").trim();
        if (!text) throw new Error("love_record: note 文本为空");
        const line = appendJournal(ws, text, "日常");
        recomputeMood(ws, true);
        return { ok: true, text: `已记：${line.slice(2)}` };
      }
      if (kind === "fact") {
        const key = String(args?.key || "").trim();
        const value = String(args?.value || "").trim();
        if (!key || !value) throw new Error("love_record: fact 需要 key 和 value");
        const profile = readJson(p.profile, defaults(ws).profile);
        const field = FACT_ALIASES[key] || key;
        assertLegacyWriteAllowed(readCoreMemory(ws), {
          type: "profile",
          field: PROFILE_ARRAYS.has(field) || PROFILE_SCALARS.has(field) ? field : "facts",
          ...(!PROFILE_ARRAYS.has(field) && !PROFILE_SCALARS.has(field) ? { key: field } : {}),
        });
        const written = applyFact(profile, key, value);
        writeJson(p.profile, profile);
        return { ok: true, text: `已记：${written.field} = ${written.value}` };
      }
      if (kind === "feeling") {
        const applied = applyFeeling(ws, Math.trunc(Number(args?.delta) || 0), args?.reason);
        if (!applied.delta) return { ok: true, text: "今天好感已经涨够 2 点了" };
        return {
          ok: true,
          text: `好感 ${applied.delta >= 0 ? "+" : ""}${applied.delta} -> ${applied.relationship.affection}（${applied.relationship.stage}）`,
        };
      }
      if (kind === "milestone") {
        const text = String(args?.text || "").trim();
        if (!text) throw new Error("love_record: milestone 文本为空");
        const rel = readJson(p.relationship, defaults(ws).relationship);
        rel.milestones = (rel.milestones || []).slice(-39).concat({ date: localIso().slice(0, 10), text });
        writeJson(p.relationship, rel);
        recomputeMood(ws, true);
        return { ok: true, text: `里程碑：${text}` };
      }
      throw new Error("love_record: 未知 kind");
    },
  };
}
