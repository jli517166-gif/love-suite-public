/** Administrator-configured plugin policy; conversation text and tool arguments cannot authorize writes. */
export function memorySessionReadOnly(config, sessionId = "") {
  return (
    config.memoryReadOnly === true ||
    (Array.isArray(config.memoryReadOnlySessionIds) && config.memoryReadOnlySessionIds.includes(sessionId))
  );
}
const reads = {
  love_core_memory: ["read", "legacy", "review", "proposals", "preview"],
  love_reflection: ["status", "list", "read"],
  love_group: ["status", "member"],
  love_learn: ["list", "search"],
  love_life: ["recent"],
  love_sticker: ["list", "search"],
  love_template: ["list"],
  love_proactive: ["status"],
  love_mood: ["get"],
};
export function assertMemoryToolAccess(config, exec, name, args) {
  const session = exec?.agent?.session;
  if (!memorySessionReadOnly(config, String(session?.id || session?.header?.id || ""))) return;
  if (["love_recall", "love_emoji"].includes(name)) return;
  const actions = reads[name];
  if (actions?.includes(args?.action || actions[0])) return;
  throw Object.assign(
    new Error("此会话的插件记忆为只读；不能写入、领取、补读确认或管理整理队列。请由用户在插件配置中解除限制。"),
    { code: "LOVE_MEMORY_READ_ONLY" },
  );
}
