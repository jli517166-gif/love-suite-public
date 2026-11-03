import { h, React } from "./react.js";

/** Explicit view inputs keep rendering independent from state ownership. */
export function renderTemplates({
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
}) {
  if (!templates) return h("div", { className: "lc-body" }, h("p", { className: "lc-hint" }, "正在读取模板…"));
  const groups = [
    ["activity", "活动模板", "她「在做什么」时说的话"],
    ["emotion", "心情模板", "心情强的时候加的一句"],
  ];
  return h(
    "div",
    { className: "lc-body" },
    h("p", { className: "lc-hint" }, "模板直出用于主动消息（0 token）。自定义按 key 覆盖默认；删空就回到默认。"),
    ...groups.map(([kind, title, hint]) =>
      h(
        "section",
        { className: "lc-group", key: kind },
        h("h3", null, title),
        h("p", { className: "lc-hint" }, hint),
        Object.entries(templates.effective[kind]).map(([key, lines]) => {
          const openKey = `${kind}:${key}`;
          const isAdding = adding === openKey;
          return h(
            "details",
            { className: "lc-tmpl", key: openKey },
            h(
              "summary",
              null,
              h("span", null, labelFor(kind, key)),
              h("span", { className: "lc-tmpl-count" }, lines.length + " 条"),
            ),
            h(
              "div",
              { className: "lc-tmpl-list" },
              lines.map((line, index) => {
                const editKey = `${openKey}:${index}`;
                return h(
                  "div",
                  { className: "lc-tmpl-line", key: editKey },
                  editing === editKey
                    ? h(
                        React.Fragment,
                        null,
                        h("input", {
                          className: "lc-input wide",
                          value: editingText,
                          onChange: (e) => setEditingText(e.target.value),
                          "aria-label": "编辑模板",
                        }),
                        h(
                          "button",
                          {
                            className: "lc-btn primary",
                            onClick: () => templateOp("update", kind, key, index, editingText),
                            disabled: busy,
                          },
                          "保存",
                        ),
                        h(
                          "button",
                          {
                            className: "lc-btn",
                            onClick: () => {
                              setEditing("");
                              setEditingText("");
                            },
                          },
                          "取消",
                        ),
                      )
                    : h(
                        React.Fragment,
                        null,
                        h("span", { className: "lc-tmpl-text" }, line),
                        h(
                          "button",
                          {
                            className: "lc-mini",
                            onClick: () => {
                              setEditing(editKey);
                              setEditingText(line);
                            },
                          },
                          "编辑",
                        ),
                        h(
                          "button",
                          { className: "lc-mini danger", onClick: () => templateOp("remove", kind, key, index) },
                          "删除",
                        ),
                      ),
                );
              }),
              isAdding
                ? h(
                    "div",
                    { className: "lc-tmpl-line" },
                    h("input", {
                      className: "lc-input wide",
                      value: addingText,
                      onChange: (e) => setAddingText(e.target.value),
                      placeholder: "新的一句模板",
                      "aria-label": "新增模板",
                    }),
                    h(
                      "button",
                      {
                        className: "lc-btn primary",
                        onClick: () => templateOp("add", kind, key, undefined, addingText),
                        disabled: busy,
                      },
                      "添加",
                    ),
                    h(
                      "button",
                      {
                        className: "lc-btn",
                        onClick: () => {
                          setAdding("");
                          setAddingText("");
                        },
                      },
                      "取消",
                    ),
                  )
                : h(
                    "button",
                    {
                      className: "lc-mini add",
                      onClick: () => {
                        setAdding(openKey);
                        setAddingText("");
                      },
                    },
                    "+ 加一条",
                  ),
            ),
          );
        }),
      ),
    ),
  );
}
