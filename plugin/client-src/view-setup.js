import { h } from "./react.js";
import { Info } from "./components.js";

/** Explicit view inputs keep rendering independent from state ownership. */
export function renderSetup({ setup, form, saveSetup, busy, repairSetupNow, msg, err, setField, loadSetup }) {
  return h(
    "div",
    { className: "lc-body" },
    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "安装与配置"),
      h(
        "p",
        { className: "lc-hint" },
        setup ? `${setup.done}/${setup.total} 项就绪。缺的项不会让插件崩，只是对应能力不完整。` : "正在检测…",
      ),
      setup
        ? h(
            "div",
            { className: "lc-lines" },
            setup.items.map((item) =>
              h(
                "div",
                { className: "lc-line", key: item.id },
                h(
                  "span",
                  null,
                  h("span", {
                    className: "lc-dot" + (item.ok ? "" : " idle"),
                    style: { display: "inline-block", marginRight: 8 },
                  }),
                  item.label,
                ),
                h("b", { style: { color: item.ok ? undefined : "#c0392b" } }, item.ok ? "就绪" : "待配置"),
              ),
            ),
          )
        : null,
      setup
        ? h(
            "div",
            null,
            setup.items
              .filter((item) => !item.ok)
              .map((item) =>
                h(
                  "p",
                  { className: "lc-hint", key: item.id, style: { marginTop: 10 } },
                  item.label + "：" + item.detail + " " + item.fix,
                ),
              ),
          )
        : null,
    ),

    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "连接设置"),
      h("p", { className: "lc-hint" }, "先填工作区和通道；NapCat 的 ws 反向要跟这里一致。保存后会自动重新检测。"),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "聊天工作区"),
        h("input", {
          className: "lc-input wide",
          value: form.workspace || "",
          onChange: (e) => setField("workspace", e.target.value),
          placeholder: "E:\\path\\to\\love",
          "aria-label": "聊天工作区路径",
        }),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "消息通道"),
        h(
          "select",
          {
            className: "lc-input",
            style: { width: 220, flex: "0 0 auto" },
            value: form.channel || "qq",
            onChange: (e) => setField("channel", e.target.value),
            "aria-label": "消息通道",
          },
          h("option", { value: "qq" }, "QQ（OneBot）"),
          h("option", { value: "web" }, "Web 会话"),
          h("option", { value: "none" }, "不接通道"),
        ),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "OneBot 地址", h(Info, { text: "NapCat 的 WebSocket 反向地址，默认 127.0.0.1:8643" })),
        h(
          "div",
          { className: "lc-field" },
          h("input", {
            className: "lc-input",
            value: form.qqHost || "127.0.0.1",
            onChange: (e) => setField("qqHost", e.target.value),
            "aria-label": "OneBot 主机",
          }),
          h("input", {
            className: "lc-input",
            type: "number",
            min: 1,
            max: 65535,
            value: form.qqPort || 8643,
            onChange: (e) => setField("qqPort", Number(e.target.value)),
            "aria-label": "OneBot 端口",
          }),
        ),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "NapCat 目录", h(Info, { text: "NapCat 安装目录，用来检测是否装好" })),
        h("input", {
          className: "lc-input wide",
          value: form.napcatDir || "",
          onChange: (e) => setField("napcatDir", e.target.value),
          "aria-label": "NapCat 目录",
        }),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "直发接口", h(Info, { text: "可选。填 NapCat HTTP 地址后，主动消息可以 0 token 直接发" })),
        h(
          "div",
          { className: "lc-field" },
          h("input", {
            className: "lc-input wide",
            value: form.qqHttpUrl || "",
            onChange: (e) => setField("qqHttpUrl", e.target.value),
            placeholder: "http://127.0.0.1:6700",
            "aria-label": "直发接口地址",
          }),
          h("input", {
            className: "lc-input",
            value: form.qqHttpToken || "",
            onChange: (e) => setField("qqHttpToken", e.target.value),
            placeholder: "token",
            "aria-label": "直发接口 token",
          }),
        ),
      ),
      h(
        "div",
        { className: "lc-field", style: { marginTop: 10 } },
        h("button", { className: "lc-btn primary", onClick: saveSetup, disabled: busy }, "保存并重新检测"),
        h("button", { className: "lc-btn", onClick: () => loadSetup(), disabled: busy }, "只重新检测"),
        h("button", { className: "lc-btn", onClick: repairSetupNow, disabled: busy }, "一键修复配置"),
        h("span", { className: "lc-hint", style: { margin: 0 } }, "修复会先备份运行时配置和 NapCat 配置"),
      ),
      msg ? h("p", { role: "status", "aria-live": "polite", className: "lc-msg" }, msg) : null,
      err ? h("p", { role: "alert", className: "lc-msg err" }, err) : null,
    ),
  );
}
