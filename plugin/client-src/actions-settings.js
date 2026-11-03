import { api } from "./api.js";

/** Side effects receive only the state and setters they actually use. */
export function executeSetField({ dirty, setForm }, key, value) {
  dirty.current = true;
  setForm((f) => ({ ...(f || {}), [key]: value }));
}

export async function executeSave({ setBusy, setErr, setMsg, setStatus, dirty, setForm }, patch) {
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    const data = await api("/config", patch);
    setStatus(data);
    dirty.current = false;
    setForm({ ...data.config, workspace: data.workspace || "" });
    setMsg("已保存");
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeDryRun({ setBusy, setErr, setPreview }) {
  setBusy(true);
  setErr("");
  setPreview("");
  try {
    const data = await api("/dry-run", {});
    setPreview(data.prompt || "");
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeDoReset({
  setBusy,
  setErr,
  setMsg,
  status,
  setStatus,
  dirty,
  setForm,
  setConfirmOpen,
  setConfirmText,
  setTab,
}) {
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    const data = await api("/reset", { confirm: "RESET", workspace: status?.workspace || "" });
    setStatus(data);
    dirty.current = false;
    setForm({ ...data.config, workspace: data.workspace || "" });
    setConfirmOpen(false);
    setConfirmText("");
    setTab("overview");
    setMsg("已恢复出厂设置，备份在 " + (data.backup || ".reset-backups"));
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export function executeSaveSetup({ save, form }) {
  return save({
    workspace: form.workspace,
    channel: form.channel || "qq",
    qqHost: form.qqHost || "127.0.0.1",
    qqPort: Number(form.qqPort || 8643),
    qqHttpUrl: form.qqHttpUrl || "",
    qqHttpToken: form.qqHttpToken || "",
    napcatDir: form.napcatDir || "",
  });
}

export function executeSaveWorkspaces({ form, extraWs, save }) {
  const primary = (form.workspace || "").trim();
  const extras = (extraWs || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const list = extras.length
    ? [primary, ...extras].filter((item, index, all) => item && all.indexOf(item) === index)
    : [];
  return save({ workspaces: list });
}

export async function executeRepairSetupNow({ setBusy, setErr, setMsg, form, setSetup }) {
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    const data = await api("/setup/repair", {
      confirm: "REPAIR",
      workspace: (form.workspace || "").trim(),
      channel: form.channel || "qq",
      qqPort: Number(form.qqPort || 8643),
      napcatDir: form.napcatDir || "",
      httpPort: 0,
    });
    if (data.setup) setSetup(data.setup);
    const warnings = data.report?.warnings || [];
    setMsg("已修复配置（重启 NapCat / DSH 后生效）" + (warnings.length ? "；注意：" + warnings.join("；") : ""));
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}
