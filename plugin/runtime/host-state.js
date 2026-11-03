/** runtime/host-state — extracted behavior; dependencies are explicit ESM imports. */
export const hostState = {
  starUrlAbs: "",
  webServerRef: null,
  agentsRef: null,
  reflectionWorkerRef: null,
  reflectionCaptureRef: null,
};

export const groupSessions = new Map();
