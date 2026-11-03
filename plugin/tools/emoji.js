/** love_emoji tool; policy and implementation stay together. */
import { toolOutput } from "../runtime/messages.js";
import { workspaceOf } from "../runtime/config.js";
import { channelFaceMarkerStatus } from "../runtime/doctor.js";
import { handbook, faceCount, searchFaces, describeFace, annotateMarkers, findFace } from "../emoji.js";

export function createEmojiTool(cfg) {
  return {
    name: "love_emoji",
    description:
      "查 QQ 表情手册：把消息里的 `[QQ表情:id]` 解码成名称和 QQ 语境下的真实含义（如 微笑=礼貌/疏远、狗头=开玩笑）；也能按名字搜索、查看手册与 QQ 通道补丁状态。只在 love 工作区可用。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["decode", "search", "status"], default: "decode" },
        text: { type: "string", description: "要解码的文本，可含多个 [QQ表情:id]" },
        id: { type: "integer", description: "单个表情 id" },
        query: { type: "string", description: "search 用：名称或表情包名，如 微笑 / 汪汪" },
      },
    },
    output: toolOutput(),
    async execute(args, exec) {
      const ws = workspaceOf(exec, cfg);
      const action = String(args?.action || "decode");

      if (action === "status") {
        const channel = channelFaceMarkerStatus();
        const meta = handbook();
        const lines = [
          `手册：${faceCount()} 条 QQ 表情（更新 ${meta.updated || "未知"}）`,
          channel.patched
            ? `QQ 通道补丁：已应用（${channel.dir}）`
            : `QQ 通道补丁：未应用${channel.missing?.length ? `（缺 ${channel.missing.join("、")}）` : ""}${channel.error ? `（${channel.error}）` : ""}` +
              " — 跑 plugin/patches/patch-onebot-face-ids.mjs 后重启 DSH，表情 id 才会保留",
        ];
        return { ok: true, text: lines.join("\n") };
      }

      if (action === "search") {
        const query = String(args?.query || args?.text || "").trim();
        if (!query) throw new Error("love_emoji: search 需要 query");
        const hits = searchFaces(query);
        return {
          ok: true,
          text: hits.length ? hits.map(describeFace).join("\n") : `手册里没有匹配「${query}」的表情`,
        };
      }

      const ids = [];
      const source = String(args?.text || "");
      if (source.trim()) {
        for (const id of annotateMarkers(source).ids) if (!ids.includes(id)) ids.push(id);
      }
      if (args?.id !== undefined && String(args.id).trim() !== "" && !ids.includes(String(args.id).trim())) {
        ids.push(String(args.id).trim());
      }
      if (!ids.length) throw new Error("love_emoji: 没找到表情 id（text 里没有 [QQ表情:id]，也没给 id）");

      const lines = ids.map((id) => {
        const face = findFace(id);
        return face ? describeFace(face) : `${id} 未收录｜可能是新版 QQ 表情，按上下文理解`;
      });
      return { ok: true, text: lines.join("\n") };
    },
  };
}
