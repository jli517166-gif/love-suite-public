import { api } from "./api.js";

/** Side effects receive only the state and setters they actually use. */
export async function executeSendGroupTest({ setBusy, setErr, setMsg }, groupId) {
  const id = String(groupId || "").trim();
  if (!id) return;
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    const data = await api("/say", { text: "（群聊测试）这条是从陪伴面板直接发到群里的。", groupId: id });
    setMsg("已发到群 " + id + "：" + (data.channel || (data.delivered ? "已投递" : data.reason)));
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeReloadGroup({ groupId, setGroupStatus, setErr }) {
  if (!groupId) return;
  try {
    const data = await api(`/group/status?groupId=${encodeURIComponent(groupId)}`);
    setGroupStatus(data);
  } catch (e) {
    setErr(String(e.message || e));
  }
}

export async function executeSaveGroupWorkspace({ groupId, groupWsInput, setBusy, setErr, setMsg, reloadGroup }) {
  if (!groupId || !groupWsInput.trim()) return;
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    const payload = { groupId, workspace: groupWsInput.trim() };
    try {
      await api("/group/workspace", payload);
    } catch (error) {
      if (error.code !== "group-workspace-move") throw error;
      const ok =
        typeof window !== "undefined" && window.confirm
          ? window.confirm(error.message + "\n\n点“确定”把旧群记忆复制到新目录，点“取消”保留旧目录。")
          : false;
      if (!ok) return;
      await api("/group/workspace", { ...payload, migrate: true });
    }
    await reloadGroup();
    setMsg("群工作区已保存");
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeClearGroupWorkspace({ groupId, setBusy, setErr, setMsg, setGroupWsInput, reloadGroup }) {
  if (!groupId) return;
  const ok =
    typeof window !== "undefined" && window.confirm
      ? window.confirm("清除这个群的独立工作区？群记忆不会删除，只是回到主工作区。")
      : false;
  if (!ok) return;
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    await api("/group/workspace/clear", { groupId });
    setGroupWsInput("");
    await reloadGroup();
    setMsg("已回到主工作区");
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeAddGroupMemory({
  groupId,
  groupNoteText,
  setBusy,
  setErr,
  setMsg,
  setGroupNoteText,
  reloadGroup,
}) {
  if (!groupId || !groupNoteText.trim()) return;
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    await api("/group/note", { groupId, text: groupNoteText.trim() });
    setGroupNoteText("");
    await reloadGroup();
    setMsg("已记到群共享记忆");
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeSaveGroupSettings({ setBusy, setErr, setMsg, reloadGroup }, patch) {
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    await api("/config", patch);
    await reloadGroup();
    setMsg("群设置已保存");
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeClearGroupMemory({ groupId, setBusy, setErr, setMsg, reloadGroup }) {
  if (!groupId) return;
  const ok =
    typeof window !== "undefined" && window.confirm
      ? window.confirm("清除群 " + groupId + " 的群友档案、共享记忆和消息记录？不可恢复。")
      : false;
  if (!ok) return;
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    await api("/group/clear", { groupId, confirm: groupId });
    await reloadGroup();
    setMsg("群档案已清除");
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeTestGroupSend({ groupId, setBusy, setErr, setMsg }) {
  if (!groupId) return;
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    const data = await api("/say", { text: "（群聊测试）这条是从陪伴面板发到群里的。", groupId });
    setMsg("已发到群：" + (data.channel || data.reason || "已投递"));
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}
