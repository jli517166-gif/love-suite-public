import { h } from "./react.js";
import { fmt } from "./components.js";

/** Explicit view inputs keep rendering independent from state ownership. */
export function renderHeartbeat({ heartbeat }) {
  if (!heartbeat) return h("div", { className: "lc-body" }, h("p", { className: "lc-hint" }, "正在读取心跳…"));
  const mood = heartbeat.mood || {};
  const needs = heartbeat.pulse?.needs || {};
  const relationship = heartbeat.relationship || {};
  const memory = heartbeat.memory || {};
  const proactive = heartbeat.proactive || {};
  const bpm = Math.round(52 + Number(needs.energy || 0) * 28 + Number(needs.attachment || 0) * 18);
  const intensity = Math.round(Number(mood.intensity || 0) * 100);
  return h(
    "div",
    { className: "lc-body lc-heartbeat" },
    h(
      "section",
      { className: "lc-heart-hero" },
      h(
        "svg",
        { className: "lc-heart-svg", viewBox: "0 0 120 108", "aria-hidden": "true" },
        h("path", {
          d: "M60 96 C30 70 14 50 14 34 C14 18 26 10 38 10 C48 10 56 18 60 26 C64 18 72 10 82 10 C94 10 106 18 106 34 C106 50 90 70 60 92 Z",
        }),
      ),
      h("div", { className: "lc-heart-rate" }, h("b", null, String(bpm)), h("span", null, "活跃度 / 100")),
      h(
        "p",
        { className: "lc-heart-caption" },
        "陪伴节律（拟人化） · " + (mood.emotion || "平静") + " · " + (heartbeat.pulse?.activity?.label || "安静地待着"),
      ),
      h("p", { className: "lc-heart-note" }, "示意，不是医学心率"),
      h(
        "svg",
        { className: "lc-ecg", viewBox: "0 0 320 48", "aria-hidden": "true" },
        h("polyline", {
          points:
            "0,26 60,26 72,26 78,10 84,42 90,18 96,26 150,26 162,26 168,8 174,44 180,20 186,26 240,26 252,26 258,12 264,40 270,22 276,26 320,26",
        }),
      ),
    ),
    h(
      "div",
      { className: "lc-heart-grid" },
      [
        ["依恋", needs.attachment],
        ["好奇", needs.curiosity],
        ["精力", needs.energy],
        ["好感", Number(relationship.affection || 0) / 100],
        ["信任", Number(relationship.trust || 0) / 100],
      ].map(([label, value]) =>
        h(
          "div",
          { className: "lc-heart-cell", key: label },
          h("span", null, label),
          h("b", null, String(Math.round(Number(value || 0) * 100)) + "%"),
          h(
            "div",
            { className: "lc-heart-track" },
            h("i", { style: { width: Math.min(100, Number(value || 0) * 100) + "%" } }),
          ),
        ),
      ),
    ),
    h(
      "div",
      { className: "lc-lines lc-heart-lines" },
      h("div", { className: "lc-line" }, h("span", null, "下次可以主动"), h("b", null, fmt(proactive.next_after))),
      h("div", { className: "lc-line" }, h("span", null, "上次主动"), h("b", null, fmt(proactive.last_sent))),
      h(
        "div",
        { className: "lc-line" },
        h("span", null, "发件箱"),
        h("b", null, String(heartbeat.outbox?.fresh || 0) + " 条待补发"),
      ),
      h(
        "div",
        { className: "lc-line" },
        h("span", null, "通道"),
        h("b", null, heartbeat.channel?.describe || heartbeat.channel?.id || "qq"),
      ),
      h("div", { className: "lc-line" }, h("span", null, "人格"), h("b", null, heartbeat.persona || "whale")),
      h(
        "div",
        { className: "lc-line" },
        h("span", null, "日记 / 学习 / 表情 / 群"),
        h(
          "b",
          null,
          [memory.journalDays || 0, memory.learning || 0, memory.stickers || 0, memory.groups || 0].join(" / "),
        ),
      ),
    ),
  );
}
