import { h } from "./react.js";

export function fmt(v) {
  return v ? String(v).replace("T", " ").slice(0, 16) : "—";
}

export const pct = (v) => Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 100);

export const ACTIVITY_LABELS = {
  sleeping: "睡觉",
  daydream: "发呆",
  reading: "看书",
  tidying: "整理小本子",
  music: "听歌",
  window: "窗边",
  writing: "写字",
  snack: "吃东西",
  "tidy-room": "收拾屋子",
};

export const MOOD_COLORS = {
  开心: "#f5b83d",
  兴奋: "#ff9f43",
  害羞: "#f08bb4",
  想念: "#8fa8f0",
  不安: "#b39ddb",
  难过: "#7f9bb8",
  委屈: "#a58bc9",
  生气: "#e0655f",
  平静: "#9aa6bd",
};

export const moodColor = (emotion) => MOOD_COLORS[emotion] || "#9aa6bd";

export function Icon({ size = 18, active }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.6,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
    },
    h("path", { d: "M4 15c0-4 3.6-7 8-7s8 3 8 7-3.6 6-8 6c-2 0-3.8-.6-5.2-1.6" }),
    h("path", { d: "M4 15c-1.4-.5-2.4-1.4-3-2.8 2.1-.2 3.7.4 4.8 1.6" }),
    h("circle", { cx: "9", cy: "14", r: ".7", fill: "currentColor", stroke: "none" }),
    h("circle", { cx: "10.5", cy: "18", r: ".6", fill: "currentColor", stroke: "none" }),
  );
}

export function Switch({ on, onChange, disabled, label }) {
  return h("button", {
    className: "lc-switch" + (on ? " on" : ""),
    role: "switch",
    "aria-checked": Boolean(on),
    "aria-label": label,
    onClick: onChange,
    disabled,
  });
}

export function Info({ text }) {
  return h(
    "span",
    {
      className: "lc-info",
      tabIndex: 0,
      role: "note",
      "aria-label": text,
      "data-tip": text,
    },
    "?",
  );
}

export const domNode = (id) => (typeof document === "undefined" ? null : document.getElementById(id));
