/** love_group tool; policy and implementation stay together. */
import { toolOutput } from "../runtime/messages.js";
import { workspaceOf, groupWorkspaceFor } from "../runtime/config.js";
import { memoryScope } from "../runtime/memory-scope.js";
import { groupSummary, readGroup, addGroupNote, readGroupMember } from "../groups.js";

export function createGroupTool(cfg) {
  return {
    name: "love_group",
    description:
      "群记忆：status 看群摘要，note 记一条群共享记忆，member 看某个群友的好感/消息数。只在 love 工作区可用。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        groupId: { type: "string", description: "QQ 群号" },
        action: { type: "string", enum: ["status", "note", "member"], default: "status" },
        text: { type: "string", description: "action=note 时的内容" },
        qq: { type: "string", description: "action=member 时的群友 QQ" },
      },
      required: ["groupId"],
    },
    output: toolOutput(),
    async execute(args, exec) {
      const ws = workspaceOf(exec, cfg);
      const groupId = String(args?.groupId || "").trim();
      const current = memoryScope(exec, cfg);
      if (current.groupId && current.groupId !== groupId) throw new Error("群会话只能访问当前群记忆");
      const groupWs = groupWorkspaceFor(ws, groupId);
      const action = String(args?.action || "status");
      if (action === "note") {
        const text = String(args?.text || "").trim();
        if (!text) throw new Error("note 需要 text");
        addGroupNote(groupWs, groupId, text);
        return { ok: true, text: `已记到群 ${groupId}：${text}` };
      }
      if (action === "member") {
        const member = readGroupMember(groupWs, groupId, args?.qq);
        if (!member) throw new Error("没有这个群友");
        return {
          ok: true,
          text: `${member.nickname || member.id}（${member.id}）｜消息 ${member.messages || 0}｜好感 ${member.affection ?? 5}｜信任 ${member.trust ?? 5}\n备注：${(member.notes || []).join("；") || "无"}`,
        };
      }
      const summary = groupSummary(groupWs, groupId);
      const group = readGroup(groupWs, groupId);
      const lines = [`群 ${groupId}｜${summary.members} 人｜${summary.notes} 条共享记忆`];
      const notes = Array.isArray(group.notes) ? group.notes.slice(-5) : [];
      if (notes.length) {
        lines.push("最近共享：");
        for (const item of notes) lines.push(`- ${String(item.text || "").slice(0, 80)}`);
      }
      return { ok: true, text: lines.join("\n") };
    },
  };
}
