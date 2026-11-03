import { h } from "./react.js";

/** Explicit view inputs keep rendering independent from state ownership. */
export function renderStarCard({ graphStats, openStar, busy, copied, absStar, copyStar }) {
  return h(
    "section",
    { className: "lc-group" },
    h(
      "div",
      { className: "lc-row" },
      h(
        "div",
        null,
        h("h3", null, "记忆星图"),
        h(
          "p",
          { className: "lc-hint", style: { margin: "4px 0 0" } },
          graphStats
            ? `${graphStats.nodes} 颗星 · ${graphStats.links} 条连线 · ${graphStats.memories} 条长期记忆` +
                (graphStats.truncated
                  ? `（显示 ${graphStats.shownNodes || graphStats.nodes}/${graphStats.totalNodes || graphStats.nodes}）`
                  : "")
            : "在浏览器里看她的记忆星座",
        ),
      ),
      h(
        "div",
        { className: "lc-field" },
        h("button", { className: "lc-btn primary", onClick: openStar, disabled: busy }, "打开"),
        h("button", { className: "lc-btn", onClick: () => copyStar(absStar) }, copied ? "已复制" : "复制链接"),
      ),
    ),
    h("p", { className: "lc-hint", style: { marginTop: 10, userSelect: "text" } }, absStar),
  );
}
