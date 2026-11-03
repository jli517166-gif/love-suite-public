/** runtime/messages — extracted behavior; dependencies are explicit ESM imports. */
import { annotateMarkers } from "../emoji.js";

export function toolOutput(text) {
  return {
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "text"],
      properties: { ok: { type: "boolean" }, text: { type: "string" } },
    },
    render: (_args, value) => [{ type: "text", text: String(value?.text || "") }],
  };
}

export function freezeDeep(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return value;
}

export function annotateEmoji(messages) {
  let changed = 0;
  const next = messages.map((message) => {
    if (!message || message.role !== "user" || !Array.isArray(message.content)) return message;
    let touched = false;
    const content = message.content.map((part) => {
      if (!part || part.type !== "text" || typeof part.text !== "string") return part;
      if (!part.text.includes("[QQ表情:")) return part;
      const { text } = annotateMarkers(part.text);
      if (text === part.text) return part;
      touched = true;
      return { ...part, text };
    });
    if (!touched) return message;
    changed += 1;
    return freezeDeep({ ...message, content });
  });
  return changed === 0 ? messages : next;
}

export function messageText(message) {
  if (!Array.isArray(message?.content)) return "";
  return message.content
    .filter((part) => part?.type === "text")
    .map((part) => String(part.text ?? ""))
    .join("");
}

export const SYNTHETIC_USER_SOURCES = new Set([
  "agent-instructions",
  "runtime-context",
  "skill-catalog",
  "time-context",
]);

export function isInboundUserMessage(message) {
  if (!message || message.role !== "user") return false;
  const kind = String(message.source?.kind ?? "");
  if (SYNTHETIC_USER_SOURCES.has(kind)) return false;
  if (kind.startsWith("plugin:") && kind !== "plugin:dsh-onebot") return false;
  // 主动聊天也是从 qq-inject 走的通道消息 / web 通道投的，但那是自己发的
  return !messageText(message).includes("（内心：");
}
