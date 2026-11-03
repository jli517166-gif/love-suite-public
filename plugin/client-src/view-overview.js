import { h } from "./react.js";
import { moodColor, fmt, pct } from "./components.js";
import { renderStarCard } from "./view-starcard.js";

/** Explicit view inputs keep rendering independent from state ownership. */
export function renderOverview({
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
}) {
  return h(
    "div",
    { className: "lc-body lc-overview" },
    h(
      "div",
      { className: "lc-overview-main" },
      h(
        "section",
        { className: "lc-now" },
        h("span", { className: "lc-now-label" }, "此刻"),
        h(
          "div",
          { className: "lc-now-value" },
          activity.label || "安静地待着",
          "，",
          h("em", { style: { color: moodColor(mood.emotion) } }, mood.emotion || "平静"),
        ),
        mood.causes && mood.causes.length
          ? h("div", { className: "lc-now-cause" }, "因为：" + mood.causes.slice(-2).join("；"))
          : null,
      ),

      h(
        "div",
        { className: "lc-actions" },
        h("button", { className: "lc-btn primary", onClick: dryRun, disabled: busy }, "预览一条主动"),
        h("button", { className: "lc-btn", onClick: () => load(), disabled: busy }, "刷新状态"),
        h(
          "button",
          {
            className: "lc-btn",
            onClick: () => {
              setTab("settings");
              setSettingsMode("reflection");
            },
          },
          "查看整理批次",
        ),
      ),
      preview ? h("pre", { className: "lc-pre" }, preview) : null,

      h(
        "dl",
        { className: "lc-facts" },
        h(
          "div",
          { className: "lc-fact" },
          h("dt", null, "关系"),
          h(
            "dd",
            null,
            status.relationship?.stage || "初识",
            h(
              "small",
              null,
              "好感 " + (status.relationship?.affection ?? 5) + " · 信任 " + (status.relationship?.trust ?? 5),
            ),
          ),
        ),
        h(
          "div",
          { className: "lc-fact" },
          h("dt", null, "上次主动"),
          h("dd", null, fmt(state.last_sent), h("small", null, "本周 " + dates.length + " 次")),
        ),
        h(
          "div",
          { className: "lc-fact" },
          h("dt", null, "发件箱"),
          h("dd", null, String(outbox.fresh || 0) + " 条", h("small", null, "离线时攒着，回来补发")),
        ),
      ),

      renderStarCard({ graphStats, openStar, busy, copied, absStar, copyStar }),
    ),

    h(
      "aside",
      { className: "lc-overview-rail" },
      h("h4", { className: "lc-rail-title" }, "她的状态"),
      h(
        "div",
        { className: "lc-needs" },
        h(
          "div",
          { className: "lc-need" },
          h("span", null, "依恋"),
          h(
            "div",
            { className: "lc-need-track" },
            h("div", { className: "lc-need-fill", style: { width: pct(needs.attachment) + "%" } }),
          ),
          h("b", null, pct(needs.attachment) + "%"),
        ),
        h(
          "div",
          { className: "lc-need" },
          h("span", null, "好奇"),
          h(
            "div",
            { className: "lc-need-track" },
            h("div", { className: "lc-need-fill", style: { width: pct(needs.curiosity) + "%" } }),
          ),
          h("b", null, pct(needs.curiosity) + "%"),
        ),
        h(
          "div",
          { className: "lc-need" },
          h("span", null, "精力"),
          h(
            "div",
            { className: "lc-need-track" },
            h("div", { className: "lc-need-fill", style: { width: pct(needs.energy) + "%" } }),
          ),
          h("b", null, pct(needs.energy) + "%"),
        ),
      ),

      h(
        "div",
        { className: "lc-lines" },
        h("div", { className: "lc-line" }, h("span", null, "下次可以主动"), h("b", null, fmt(state.next_after))),
        h("div", { className: "lc-line" }, h("span", null, "随机窗口"), h("b", null, fmt(state.next_at))),
        h("div", { className: "lc-line" }, h("span", null, "通道"), h("b", null, status.channel?.id || "qq")),
        h(
          "div",
          { className: "lc-line" },
          h("span", null, "人格"),
          h(
            "b",
            null,
            (((persona && persona.items) || []).find((item) => item.key === persona?.current) || {}).name ||
              persona?.current ||
              "—",
          ),
        ),
        h(
          "div",
          { className: "lc-line" },
          h("span", null, "工作区"),
          h("b", null, (status.workspace || "").split(/[\\/]/).pop() || "—"),
        ),
        h(
          "div",
          { className: "lc-line" },
          h("span", null, "记忆星点"),
          h("b", null, graphStats ? String(graphStats.nodes || 0) : "—"),
        ),
        h(
          "div",
          { className: "lc-line" },
          h("span", null, "待整理对话"),
          h(
            "b",
            null,
            status.reflection?.error
              ? "读取失败"
              : String((status.reflection?.pending || 0) + (status.reflection?.leased || 0)) + " 轮",
          ),
        ),
        h(
          "div",
          { className: "lc-line" },
          h("span", null, "后台整理"),
          h(
            "b",
            null,
            status.reflectionWorker?.enabled
              ? status.reflectionWorker.running
                ? "进行中"
                : String(status.reflectionWorker.dailyCalls || 0) +
                  "/" +
                  String(status.reflectionWorker.maxCallsPerDay || 6) +
                  " 次今日"
              : "已暂停",
          ),
        ),
        status.reflection?.failed || status.reflection?.needs_review
          ? h(
              "div",
              { className: "lc-line" },
              h("span", null, "整理需关注"),
              h(
                "b",
                null,
                String(status.reflection.failed || 0) +
                  " 轮失败 · " +
                  String(status.reflection.needs_review || 0) +
                  " 轮待补读",
              ),
            )
          : null,
        h("div", { className: "lc-line" }, h("span", null, "群记忆"), h("b", null, String(groups.length) + " 个群")),
        h(
          "div",
          { className: "lc-line" },
          h("span", null, "发件箱"),
          h("b", null, String(status.outbox?.fresh || 0) + " 条"),
        ),
      ),
    ),
  );
}
