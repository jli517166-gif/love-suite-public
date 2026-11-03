/** love_reflection tool; policy and implementation stay together. */
import { memoryOperationsSchema } from "../memory-contract.js";
import { toolOutput } from "../runtime/messages.js";
import { memoryScope } from "../runtime/memory-scope.js";
import {
  claimReflectionReview,
  claimReflection,
  listReflections,
  reflectionDetail,
  readReflection,
  readReflectionMaterial,
  retryReflection,
  completeReflection,
  failReflection,
  skipReflection,
  reflectionStatus,
} from "../reflection.js";

export function createReflectionTool(cfg) {
  return {
    name: "love_reflection",
    description:
      "整理真实对话材料：status看数量与队列版本；list按status分页（active/all/具体状态）；read按jobId看节选与原因。next不带jobId领取完整短批次，next带jobId领取待补读文字，均有5分钟租约。material从offset=0携带jobId/leaseToken顺序读所有页，将text拼接为JSON，最后页readToken供complete。缺附件/缺失旧全文不可提交。complete需jobId、leaseToken、核心expectedRevision、operations和reason；补读还需readToken。retry附理由重开失败/等待批次，保留后台预算，每批最多手动3次；skip附理由跳过，进行中需租约。先读核心版本，source必须来自本批真实材料。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: {
          type: "string",
          enum: ["status", "list", "next", "read", "material", "retry", "complete", "fail", "skip"],
          default: "status",
        },
        offset: { type: "integer", minimum: 0 },
        status: {
          type: "string",
          enum: ["active", "all", "pending", "leased", "failed", "needs_review", "done", "skipped"],
        },
        readToken: { type: "string" },
        jobId: { type: "string" },
        leaseToken: { type: "string" },
        reason: { type: "string" },
        expectedRevision: {
          type: "integer",
          minimum: 0,
          description: "complete为核心版本；retry/skip为队列版本，可先status读取",
        },
        operations: memoryOperationsSchema(0, 20),
      },
    },
    output: toolOutput(),
    async execute(args, exec) {
      const { scopedWorkspace, groupId } = memoryScope(exec, cfg);
      const action = args?.action || "status";
      let result;
      if (action === "next")
        result = args.jobId
          ? claimReflectionReview(scopedWorkspace, args, { groupId })
          : claimReflection(scopedWorkspace, groupId);
      else if (action === "list")
        result = listReflections(scopedWorkspace, groupId, args.offset, { status: args.status });
      else if (action === "read") result = reflectionDetail(readReflection(scopedWorkspace, groupId, args.jobId));
      else if (action === "material") result = readReflectionMaterial(scopedWorkspace, args, { groupId, track: true });
      else if (action === "retry") result = retryReflection(scopedWorkspace, args, { groupId });
      else if (action === "complete") result = completeReflection(scopedWorkspace, args, { groupId });
      else if (action === "fail") result = failReflection(scopedWorkspace, args, { groupId });
      else if (action === "skip") result = skipReflection(scopedWorkspace, args, { groupId });
      else result = reflectionStatus(scopedWorkspace, groupId);
      return { ok: true, text: JSON.stringify(result) };
    },
  };
}
