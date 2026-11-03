import { React, h } from "./react.js";

export class PanelBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error("[love-companion] panel crashed", error);
  }
  render() {
    if (this.state.error) {
      return h(
        "div",
        { className: "lc-root" },
        h(
          "div",
          { className: "lc-head" },
          h(
            "div",
            null,
            h("h1", { className: "lc-title" }, "陪伴"),
            h("p", { className: "lc-presence" }, "面板渲染失败"),
          ),
        ),
        h(
          "p",
          { role: "alert", className: "lc-msg err", style: { padding: "0 34px" } },
          String(this.state.error?.message || this.state.error),
        ),
        h(
          "p",
          { role: "status", "aria-live": "polite", className: "lc-msg", style: { padding: "0 34px" } },
          "把这段报错发给我，我按它修。",
        ),
      );
    }
    return this.props.children;
  }
}
