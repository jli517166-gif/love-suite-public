import { h } from "./react.js";

/** Explicit view inputs keep rendering independent from state ownership. */
export function renderLearning({
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
}) {
  const items = learning || [];
  const query = learnQuery.trim().toLowerCase();
  const shown = query ? items.filter((item) => `${item.name} ${item.note || ""}`.toLowerCase().includes(query)) : items;
  return h(
    "div",
    { className: "lc-body" },
    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "她学会的事"),
      h(
        "p",
        { className: "lc-hint" },
        learning
          ? `一共 ${items.length} 件。学会新操作、被教会新东西时由 agent 自动记下，也可以在这里手动补。`
          : "正在读取…",
      ),
      h(
        "p",
        { className: "lc-hint", style: { marginTop: -6 } },
        form.autoLearn !== false
          ? "小提示：自动学习已开——对话里出现「教你 / 记住 / 以后你可以…」会自己记一条；误记了去设置关掉即可。"
          : "小提示：自动学习已关——只在她主动记、或你在这里手动补时才会增加。",
      ),
      h(
        "div",
        { className: "lc-field", style: { margin: "4px 0 14px" } },
        h("input", {
          className: "lc-input wide",
          value: learnQuery,
          onChange: (e) => setLearnQuery(e.target.value),
          placeholder: "搜能力名或说明",
          "aria-label": "搜索学会的事",
        }),
      ),
      shown.length
        ? h(
            "div",
            { className: "lc-lines" },
            shown.map((item) =>
              h(
                "div",
                { className: "lc-line", key: item.id },
                h(
                  "span",
                  null,
                  h("b", { style: { color: "var(--lc-ink)", fontWeight: 500 } }, item.name),
                  item.note
                    ? h("span", { className: "lc-sub", style: { display: "block", marginTop: 2 } }, item.note)
                    : null,
                ),
                h(
                  "b",
                  { style: { fontSize: 11, color: "var(--lc-muted)", fontWeight: 400 } },
                  `${String(item.date || "").slice(0, 10)}${item.managed ? " · 核心记忆" : item.times > 1 ? ` · ${item.times} 次` : ""}`,
                ),
              ),
            ),
          )
        : h(
            "p",
            { className: "lc-hint" },
            query ? "没有匹配的能力" : "还没有记录；聊着聊着她会自己记，也可以下面补一条。",
          ),
    ),
    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "补一条"),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "能力"),
        h("input", {
          className: "lc-input wide",
          value: learnName,
          onChange: (e) => setLearnName(e.target.value),
          placeholder: "例如：用语音回消息",
          "aria-label": "能力名",
        }),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "说明"),
        h("input", {
          className: "lc-input wide",
          value: learnNote,
          onChange: (e) => setLearnNote(e.target.value),
          placeholder: "怎么用 / 从哪学的",
          "aria-label": "能力说明",
        }),
      ),
      h(
        "div",
        { className: "lc-field" },
        h(
          "button",
          { className: "lc-btn primary", onClick: addLearning, disabled: busy || !learnName.trim() },
          "记下来",
        ),
      ),
    ),
  );
}
