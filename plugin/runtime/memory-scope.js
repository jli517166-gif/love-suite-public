/** runtime/memory-scope — extracted behavior; dependencies are explicit ESM imports. */
import { groupSessions } from "./host-state.js";
import { workspaceOf, groupWorkspaceFor, normalize, soulWorkspaces, readRuntimeConfig } from "./config.js";
import fs from "node:fs";
import path from "node:path";

export function memoryScope(exec, cfg) {
  const primary = workspaceOf(exec, cfg);
  const sessionId = String(exec?.agent?.session?.id || exec?.agent?.session?.header?.id || "");
  const scope = groupSessions.get(sessionId);
  const groupId = scope?.groupId || sessionId.match(/(?:^|-)group-(\d{5,12})(?:-|$)/)?.[1] || "";
  return {
    primary,
    sessionId,
    groupId,
    scopedWorkspace: scope?.workspace || (groupId ? groupWorkspaceFor(primary, groupId) : primary),
  };
}

export function reflectionScopes(cfg) {
  const scopes = [],
    seen = new Set();
  const mapped = readRuntimeConfig().groupWorkspaces || {};
  for (const primary of soulWorkspaces(cfg)) {
    const append = (workspace, groupId = "") => {
      const key = normalize(workspace) + ":" + groupId;
      if (!seen.has(key)) {
        seen.add(key);
        scopes.push({ primary, workspace, groupId });
      }
    };
    append(primary);
    if (cfg.groupMemoryEnabled === false) continue;
    const dir = path.join(primary, "memory", "groups");
    const ids = new Set([...Object.keys(mapped), ...(fs.existsSync(dir) ? fs.readdirSync(dir) : [])]);
    for (const groupId of ids)
      if (/^[1-9][0-9]{4,11}$/.test(groupId)) append(groupWorkspaceFor(primary, groupId), groupId);
  }
  return scopes;
}
