/** love_recall tool; policy and implementation stay together. */
import { toolOutput } from "../runtime/messages.js";
import { memoryScope } from "../runtime/memory-scope.js";
import { groupSessions } from "../runtime/host-state.js";
import { buildRecall } from "../runtime/recall.js";
import { effectiveConfig } from "../runtime/config.js";
import { memorySessionReadOnly } from "../runtime/memory-policy.js";

export function createRecallTool(cfg) {
  return {
    name: "love_recall",
    description:
      "读取当前范围记忆。带query统一检索当前核心、旧档案/学习、日记/小事/事件及可用长期库，排除归档及已迁移旧快照；返回ID、来源、命中方式，直接关联需结合原文判断，截断节选不可用来覆盖记忆。无query读近期概况。群只读当前群。无命中请换关键词或按ID查历史，不编造答案。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        days: { type: "integer", default: 7, description: "最近几天日记，默认 7" },
        query: {
          type: "string",
          description: "可选：检索核心和旧记忆，支持本地同义词、可选有界语义及直接关联；没有命中可换措辞",
        },
      },
    },
    output: toolOutput(),
    async execute(args, exec) {
      const { primary, sessionId, groupId, scopedWorkspace } = memoryScope(exec, cfg);
      const session = groupId ? { ...groupSessions.get(sessionId), groupId, workspace: scopedWorkspace } : null;
      return {
        ok: true,
        text: await buildRecall(
          primary,
          Math.max(1, Number(args?.days) || 7),
          { ...cfg, memoryReadOnlyRead: memorySessionReadOnly(effectiveConfig(cfg), sessionId) },
          args?.query,
          session,
        ),
      };
    },
  };
}
