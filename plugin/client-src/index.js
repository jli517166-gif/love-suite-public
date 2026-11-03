import { panelViewportStyle, clampPanelZoom } from "./zoom.js";
import { ReflectionManager } from "./reflection-manager.js";
import { h, React } from "./react.js";
import { overlayOpen, setOverlay, subscribeOverlay, getOverlay } from "./overlay.js";
import { Icon } from "./components.js";
import { Panel } from "./panel.js";
import { PanelBoundary } from "./boundary.js";
import { PANEL_ID } from "./constants.js";
import { CSS } from "./styles.js";

export function FooterTrigger({ wide }) {
  return h(
    "button",
    {
      className: "lc-icon" + (overlayOpen ? " active" : ""),
      onClick: () => setOverlay(true),
      title: "陪伴",
      "aria-label": "陪伴",
    },
    h(Icon, { size: 18 }),
    wide ? h("span", { style: { marginLeft: 8, fontSize: 12 } }, "陪伴") : null,
  );
}

export function OverlayPanel() {
  const open = React.useSyncExternalStore(subscribeOverlay, getOverlay, getOverlay);
  if (!open) return null;
  return h(
    "div",
    {
      className: "lc-overlay",
      onClick: (e) => {
        if (e.target === e.currentTarget) setOverlay(false);
      },
    },
    h("div", null, h(PanelBoundary, null, h(Panel, { onClose: () => setOverlay(false) }))),
  );
}

export const inject = ["slots", "layout"];

export function apply(ctx) {
  let style = document.querySelector("style[data-love-companion-css]");
  if (!style) {
    style = document.createElement("style");
    style.dataset.loveCompanionCss = "true";
    document.head.appendChild(style);
  }
  style.textContent = CSS;

  const layout = ctx.get ? ctx.get("layout") : undefined;
  if (layout && typeof layout.selectPanel === "function") {
    ctx.slots.inject("sidebar.panellist", () =>
      ctx.slots.register({ name: "sidebar.panellist", id: PANEL_ID, order: 7, label: "陪伴" }, (props) =>
        h(Icon, { size: props?.size || 18, active: props?.active }),
      ),
    );
    ctx.slots.inject("main", () =>
      ctx.slots.register({ name: "main", key: PANEL_ID }, () =>
        h(PanelBoundary, null, h(Panel, { onClose: () => layout.selectPanel(null) })),
      ),
    );
    return;
  }

  ctx.slots.inject("sidebar.footer.action", () =>
    ctx.slots.register({ name: "sidebar.footer.action", id: PANEL_ID, order: 7, label: "陪伴" }, (props) =>
      h(FooterTrigger, { wide: props?.wide }),
    ),
  );
  ctx.slots.inject("shell.overlay", () =>
    ctx.slots.register({ name: "shell.overlay", id: PANEL_ID + "-overlay", order: 10 }, () => h(OverlayPanel)),
  );
}

export const __test = { Panel, Icon, panelViewportStyle, clampPanelZoom, ReflectionManager };
