/** User-facing queue diagnostics. No source content or provisional notes are returned. */
import { segmentPlan, segmentProgressSummary } from "./reflection-segments.js";
export function reflectionDiagnosis(job) {
  const committed = job.coreCommitted ?? (job.outcome ? job.status === "done" : null);
  const result = (code, reason, recoveryAction, recovery, eligible = false, progress = null) => ({
    code,
    reason,
    recoveryAction,
    recovery,
    eligible,
    committed,
    progress,
  });
  if (job.outcome) return result(job.status, "本批已有处理回执", "none", "查看处理结果及来源，无需重复提交。");
  const archive = job.materialArchive;
  if (!job.complete && !archive)
    return result(
      "missing_snapshot",
      "旧批次缺少完整文字快照",
      "provide_text",
      "在原会话重新提供完整文字；确认新材料已接收后，再说明理由跳过旧批次。",
    );
  if (archive && !archive.complete)
    return result(
      "incomplete_material",
      "附件或文字材料不完整，不能据此生成完整记忆",
      "provide_text",
      "补充可核对的图片说明、语音转录或完整文字；确认新材料已接收后，可说明理由跳过旧批次。等待预算不会补全附件。",
    );
  const progress = segmentProgressSummary(job.segmentation, archive);
  if (progress?.blocked)
    return result(
      "segment_blocked",
      job.lastError || "分段内容无法安全压缩",
      "review_material",
      "已确认的阅读进度仍在，但不能自动提交。查看全文并人工补读；或重新提供保留条件、更正和主体的完整精简材料。",
      false,
      progress,
    );
  if (!job.complete && !segmentPlan(archive))
    return result(
      "archive_limit",
      "完整文字超过自动处理的40000字节或8段上限",
      "provide_text",
      "查看原材料，在原会话提供保留条件、否定和更正的完整精简文字。不能把多个片段当作已自动合并的全文。",
    );
  if (job.status === "failed")
    return result(
      "failed",
      job.lastError || "整理失败",
      "inspect_error",
      "核对失败原因后填写理由重试；重试不清空后台预算。也可说明理由跳过。",
      false,
      progress,
    );
  if (job.status === "leased")
    return result(
      "leased",
      "本批正在被领取处理",
      "wait",
      "等待本次完成或租约到期，不要抢占正在处理的批次。",
      false,
      progress,
    );
  if (progress)
    return result(
      progress.phase === "synthesis" ? "synthesis" : "reading",
      `已读${progress.completed}/${progress.total}段，等待${progress.phase === "synthesis" ? "最终合成" : "后续阅读"}`,
      "wait",
      "后台按共享预算继续；阅读笔记不等于核心记忆已提交。",
      true,
      progress,
    );
  return result(
    "pending",
    job.lastError || "等待整理",
    "wait",
    "后台按冷却和共享预算处理；若长期无变化，核对模型连接及原会话路由。",
    true,
  );
}
export function withWorkerWait(diagnosis, worker) {
  if (!diagnosis?.eligible || !worker) return diagnosis;
  if (worker.phase === "read_only")
    return {
      ...diagnosis,
      code: "read_only",
      reason: "此会话的插件记忆为只读",
      recoveryAction: "configure",
      recovery: "仅用户可在插件配置中解除只读限制；聊天正文和工具参数不能解除。",
    };
  if (worker.enabled === false)
    return {
      ...diagnosis,
      code: "paused",
      reason: worker.reason || "后台整理未开启",
      recoveryAction: "configure",
      recovery: "检查插件后台开关及只读配置，保留材料后再恢复。",
    };
  if (["daily_limit", "cooldown"].includes(worker.phase))
    return {
      ...diagnosis,
      code: worker.phase,
      reason:
        worker.phase === "daily_limit"
          ? `后台今日已用${worker.dailyCalls}/${worker.maxCallsPerDay}次（UTC日），材料仍保留`
          : "等待后台整理冷却",
      recoveryAction: "wait_budget",
      recovery: "保持DSH运行并等待下次可用时间；重启不会清空预算。此限额只统计后台调用，前台工具整理另计。",
      resumeAt: worker.resumeAt,
    };
  return diagnosis;
}
