export function clampPanelZoom(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1.5, Math.max(0.8, number)) : 1;
}

export function panelViewportStyle(value) {
  const zoom = clampPanelZoom(value);
  return { zoom, width: "100%", height: "100%", minHeight: 0 };
}

export function automaticPanelZoom(width) {
  // Keep narrow panels readable; their content reflows instead of shrinking.
  return Number.isFinite(width) && width > 0 ? Math.max(1, clampPanelZoom(Math.round((width / 960) * 100) / 100)) : 1;
}
