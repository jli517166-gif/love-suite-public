/** Opt-in CLI fixture: await the real background worker before a test prompt. Never loaded by normal installation. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createReflectionWorker } from "../reflection-worker.js";
export const name = "love-live-background-fixture";
export const inject = ["llm"];
export function apply(ctx) {
  const root = path.resolve(process.env.LOVE_LIVE_TEST_ROOT || ".");
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("love-live-background-"))
    throw new Error("真实模型验收必须使用独立临时目录");
  const marker = JSON.parse(fs.readFileSync(path.join(root, "fixture.json"), "utf8"));
  const workspace = path.join(root, "workspace");
  if (marker.format !== "love-live-background-fixture" || marker.workspace !== workspace)
    throw new Error("缺少真实验收目录标记");
  // Capture only visible JSON text in this opt-in isolated fixture; never reasoning chunks.
  const service = {
    async prepareCall(...args) {
      const prepared = await ctx.llm.prepareCall(...args);
      return {
        ...prepared,
        stream: async function* (options) {
          let output = "";
          try {
            for await (const chunk of prepared.stream(options)) {
              if (chunk.type === "text-delta") output += chunk.text;
              yield chunk;
            }
          } finally {
            if (process.env.LOVE_CAPTURE_WORKER === "1")
              fs.writeFileSync(
                path.join(root, "worker-raw.json"),
                JSON.stringify({ input: JSON.parse(options.messages[0].content[0].text), output }, null, 2),
              );
            if (process.env.LOVE_CAPTURE_WORKER === "1" && marker.mode === "segmented") {
              const file = path.join(root, "worker-trace.json");
              const trace = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
              trace.push({ input: JSON.parse(options.messages[0].content[0].text), output });
              fs.writeFileSync(file, JSON.stringify(trace, null, 2));
            }
          }
        },
      };
    },
  };
  const worker = createReflectionWorker({
    llm: () => service,
    scopes: () => [{ primary: workspace, workspace, groupId: "" }],
    config: () => ({
      reflectionEnabled: true,
      reflectionBackgroundEnabled: true,
      reflectionCooldownMinutes: 1,
      reflectionMaxCallsPerDay: 6,
      reflectionMaxOutputTokens: 4096,
    }),
    ...(marker.mode === "segmented" ? { now: () => marker.logicalNow || Date.now() } : {}),
  });
  let driven = false;
  const dispose = ctx.on("agent/pre-step", async (payload, next) => {
    if (!driven && path.resolve(payload?.agent?.session?.header?.cwd || ".") === workspace) {
      driven = true;
      if (marker.mode === "segmented") {
        marker.logicalNow = Math.max(Date.now(), (marker.logicalNow || 0) + 61000);
        fs.writeFileSync(path.join(root, "fixture.json"), JSON.stringify(marker));
      }
      await worker.tick();
      // Explicit test driver: end this turn before any foreground LLM/tool step.
      if (marker.mode === "segmented") return { kind: "reject" };
    }
    return next();
  });
  return async () => {
    dispose?.();
    await worker.stop();
  };
}
