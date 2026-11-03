import {
  executeSendGroupTest,
  executeReloadGroup,
  executeSaveGroupWorkspace,
  executeClearGroupWorkspace,
  executeAddGroupMemory,
  executeSaveGroupSettings,
  executeClearGroupMemory,
  executeTestGroupSend,
} from "./actions-groups.js";
import {
  executeSetField,
  executeSave,
  executeDryRun,
  executeDoReset,
  executeSaveSetup,
  executeSaveWorkspaces,
  executeRepairSetupNow,
} from "./actions-settings.js";
import {
  executeTemplateOp,
  executeExportMemoryFile,
  executeImportMemoryFile,
  executeAddSticker,
  executeAddLearning,
  executeCopyStar,
  executeOpenStar,
} from "./actions-resources.js";
import { executeSwitchPersona, executeDeletePersonaNow, executeInstallPersonaSkill } from "./actions-persona.js";

import { useState, useEffect, useCallback, useRef } from "./react.js";

import { api } from "./api.js";
import { STAR_URL } from "./constants.js";

import { clampPanelZoom, automaticPanelZoom } from "./zoom.js";

/** Own all panel hook state/effects; preserve the original unconditional hook order. */
export function usePanelModel() {
  const [status, setStatus] = useState(null);
  const [panelZoom, setPanelZoom] = useState(() => {
    try {
      return clampPanelZoom(window.localStorage.getItem("love-panel-zoom") || 1);
    } catch {
      return 1;
    }
  });
  const [mode, setMode] = useState("private");
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState("");
  const [groupStatus, setGroupStatus] = useState(null);
  const [groupNoteText, setGroupNoteText] = useState("");
  const [groupWsInput, setGroupWsInput] = useState("");
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState("overview");
  const [settingsMode, setSettingsMode] = useState("menu");
  const setupPrompted = useRef(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [graphStats, setGraphStats] = useState(null);
  const [heartbeat, setHeartbeat] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [setup, setSetup] = useState(null);
  const [copied, setCopied] = useState(false);
  const [learning, setLearning] = useState(null);
  const [learnName, setLearnName] = useState("");
  const [learnNote, setLearnNote] = useState("");
  const [learnQuery, setLearnQuery] = useState("");
  const [persona, setPersona] = useState(null);
  const [doctorText, setDoctorText] = useState("");
  const [installOpen, setInstallOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [deleteKey, setDeleteKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newBody, setNewBody] = useState("");
  const [extraWs, setExtraWs] = useState("");
  const [stickers, setStickers] = useState(null);
  const [stickerQuery, setStickerQuery] = useState("");
  const [stickerPath, setStickerPath] = useState("");
  const [templates, setTemplates] = useState(null);
  const [editing, setEditing] = useState("");
  const [editingText, setEditingText] = useState("");
  const [adding, setAdding] = useState("");
  const [addingText, setAddingText] = useState("");
  const firstLoad = useRef(true);
  const dirty = useRef(false);
  const panelRoot = useRef(null);
  const [autoZoom, setAutoZoom] = useState(1);
  const [zoomMode, setZoomMode] = useState(() => {
    try {
      return window.localStorage.getItem("love-panel-zoom-mode") === "manual" ? "manual" : "auto";
    } catch {
      return "auto";
    }
  });
  const effectiveZoom = zoomMode === "auto" ? autoZoom : panelZoom;

  useEffect(() => {
    let host = panelRoot.current?.parentElement;
    // Slot wrappers using display:contents have no measurable layout box.
    while (host && window.getComputedStyle(host).display === "contents") host = host.parentElement;
    if (!host) return;
    const update = (width) => {
      if (Number.isFinite(width) && width > 0) setAutoZoom(automaticPanelZoom(width));
    };
    const measure = () => update(host.clientWidth);
    measure();
    // Observe the unscaled host, so changing zoom cannot feed back into its input.
    const observer =
      typeof window.ResizeObserver === "function"
        ? new window.ResizeObserver((entries) => {
            const entry = entries.find((item) => item.target === host);
            if (entry) update(entry.contentRect.width);
          })
        : null;
    observer?.observe(host);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // 第一次打开面板：没配置工作区就自动落到「向导」，别让人以为插件坏了。
  useEffect(() => {
    if (!status || setupPrompted.current) return;
    if (status.setupDone === false || status.workspaceExists === false) {
      setupPrompted.current = true;
      setTab("setup");
      setMsg("先选一个聊天工作区，她才会开始过日子。");
    }
  }, [status]);

  const sendGroupTest = (...args) => executeSendGroupTest({ setBusy, setErr, setMsg }, ...args);

  const load = useCallback(async () => {
    try {
      const data = await api("/status");
      setStatus(data);
      if (!dirty.current) {
        setForm({ ...data.config, workspace: data.workspace || "" });
        setExtraWs((data.workspaces || []).filter((item) => item !== data.workspace).join("\n"));
      }
      if (firstLoad.current) {
        firstLoad.current = false;
        if (data.setupDone === false) setTab("setup");
      }
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const data = await api("/groups");
      if (data.ok) {
        const items = data.items || [];
        setGroups(items);
        setGroupId((current) => current || (items[0] ? items[0].id : ""));
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    try {
      window.localStorage.setItem("love-panel-zoom", String(panelZoom));
    } catch {}
  }, [panelZoom]);
  useEffect(() => {
    try {
      window.localStorage.setItem("love-panel-zoom-mode", zoomMode);
    } catch {}
  }, [zoomMode]);

  useEffect(() => {
    if (mode !== "group" || !groupId) {
      setGroupStatus(null);
      return;
    }
    let alive = true;
    api(`/group/status?groupId=${encodeURIComponent(groupId)}`)
      .then((data) => {
        if (alive) {
          setGroupStatus(data);
          setGroupWsInput(data.workspace || "");
        }
      })
      .catch((e) => {
        if (alive) setErr(String(e.message || e));
      });
    return () => {
      alive = false;
    };
  }, [mode, groupId]);

  const reloadGroup = (...args) => executeReloadGroup({ groupId, setGroupStatus, setErr }, ...args);

  const saveGroupWorkspace = (...args) =>
    executeSaveGroupWorkspace({ groupId, groupWsInput, setBusy, setErr, setMsg, reloadGroup }, ...args);

  const clearGroupWorkspace = (...args) =>
    executeClearGroupWorkspace({ groupId, setBusy, setErr, setMsg, setGroupWsInput, reloadGroup }, ...args);

  const addGroupMemory = (...args) =>
    executeAddGroupMemory({ groupId, groupNoteText, setBusy, setErr, setMsg, setGroupNoteText, reloadGroup }, ...args);

  const saveGroupSettings = (...args) => executeSaveGroupSettings({ setBusy, setErr, setMsg, reloadGroup }, ...args);

  const clearGroupMemory = (...args) =>
    executeClearGroupMemory({ groupId, setBusy, setErr, setMsg, reloadGroup }, ...args);

  const testGroupSend = (...args) => executeTestGroupSend({ groupId, setBusy, setErr, setMsg }, ...args);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (tab !== "overview") return;
    let alive = true;
    api("/graph")
      .then((data) => {
        if (alive) setGraphStats(data.stats || null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tab]);

  const setField = (...args) => executeSetField({ dirty, setForm }, ...args);

  const save = (...args) => executeSave({ setBusy, setErr, setMsg, setStatus, dirty, setForm }, ...args);

  const dryRun = (...args) => executeDryRun({ setBusy, setErr, setPreview }, ...args);

  const doReset = (...args) =>
    executeDoReset(
      { setBusy, setErr, setMsg, status, setStatus, dirty, setForm, setConfirmOpen, setConfirmText, setTab },
      ...args,
    );

  const loadSetup = useCallback(async () => {
    try {
      const data = await api("/setup");
      setSetup(data);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, []);

  const loadLearning = useCallback(async () => {
    try {
      const data = await api("/learning");
      setLearning(data.items || []);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await api("/templates");
      setTemplates(data);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, []);

  const templateOp = (...args) =>
    executeTemplateOp(
      { setBusy, setErr, setMsg, setTemplates, setEditing, setEditingText, setAdding, setAddingText },
      ...args,
    );

  const loadStickers = useCallback(async () => {
    try {
      const data = await api("/stickers");
      setStickers(data.items || []);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, []);

  const exportMemoryFile = (...args) => executeExportMemoryFile({ setBusy, setErr, setMsg }, ...args);

  const importMemoryFile = (...args) => executeImportMemoryFile({ setErr, setMsg, setBusy, load }, ...args);

  const addSticker = (...args) =>
    executeAddSticker({ setBusy, setErr, setMsg, stickerPath, setStickers, setStickerPath }, ...args);

  useEffect(() => {
    if (tab === "setup") loadSetup();
    if (tab === "heartbeat") {
      api("/heartbeat")
        .then((data) => {
          if (data.ok) setHeartbeat(data);
        })
        .catch(() => {});
    }
    if (tab === "learning") loadLearning();
    if (tab === "templates") loadTemplates();
    if (tab === "settings") loadStickers();
  }, [tab, loadSetup, loadLearning]);

  useEffect(() => {
    if (tab !== "settings") return;
    const body = document.querySelector(".lc-settings");
    if (!body) return;
    const map = {
      人格: "persona",
      聊天工作区: "workspace",
      主动聊天: "proactive",
      语音提示: "voice",
      表情包图库: "stickers",
      数据: "data",
      功能开关: "features",
      后台整理: "reflection",
      预览: "preview",
    };
    for (const section of body.querySelectorAll(":scope > .lc-group")) {
      const key = map[section.querySelector("h3")?.textContent?.trim()] || "";
      section.style.display = settingsMode === "menu" ? "none" : key === settingsMode ? "" : "none";
    }
  }, [tab, settingsMode, status, persona, learning, stickers]);

  useEffect(() => {
    let alive = true;
    api("/persona")
      .then((data) => {
        if (alive) setPersona({ current: data.current, items: data.items || [] });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const switchPersona = (...args) =>
    executeSwitchPersona({ persona, setBusy, setErr, setMsg, setPersona, setDoctorText }, ...args);

  const deletePersonaNow = (...args) =>
    executeDeletePersonaNow({ deleteKey, setBusy, setErr, setMsg, setPersona, setDeleteKey }, ...args);

  const installPersonaSkill = (...args) =>
    executeInstallPersonaSkill(
      {
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
      },
      ...args,
    );

  const addLearning = (...args) =>
    executeAddLearning(
      { learnName, setBusy, setErr, setMsg, learnNote, setLearning, setLearnName, setLearnNote },
      ...args,
    );

  const copyStar = (...args) =>
    executeCopyStar({ absStar: status?.starUrl || window.location.origin + STAR_URL, setCopied, setMsg }, ...args);

  const openStar = (...args) => executeOpenStar({ setBusy, setErr, setMsg }, ...args);

  const saveSetup = (...args) => executeSaveSetup({ save, form }, ...args);

  const saveWorkspaces = (...args) => executeSaveWorkspaces({ form, extraWs, save }, ...args);

  const repairSetupNow = (...args) => executeRepairSetupNow({ setBusy, setErr, setMsg, form, setSetup }, ...args);

  return {
    status,
    setPanelZoom,
    mode,
    setMode,
    groups,
    groupId,
    setGroupId,
    groupStatus,
    groupNoteText,
    setGroupNoteText,
    groupWsInput,
    setGroupWsInput,
    form,
    tab,
    setTab,
    settingsMode,
    setSettingsMode,
    msg,
    err,
    busy,
    preview,
    graphStats,
    heartbeat,
    confirmOpen,
    setConfirmOpen,
    confirmText,
    setConfirmText,
    setup,
    copied,
    learning,
    learnName,
    setLearnName,
    learnNote,
    setLearnNote,
    learnQuery,
    setLearnQuery,
    persona,
    doctorText,
    installOpen,
    setInstallOpen,
    newKey,
    setNewKey,
    deleteKey,
    setDeleteKey,
    newName,
    setNewName,
    newDesc,
    setNewDesc,
    newBody,
    setNewBody,
    extraWs,
    setExtraWs,
    stickers,
    stickerQuery,
    setStickerQuery,
    stickerPath,
    setStickerPath,
    templates,
    editing,
    setEditing,
    editingText,
    setEditingText,
    adding,
    setAdding,
    addingText,
    setAddingText,
    dirty,
    panelRoot,
    zoomMode,
    setZoomMode,
    effectiveZoom,
    sendGroupTest,
    load,
    reloadGroup,
    saveGroupWorkspace,
    clearGroupWorkspace,
    addGroupMemory,
    saveGroupSettings,
    clearGroupMemory,
    testGroupSend,
    setField,
    save,
    dryRun,
    doReset,
    loadSetup,
    templateOp,
    exportMemoryFile,
    importMemoryFile,
    addSticker,
    switchPersona,
    deletePersonaNow,
    installPersonaSkill,
    addLearning,
    copyStar,
    openStar,
    saveSetup,
    saveWorkspaces,
    repairSetupNow,
  };
}
