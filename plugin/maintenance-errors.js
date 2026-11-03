/** Stable diagnostics: never expose model text, filesystem messages or nested causes. */
const definitions = Object.freeze({
  MAINTENANCE_INVALID_JOB: ["input", "维护批次无效", false],
  MAINTENANCE_INVALID_PROPOSAL: ["input", "维护建议结构无效；按允许操作重写建议", false],
  MAINTENANCE_INCOMPLETE_CONTEXT: ["context", "维护上下文不完整；缩小范围并重新读取完整资料", true],
  MAINTENANCE_CONTEXT_CHANGED: ["context", "维护目标已变化；重新读取当前核心、全部子记忆和依据", true],
  MAINTENANCE_FORBIDDEN_OPERATION: ["policy", "维护仅允许归属、核心摘要及已有项关联字段", false],
  MAINTENANCE_UNREAD_TARGET: ["policy", "维护目标没有完整读取，或不允许操作自我；重新核对目标", false],
  MAINTENANCE_PREVIEW_REJECTED: ["preview", "核心预演未通过；核对归属、依据和空核心约束后重新预演", true],
  MAINTENANCE_STORAGE_INVALID: ["storage", "维护建议文件无效，未自动重置；检查备份并修复文件", false],
  MAINTENANCE_STORAGE_FAILED: ["storage", "维护建议文件读写失败；检查目录访问权限与磁盘后重新读取", true],
  MAINTENANCE_INTERNAL: ["internal", "维护建议内部错误；查看脱敏诊断，正常提炼结果保留", false],
});
export function maintenanceError(code, cause) {
  const known = definitions[code] ? code : "MAINTENANCE_INTERNAL";
  return Object.assign(new Error(definitions[known][1], cause ? { cause } : undefined), { code: known });
}
export function maintenanceFailure(error) {
  const code = Object.hasOwn(definitions, error?.code) ? error.code : "MAINTENANCE_INTERNAL";
  const [stage, reason, retryable] = definitions[code];
  return { status: "rejected", code, stage, reason, retryable };
}
