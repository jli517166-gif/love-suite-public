import { usePanelModel } from "./panel-model.js";

import { renderLearning } from "./view-learning.js";
import { renderTemplates } from "./view-templates.js";
import { renderHeartbeat } from "./view-heartbeat.js";

import { renderSetup } from "./view-setup.js";
import { renderGroup } from "./view-group.js";
import { renderSettings } from "./view-settings.js";
import { renderOverview } from "./view-overview.js";
import { h } from "./react.js";
import { STAR_URL } from "./constants.js";

import { ACTIVITY_LABELS, moodColor, domNode } from "./components.js";
import { clampPanelZoom, panelViewportStyle } from "./zoom.js";

export function Panel({ onClose }) {
  const {
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
  } = usePanelModel();
  if (!status || !form) {
    return h(
      "div",
      { className: "lc-root", ref: panelRoot, style: panelViewportStyle(effectiveZoom) },
      h(
        "div",
        { className: "lc-head" },
        h("div", null, h("h1", { className: "lc-title" }, "陪伴"), h("p", { className: "lc-presence" }, "正在读取…")),
        onClose ? h("button", { className: "lc-close", onClick: onClose, "aria-label": "关闭" }, "×") : null,
      ),
      err ? h("p", { role: "alert", className: "lc-msg err", style: { padding: "0 34px" } }, err) : null,
    );
  }

  const mood = status.mood || {};
  const state = status.state || {};
  const pulse = status.pulse || {};
  const needs = pulse.needs || {};
  const activity = pulse.activity || {};
  const outbox = status.outbox || {};
  const dates = Array.isArray(state.dates) ? state.dates : [];
  const awake = Boolean(pulse.activity && pulse.activity.id && pulse.activity.id !== "sleeping");

  const tabs = [
    ["overview", "概览"],
    ["heartbeat", "心跳"],
    ["learning", "学习"],
    ["templates", "模板"],
    ["settings", "设置"],
    ["setup", "向导"],
  ];

  const absStar = status.starUrl || window.location.origin + STAR_URL;

  // 星图不做独立页签：它是概览里的一个主要动作
  const labelFor = (kind, key) => (kind === "activity" ? ACTIVITY_LABELS[key] || key : key);

  const modeSwitch = h(
    "div",
    { className: "lc-modes", role: "group", "aria-label": "聊天类型" },
    h(
      "button",
      {
        className: "lc-mode" + (mode === "private" ? " on" : ""),
        "aria-pressed": mode === "private",
        onClick: () => setMode("private"),
      },
      "私聊",
    ),
    h(
      "button",
      {
        className: "lc-mode" + (mode === "group" ? " on" : ""),
        "aria-pressed": mode === "group",
        onClick: () => setMode("group"),
      },
      "群聊",
    ),
  );

  const groupSelect =
    mode === "group"
      ? h(
          "select",
          {
            className: "lc-input lc-group-select",
            value: groupId,
            onChange: (e) => setGroupId(e.target.value),
            "aria-label": "选择群",
          },
          groups.length
            ? groups.map((group) =>
                h("option", { key: group.id, value: group.id }, "群 " + group.id + "（" + group.members + " 人）"),
              )
            : h("option", { value: "" }, "还没有群"),
        )
      : null;

  const headTitle = h(
    "div",
    null,
    h("h1", { className: "lc-title" }, "陪伴"),
    h(
      "p",
      { className: "lc-presence" },
      h("span", { className: "lc-dot" + (awake ? "" : " idle") }),
      mode === "group"
        ? groupStatus?.summary
          ? "群 " + groupId + " · " + groupStatus.summary.members + " 人"
          : "群聊"
        : activity.label || "还没醒",
      h("span", { style: { opacity: 0.5 } }, "·"),
      h("span", { style: { color: moodColor(mood.emotion) } }, mood.emotion || "平静"),
    ),
  );

  const headActions = h(
    "div",
    { className: "lc-head-actions" },
    h(
      "button",
      {
        className: "lc-zoom",
        onClick: () => {
          setPanelZoom(clampPanelZoom(+(effectiveZoom - 0.1).toFixed(2)));
          setZoomMode("manual");
        },
        disabled: effectiveZoom <= 0.8,
        "aria-label": "缩小面板",
      },
      "A−",
    ),
    h(
      "button",
      {
        className: "lc-zoom",
        onClick: () => {
          setPanelZoom(clampPanelZoom(+(effectiveZoom + 0.1).toFixed(2)));
          setZoomMode("manual");
        },
        disabled: effectiveZoom >= 1.5,
        "aria-label": "放大面板",
      },
      "A+",
    ),
    h(
      "button",
      {
        className: "lc-zoom",
        onClick: () => setZoomMode("auto"),
        "aria-label": "自动适配面板",
        "aria-pressed": zoomMode === "auto",
        title: "随面板宽度自动适配 · 当前 " + Math.round(effectiveZoom * 100) + "%",
      },
      "自动",
    ),
    modeSwitch,
    groupSelect,
    onClose ? h("button", { className: "lc-close", onClick: onClose, "aria-label": "关闭" }, "×") : null,
  );

  if (mode === "group") {
    return h(
      "div",
      { className: "lc-root", ref: panelRoot, style: panelViewportStyle(effectiveZoom) },
      h("div", { className: "lc-head" }, headTitle, headActions),
      renderGroup({
        groupId,
        groupStatus,
        testGroupSend,
        busy,
        reloadGroup,
        groupNoteText,
        addGroupMemory,
        groupWsInput,
        saveGroupWorkspace,
        clearGroupWorkspace,
        clearGroupMemory,
        setGroupNoteText,
        saveGroupSettings,
        setGroupWsInput,
      }),
      msg ? h("p", { role: "status", "aria-live": "polite", className: "lc-msg" }, msg) : null,
      err ? h("p", { role: "alert", className: "lc-msg err" }, err) : null,
    );
  }

  return h(
    "div",
    { className: "lc-root", ref: panelRoot, style: panelViewportStyle(effectiveZoom) },
    h("div", { className: "lc-head" }, headTitle, headActions),

    h(
      "div",
      {
        className: "lc-tabs",
        role: "tablist",
        onKeyDown: (event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          event.preventDefault();
          const index = tabs.findIndex(([id]) => id === tab);
          const offset = event.key === "ArrowRight" ? 1 : -1;
          const next = tabs[(index + offset + tabs.length) % tabs.length][0];
          setTab(next);
          requestAnimationFrame(() => domNode("lc-tab-" + next)?.focus());
        },
      },
      tabs.map(([id, label]) =>
        h(
          "button",
          {
            key: id,
            id: "lc-tab-" + id,
            role: "tab",
            className: "lc-tab",
            "aria-selected": tab === id,
            tabIndex: tab === id ? 0 : -1,
            onClick: () => setTab(id),
          },
          label,
        ),
      ),
    ),

    tab === "heartbeat"
      ? renderHeartbeat({ heartbeat })
      : tab === "learning"
        ? renderLearning({
            learning,
            learnQuery,
            form,
            learnName,
            learnNote,
            addLearning,
            busy,
            setLearnQuery,
            setLearnName,
            setLearnNote,
          })
        : tab === "templates"
          ? renderTemplates({
              templates,
              adding,
              labelFor,
              addingText,
              busy,
              editing,
              editingText,
              setEditingText,
              templateOp,
              setEditing,
              setAddingText,
              setAdding,
            })
          : tab === "setup"
            ? renderSetup({ setup, form, saveSetup, busy, repairSetupNow, msg, err, setField, loadSetup })
            : tab === "settings"
              ? renderSettings({
                  settingsMode,
                  persona,
                  busy,
                  deleteKey,
                  deletePersonaNow,
                  installOpen,
                  newKey,
                  newName,
                  newDesc,
                  newBody,
                  installPersonaSkill,
                  doctorText,
                  form,
                  extraWs,
                  saveWorkspaces,
                  status,
                  stickers,
                  stickerQuery,
                  stickerPath,
                  addSticker,
                  exportMemoryFile,
                  importMemoryFile,
                  dryRun,
                  preview,
                  msg,
                  err,
                  setSettingsMode,
                  switchPersona,
                  setDeleteKey,
                  setInstallOpen,
                  setNewKey,
                  setNewName,
                  setNewDesc,
                  setNewBody,
                  setField,
                  save,
                  setExtraWs,
                  dirty,
                  load,
                  sendGroupTest,
                  setStickerQuery,
                  setStickerPath,
                  setConfirmText,
                  setConfirmOpen,
                })
              : renderOverview({
                  activity,
                  mood,
                  dryRun,
                  busy,
                  preview,
                  status,
                  state,
                  dates,
                  outbox,
                  needs,
                  persona,
                  graphStats,
                  groups,
                  load,
                  setTab,
                  setSettingsMode,
                  openStar,
                  copied,
                  absStar,
                  copyStar,
                }),

    confirmOpen
      ? h(
          "div",
          { className: "lc-modal", role: "dialog", "aria-modal": "true", "aria-label": "确认恢复出厂设置" },
          h(
            "div",
            { className: "lc-modal-card" },
            h("h3", null, "确定恢复出厂设置？"),
            h(
              "p",
              null,
              "会清空称呼、偏好、边界、关系、心情、日记、小生活、自我叙事、表情包图库和发件箱，回到刚认识的状态。",
            ),
            h("p", null, "memory/ 会先整份备份到工作区的 .reset-backups/ 下；确认后不可从界面撤销。"),
            h("input", {
              className: "lc-input wide",
              value: confirmText,
              onChange: (e) => setConfirmText(e.target.value),
              placeholder: "输入「重置」两个字确认",
              "aria-label": "输入重置确认",
              autoFocus: true,
            }),
            h(
              "div",
              { className: "lc-modal-actions" },
              h(
                "button",
                {
                  className: "lc-btn",
                  onClick: () => {
                    setConfirmOpen(false);
                    setConfirmText("");
                  },
                  disabled: busy,
                },
                "取消",
              ),
              h(
                "button",
                {
                  className: "lc-btn danger",
                  onClick: doReset,
                  disabled: busy || confirmText !== "重置",
                },
                "确认重置",
              ),
            ),
          ),
        )
      : null,
  );
}
