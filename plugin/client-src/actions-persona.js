import { api } from "./api.js";

/** Side effects receive only the state and setters they actually use. */
export async function executeSwitchPersona({ persona, setBusy, setErr, setMsg, setPersona, setDoctorText }, key) {
  if (!key || key === persona?.current) return;
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    const data = await api("/persona", { key });
    setPersona({ current: data.current, items: data.items || [] });
    const doctor = await api("/doctor");
    const text = doctor.text || "";
    setDoctorText(text);
    const learned = (text.match(/学会的事：(\d+)/) || [])[1];
    setMsg(`已切到「${data.name}」；记忆和能力没变${learned ? `（学会 ${learned} 件）` : ""}。新开一轮对话生效。`);
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeDeletePersonaNow({ deleteKey, setBusy, setErr, setMsg, setPersona, setDeleteKey }) {
  const key = (deleteKey || "").trim();
  if (!key) return;
  if (!window.confirm(`删除人格「${key}」？会移到 .persona-trash，记忆不受影响。`)) return;
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    const data = await api("/persona/delete", { key });
    setPersona({ current: data.current, items: data.items || [] });
    setDeleteKey("");
    setMsg(`已删除人格「${key}」；记忆没动，skill 在 .persona-trash/ 里可恢复。`);
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeInstallPersonaSkill({
  setBusy,
  setErr,
  setMsg,
  newKey,
  newName,
  newDesc,
  newBody,
  setPersona,
  setInstallOpen,
  setNewKey,
  setNewName,
  setNewDesc,
  setNewBody,
}) {
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    const data = await api("/persona/install", {
      key: (newKey || "").trim(),
      name: (newName || "").trim(),
      description: (newDesc || "").trim(),
      body: (newBody || "").trim(),
    });
    setPersona({ current: data.current, items: data.items || [] });
    setInstallOpen(false);
    setNewKey("");
    setNewName("");
    setNewDesc("");
    setNewBody("");
    setMsg(`已安装「${data.name}」；在人格下拉里选中即可切换。`);
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}
