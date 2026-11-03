/** runtime/recall — extracted behavior; dependencies are explicit ESM imports. */
import { rankByQuery } from "../retrieval.js";
import { searchMemories, formatMemorySearch } from "../memory-search.js";
import { readGroup, readGroupMember } from "../groups.js";
import { readCoreMemory } from "../core-memory.js";
import { legacyReference } from "../legacy-memory.js";
import { lovePaths, readJson, defaults } from "./storage.js";
import { readLearning, readCurrentProfile, recentSkills } from "./learning.js";
import { selfExcerpt } from "./self.js";
import { recentActivities } from "./activity.js";
import { readRuntimeConfig, effectiveConfig, groupWorkspaceFor } from "./config.js";
import { moodLine, recomputeMood, loadMood } from "./mood.js";
import { journalEntries, recentLife, netEpisodes } from "./journal.js";
import { takeVoiceCue } from "./proactive.js";

export async function buildRecall(workspace, days, rawCfg, query = "", session = null) {
  if (session?.groupId)
    return buildGroupRecall(session.workspace || groupWorkspaceFor(workspace, session.groupId), session, rawCfg, query);
  const keyword = String(query || "").trim();
  const p = lovePaths(workspace);
  const profile = readCurrentProfile(workspace);
  const rel = readJson(p.relationship, defaults(workspace).relationship);
  const state = readJson(p.state, defaults(workspace).state);
  const mood = rawCfg?.memoryReadOnlyRead ? loadMood(workspace) : recomputeMood(workspace);
  const lines = [];
  lines.push(`称呼：${profile.nickname || profile.name || "未记录"}`);
  if (keyword) {
    const result = await searchMemories(workspace, keyword, { semanticEnabled: rawCfg?.semanticEnabled !== false });
    lines.push(
      formatMemorySearch(result, keyword),
      `关系：${rel.stage || "初识"}｜好感 ${rel.affection ?? 5}｜信任 ${rel.trust ?? 5}`,
      moodLine(mood),
    );
    return lines.join("\n");
  }
  const authored = readCoreMemory(session?.workspace || workspace, session?.groupId || "");
  const boundLegacy = new Set(
    authored.memories.filter((item) => item.legacy && !item.legacy.released).map((item) => item.legacy.id),
  );
  const isBoundLegacy = (layer, content) => boundLegacy.has(legacyReference(layer, content));
  const isPrivateBound = (layer, content) => !session?.groupId && isBoundLegacy(layer, content);
  const owned = authored.memories.filter((item) => item.status === "active");
  const recalled = owned.slice(-6);
  if (recalled.length) {
    lines.push("我整理的核心记忆：");
    for (const item of recalled) {
      const core = authored.cores.find((entry) => entry.id === item.coreId);
      lines.push(
        `- [${core?.title || "自我"} / ${item.epistemic}] ${item.content.slice(0, 300)}（来源：${item.source.reference}）`,
      );
    }
  }
  if (profile.birthday) lines.push(`生日：${profile.birthday}`);
  for (const key of ["likes", "dislikes", "boundaries"]) {
    if (Array.isArray(profile[key]) && profile[key].length) lines.push(`${key}：${profile[key].join("、")}`);
  }
  const facts = profile.facts && typeof profile.facts === "object" ? Object.entries(profile.facts).slice(-8) : [];
  if (facts.length) {
    lines.push("记得的事：");
    for (const [k, v] of facts) lines.push(`- ${k}：${v}`);
  }
  lines.push(`关系：${rel.stage || "初识"}｜好感 ${rel.affection ?? 5}｜信任 ${rel.trust ?? 5}`);
  lines.push(moodLine(mood));
  const journalAll = journalEntries(workspace, days).filter(
    (item) => !isPrivateBound("journal", `${item.date} ${item.text}`),
  );
  const journal = journalAll.slice(-6);
  if (journal.length) {
    lines.push(keyword ? `检索「${keyword}」相关的日记：` : "最近：");
    for (const e of journal) lines.push(`- ${e.date} ${e.text}`);
  }
  const lifeAll = recentLife(workspace).filter(
    (item) => !isPrivateBound("life", `${item.date || ""} ${item.text || ""}`),
  );
  const life = lifeAll.slice(-4);
  if (life.length) {
    lines.push(keyword ? "相关的小事：" : "最近的小事：");
    for (const e of life) lines.push(`- ${String(e.date || "").slice(0, 16)} ${e.text}`);
  }
  const episodeAll = netEpisodes(workspace).filter(
    (item) => !isPrivateBound("episode", `${item.date || ""} ${item.text || ""}`.trim()),
  );
  const episodes = episodeAll.slice(-4);
  if (episodes.length) {
    lines.push("相关事件：");
    for (const e of episodes) lines.push(`- ${e.date || ""} ${String(e.text).slice(0, 80)}`);
  }
  if (session?.groupId) {
    try {
      const groupWs = session.workspace || workspace;
      const group = readGroup(groupWs, session.groupId);
      const members = group.members || {};
      lines.push(
        `群聊：${session.groupId}｜${Object.keys(members).length} 人｜共享 ${Array.isArray(group.notes) ? group.notes.length : 0} 条`,
      );
      if (session.qq) {
        const me = readGroupMember(groupWs, session.groupId, session.qq);
        if (me) {
          lines.push(
            `当前发言人：${me.nickname || session.qq}｜消息 ${me.messages || 0}｜好感 ${me.affection ?? 5}｜信任 ${me.trust ?? 5}`,
          );
        }
      }
      const notes = Array.isArray(group.notes)
        ? group.notes.filter((item) => !isBoundLegacy("groupNote", String(item.text || ""))).slice(-6)
        : [];
      if (notes.length) {
        lines.push("群共享记忆：");
        for (const item of notes) lines.push(`- ${String(item.text || "").slice(0, 100)}`);
      }
    } catch {}
  }
  lines.push(`上次见面：${state.last_seen || "第一次"}`);
  const self = selfExcerpt(workspace, 4001, rawCfg?.memoryReadOnlyRead);
  if (self && !isPrivateBound("soul", self)) lines.push(`我的自我：${self.slice(0, 400)}`);
  const activities = recentActivities(workspace, 1);
  if (activities.length) {
    const labels = [...new Set(activities.map((a) => a.label))].slice(-5);
    lines.push(`今天做过：${labels.join("、")}`);
  }
  const allSkills = readLearning(workspace).items;
  const skills = keyword
    ? rankByQuery(allSkills, keyword, (item) => `${item.name} ${item.note || ""}`, 5)
    : recentSkills(workspace, 5);
  if (skills.length) {
    lines.push(`会的事：${skills.map((item) => item.name).join("、")}`);
  }
  if (!rawCfg?.memoryReadOnlyRead && takeVoiceCue(workspace, effectiveConfig(rawCfg || readRuntimeConfig()))) {
    lines.push("语音提示：这次可以发一条语音（最多一条；不要解释这条提示，必要时先加载 qq-voice）。");
  }
  return lines.join("\n");
}

export async function buildGroupRecall(workspace, session, cfg, query = "") {
  if (effectiveConfig(cfg || {}).groupMemoryEnabled === false) return "群记忆已关闭，不读取私聊或其他群的记忆。";
  const group = readGroup(workspace, session.groupId);
  const authored = readCoreMemory(workspace, session.groupId);
  const bound = new Set(
    authored.memories.filter((item) => item.legacy && !item.legacy.released).map((item) => item.legacy.id),
  );
  const active = authored.memories.filter((item) => item.status === "active");
  const memories = query ? rankByQuery(active, query, (item) => item.content, 6) : active.slice(-6);
  const lines = [
    `群聊：${session.groupId}｜${Object.keys(group.members || {}).length} 人｜共享 ${(group.notes || []).length} 条`,
  ];
  if (String(query).trim()) {
    const result = await searchMemories(workspace, query, {
      groupId: session.groupId,
      semanticEnabled: cfg?.semanticEnabled !== false,
    });
    const member = session.qq ? readGroupMember(workspace, session.groupId, session.qq) : null;
    if (member)
      lines.push(
        `当前发言人：${member.nickname || session.qq}｜消息 ${member.messages || 0}｜好感 ${member.affection ?? 5}｜信任 ${member.trust ?? 5}`,
      );
    return [...lines, formatMemorySearch(result, query)].join("\n");
  }
  for (const item of memories) {
    const core = authored.cores.find((core) => core.id === item.coreId);
    lines.push(
      `- [${core?.title || "自我"} / ${item.epistemic}] ${item.content.slice(0, 300)}（来源：${item.source.reference}）`,
    );
  }
  const member = session.qq ? readGroupMember(workspace, session.groupId, session.qq) : null;
  if (member)
    lines.push(
      `当前发言人：${member.nickname || session.qq}｜消息 ${member.messages || 0}｜好感 ${member.affection ?? 5}｜信任 ${member.trust ?? 5}`,
    );
  const notes = (group.notes || []).filter((item) => !bound.has(legacyReference("groupNote", String(item.text || ""))));
  const selected = query ? rankByQuery(notes, query, (item) => item.text || "", 6) : notes.slice(-6);
  if (selected.length)
    lines.push("群共享记忆：", ...selected.map((item) => "- " + String(item.text || "").slice(0, 300)));
  return lines.join("\n");
}
