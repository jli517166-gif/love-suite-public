import { api } from "./api.js";

/** Side effects receive only the state and setters they actually use. */
export async function executeTemplateOp(
  { setBusy, setErr, setMsg, setTemplates, setEditing, setEditingText, setAdding, setAddingText },
  op,
  kind,
  key,
  index,
  text,
) {
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    const data = await api("/templates", { op, kind, key, index, text });
    setTemplates(data);
    setEditing("");
    setEditingText("");
    setAdding("");
    setAddingText("");
    setMsg("模板已更新");
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeExportMemoryFile({ setBusy, setErr, setMsg }) {
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    const response = await fetch("/love-companion/api/export");
    if (!response.ok) throw new Error("导出失败：HTTP " + response.status);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "love-memory-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMsg("已导出记忆 JSON（表情包图片不含在内）");
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeImportMemoryFile({ setErr, setMsg, setBusy, load }, event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  setErr("");
  setMsg("");
  try {
    const bundle = JSON.parse(await file.text());
    if (!window.confirm("导入会覆盖当前记忆（会先自动备份）。继续？")) return;
    setBusy(true);
    const data = await api("/import", { bundle, confirm: "IMPORT" });
    setMsg("已导入 " + data.files + " 个文件；旧记忆备份在 " + data.backup);
    await load();
  } catch (e) {
    setErr(String(e.message || e));
    setBusy(false);
  }
}

export async function executeAddSticker({ setBusy, setErr, setMsg, stickerPath, setStickers, setStickerPath }) {
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    const data = await api("/stickers", { path: (stickerPath || "").trim() });
    setStickers(data.items || []);
    setStickerPath("");
    setMsg("已收进图库：" + (data.entry?.name || ""));
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeAddLearning({
  learnName,
  setBusy,
  setErr,
  setMsg,
  learnNote,
  setLearning,
  setLearnName,
  setLearnNote,
}) {
  const name = learnName.trim();
  if (!name) return;
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    const data = await api("/learning", { name, note: learnNote.trim(), source: "user" });
    setLearning(data.items || []);
    setLearnName("");
    setLearnNote("");
    setMsg(`记下了：${name}`);
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setBusy(false);
  }
}

export async function executeCopyStar({ absStar, setCopied, setMsg }, url) {
  try {
    await navigator.clipboard.writeText(url || absStar);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  } catch {
    setMsg("复制失败，手动选中下面的地址");
  }
}

export async function executeOpenStar({ setBusy, setErr, setMsg }) {
  setBusy(true);
  setErr("");
  setMsg("");
  try {
    await api("/open-star", {});
    setMsg("已交给系统浏览器打开");
  } catch (e) {
    setErr(String(e.message || e) + "（也可以用下面的复制链接）");
  } finally {
    setBusy(false);
  }
}
