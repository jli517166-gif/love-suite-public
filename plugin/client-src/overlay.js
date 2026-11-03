export let overlayOpen = false;

export const overlayListeners = new Set();

export function subscribeOverlay(cb) {
  overlayListeners.add(cb);
  return () => overlayListeners.delete(cb);
}

export function getOverlay() {
  return overlayOpen;
}

export function setOverlay(v) {
  overlayOpen = v;
  for (const cb of overlayListeners) cb(v);
}
