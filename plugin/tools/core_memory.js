/** love_core_memory tool; policy and implementation stay together. */
import { memoryOperationsSchema } from "../memory-contract.js";
import { toolOutput } from "../runtime/messages.js";
import { memoryScope } from "../runtime/memory-scope.js";
import { effectiveConfig } from "../runtime/config.js";
import { readMaintenanceProposals } from "../maintenance-proposals.js";
import { liveMemoryMaterials, validateMemoryOperationSources } from "../reflection.js";
import { readCoreMemory, memoryLineage, commitCoreMemory, currentMemorySources } from "../core-memory.js";
import { reviewMemoryCandidates } from "../memory-review.js";
import { rankByQuery } from "../retrieval.js";
import { buildGroupGraph, buildGraph } from "../graph.js";
import { readJson, lovePaths } from "../runtime/storage.js";
import { auxiliaryLegacyNodes, legacyCandidates } from "../legacy-memory.js";
import { readLearning } from "../runtime/learning.js";

export function createCoreMemoryTool(cfg) {
  return {
    name: "love_core_memory",
    description:
      "自主核心记忆：你决定名称、含义和归属。read看版本/原文，proposals查看后台未执行整理建议（需核对原文并按当前版本重新preview），review分页列有界字面相关/旧迁移/核心整理候选（不判真假，requiresRead需补读），legacy看旧原文。preview用expectedRevision/operations完整校验且不保存；commit携相同operations及previewDigest可核对方案一致性。合并核心时先update_memory移动全部有效子记忆，再archive空分支，self不可归档。重复确认attach_source；明确修正supersede_memory保留原文和来源，read id追溯。adopt_legacy迁移原文，release_legacy撤回未被取代迁移。新增ref必须$开头且同批唯一。仅当前工作区/群。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: {
          type: "string",
          enum: ["read", "legacy", "review", "proposals", "preview", "commit"],
          default: "read",
        },
        query: { type: "string" },
        id: { type: "string" },
        offset: { type: "integer", minimum: 0, description: "read 分页起点，每页最多 40 条" },
        expectedRevision: { type: "integer", minimum: 0 },
        previewDigest: {
          type: "string",
          description:
            "preview返回的方案摘要；commit携带时检查expectedRevision和operations与预览完全一致，不是授权凭证",
        },
        operations: memoryOperationsSchema(),
      },
    },
    output: toolOutput(),
    async execute(args, exec) {
      const { sessionId, groupId, scopedWorkspace } = memoryScope(exec, cfg);
      if (groupId && effectiveConfig(cfg).groupMemoryEnabled === false)
        throw new Error("群记忆已关闭，不读取或整理当前群记忆");
      if (args?.action === "proposals")
        return { ok: true, text: JSON.stringify(readMaintenanceProposals(scopedWorkspace, groupId, args)) };
      const session = exec?.agent?.session;
      const materials = liveMemoryMaterials(session);
      const legacyGraph = async () => {
        if (groupId) return buildGroupGraph(scopedWorkspace, groupId, { legacyOnly: true });
        const graph = await buildGraph(scopedWorkspace, { legacyOnly: true });
        const profile = readJson(lovePaths(scopedWorkspace).profile, {});
        return {
          ...graph,
          nodes: [...graph.nodes, ...auxiliaryLegacyNodes(profile, readLearning(scopedWorkspace, { raw: true }).items)],
        };
      };
      if (args?.action === "commit" || args?.action === "preview") {
        if (typeof session?.snapshotEvents === "function")
          validateMemoryOperationSources(
            { complete: true, materials },
            (args.operations || []).filter((operation) => !["adopt_legacy", "release_legacy"].includes(operation.op)),
          );
        const candidates = args.operations?.some((item) => ["adopt_legacy", "release_legacy"].includes(item.op))
          ? legacyCandidates(await legacyGraph(), { memories: [] }).candidates
          : [];
        return {
          ok: true,
          text: JSON.stringify(
            commitCoreMemory(scopedWorkspace, args, {
              groupId,
              sessionId,
              legacyCandidates: candidates,
              dryRun: args.action === "preview",
            }),
          ),
        };
      }
      const store = readCoreMemory(scopedWorkspace, groupId);
      if (args?.action === "review")
        return { ok: true, text: JSON.stringify(reviewMemoryCandidates(store, await legacyGraph(), args)) };
      if (args?.action === "legacy") {
        const preview = legacyCandidates(await legacyGraph(), store);
        const matches = args.query
          ? rankByQuery(
              preview.candidates,
              args.query,
              (item) => [item.label, item.content, ...item.keywords].join(" "),
              preview.candidates.length,
            )
          : preview.candidates;
        const offset = Number.isSafeInteger(args.offset) && args.offset >= 0 ? args.offset : 0;
        const candidates = matches.slice(offset, offset + 40);
        return {
          ok: true,
          text: JSON.stringify({
            revision: store.revision,
            candidates,
            nextOffset: offset + candidates.length < matches.length ? offset + candidates.length : null,
            totalCandidates: preview.candidates.length,
            matchedCandidates: matches.length,
            excluded: preview.excluded.slice(0, 40),
            excludedCount: preview.excluded.length,
            coverage: groupId
              ? "当前群共享笔记；不含群友结构节点"
              : "记忆网事件、meow 有效记录、日记及归档、全部小生活、自我正文、profile档案和learning学习项；不受星图显示条数限制，不含实体结构节点。slot表示旧入口位置，迁移后用核心工具修正，原文件只保留历史。",
          }),
        };
      }
      const active = store.memories.filter((item) => item.status === "active");
      const matches = args?.id
        ? store.memories.filter((item) => item.id === args.id)
        : args?.query
          ? rankByQuery(active, args.query, (item) => item.content, active.length)
          : [...active].reverse();
      const offset = Number.isSafeInteger(args?.offset) && args.offset >= 0 ? args.offset : 0;
      const memories = matches
        .slice(offset, offset + 40)
        .map((memory) => ({ ...memory, currentSources: currentMemorySources(memory) }));
      const nextOffset = offset + memories.length < matches.length ? offset + memories.length : null;
      return {
        ok: true,
        text: JSON.stringify({
          revision: store.revision,
          rootId: store.rootId,
          cores: store.cores,
          memories,
          links: store.links,
          totalMemories: active.length,
          matchedMemories: matches.length,
          nextOffset,
          truncated: nextOffset !== null,
          sourceHints: materials
            .filter((material) => material.role === "user")
            .slice(-8)
            .map(({ reference, role, text }) => ({ reference, role, excerpt: text.slice(0, 160) })),
          ...(args?.id ? { history: memoryLineage(store, args.id) } : {}),
        }),
      };
    },
  };
}
