import { h } from "./react.js";
import { fmt, Info, Switch } from "./components.js";
import { ReflectionManager } from "./reflection-manager.js";

/** Explicit view inputs keep rendering independent from state ownership. */
export function renderGroup({
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
}) {
  if (!groupId) {
    return h(
      "div",
      { className: "lc-body" },
      h("p", { className: "lc-hint" }, "还没有群记忆。先在群里 @ 她一次，群号和群友会自动出现。"),
    );
  }
  if (!groupStatus) {
    return h("div", { className: "lc-body" }, h("p", { className: "lc-hint" }, "正在读取群记忆…"));
  }
  const members = groupStatus.members || [];
  const notes = groupStatus.notes || [];
  const summary = groupStatus.summary || {};
  const config = groupStatus.config || {};
  return h(
    "div",
    { className: "lc-body" },
    h(
      "div",
      { className: "lc-overview-main" },
      h(
        "section",
        { className: "lc-now" },
        h("span", { className: "lc-now-label" }, "此刻"),
        h("div", { className: "lc-now-value" }, "群 " + groupId + "，", members.length + " 人"),
        h(
          "div",
          { className: "lc-now-cause" },
          summary.last_active ? "最后活跃 " + fmt(summary.last_active) : "还没有活跃记录",
        ),
      ),
      h(
        "div",
        { className: "lc-actions" },
        h("button", { className: "lc-btn primary", onClick: testGroupSend, disabled: busy }, "发一条到群"),
        h("button", { className: "lc-btn", onClick: reloadGroup, disabled: busy }, "刷新群状态"),
      ),
      h(
        "dl",
        { className: "lc-facts" },
        h(
          "div",
          { className: "lc-fact" },
          h("dt", null, "群友"),
          h("dd", null, String(summary.members || 0) + " 人", h("small", null, "按好感排序")),
        ),
        h(
          "div",
          { className: "lc-fact" },
          h("dt", null, "共享记忆"),
          h("dd", null, String(summary.notes || 0) + " 条", h("small", null, "她主动记的")),
        ),
        h(
          "div",
          { className: "lc-fact" },
          h("dt", null, "上下文"),
          h("dd", null, String(config.groupContextMessages ?? 20) + " 条", h("small", null, "@ 时带上的群历史")),
        ),
      ),
    ),
    h(
      "div",
      { className: "lc-group-stats" },
      h("div", { className: "lc-stat" }, h("b", null, String(summary.members || 0)), h("span", null, "群友")),
      h("div", { className: "lc-stat" }, h("b", null, String(summary.notes || 0)), h("span", null, "共享记忆")),
      h(
        "div",
        { className: "lc-stat" },
        h("b", null, String(config.groupContextMessages ?? 20)),
        h("span", null, "上下文条数"),
      ),
    ),
    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "群友"),
      members.length
        ? members.map((member) =>
            h(
              "div",
              { className: "lc-member", key: member.qq },
              h(
                "div",
                { className: "lc-member-name" },
                h("strong", null, member.nickname || member.qq),
                h("span", null, member.messages + " 条"),
              ),
              h(
                "div",
                { className: "lc-meter", "aria-label": "好感 " + member.affection },
                h("i", { style: { width: Math.min(100, member.affection) + "%" } }),
              ),
              h("span", { className: "lc-member-affection" }, "好感 " + member.affection),
            ),
          )
        : h("p", { className: "lc-hint" }, "还没有群友记录。"),
    ),
    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "群共享记忆"),
      h(ReflectionManager, { groupId, key: groupId }),
      notes.length
        ? notes.map((note, index) => h("p", { className: "lc-note", key: index }, note.text))
        : h("p", { className: "lc-hint" }, "她还没往这个群里记过事。"),
      h(
        "div",
        { className: "lc-note-add" },
        h("input", {
          className: "lc-input wide",
          value: groupNoteText,
          onChange: (e) => setGroupNoteText(e.target.value),
          placeholder: "替她记一条群记忆…",
          "aria-label": "群共享记忆",
        }),
        h(
          "button",
          { className: "lc-btn", onClick: addGroupMemory, disabled: busy || !groupNoteText.trim() },
          "记一条",
        ),
      ),
    ),
    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "群设置"),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "群聊主动", h(Info, { text: "允许主动消息发到这个群" })),
        h(Switch, {
          on: config.groupProactive === true,
          disabled: busy,
          onChange: () => saveGroupSettings({ groupProactive: !(config.groupProactive === true) }),
          label: "群聊主动",
        }),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "记录群记忆", h(Info, { text: "关掉后不记群消息、群友档案和共享记忆" })),
        h(Switch, {
          on: config.groupMemoryEnabled !== false,
          disabled: busy,
          onChange: () => saveGroupSettings({ groupMemoryEnabled: !(config.groupMemoryEnabled !== false) }),
          label: "记录群记忆",
        }),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "上下文条数", h(Info, { text: "@ 时带多少条群历史，0–100" })),
        h("input", {
          className: "lc-input",
          type: "number",
          min: 0,
          max: 100,
          value: config.groupContextMessages ?? 20,
          onChange: (e) => saveGroupSettings({ groupContextMessages: Number(e.target.value) }),
          "aria-label": "群聊上下文条数",
        }),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "群工作区", h(Info, { text: "这个群的记忆单独放在这里；留空用主工作区" })),
        h(
          "div",
          { className: "lc-field" },
          h("input", {
            className: "lc-input wide",
            value: groupWsInput,
            onChange: (e) => setGroupWsInput(e.target.value),
            placeholder: "\\path\\to\\group-workspace",
            "aria-label": "群工作区",
          }),
          h("button", { className: "lc-btn", onClick: saveGroupWorkspace, disabled: busy }, "保存"),
          h("button", { className: "lc-btn", onClick: clearGroupWorkspace, disabled: busy }, "清除"),
        ),
      ),
      h(
        "div",
        { className: "lc-field", style: { marginTop: 12 } },
        h("button", { className: "lc-btn", onClick: testGroupSend, disabled: busy }, "发一条到群"),
        h("button", { className: "lc-btn", onClick: reloadGroup, disabled: busy }, "刷新"),
        h("button", { className: "lc-btn danger", onClick: clearGroupMemory, disabled: busy }, "清除群档案"),
      ),
    ),
  );
}
