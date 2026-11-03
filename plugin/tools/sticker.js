/** love_sticker tool; policy and implementation stay together. */
import { toolOutput } from "../runtime/messages.js";
import { workspaceOf } from "../runtime/config.js";
import { readStickers, collectSticker } from "../runtime/stickers.js";

export function createStickerTool(cfg) {
  return {
    name: "love_sticker",
    description: "她的小表情包图库：list 看收进来的，search 按名字找，add 手动收一张本地图片。只在 love 工作区可用。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["list", "search", "add"], default: "list" },
        query: { type: "string", description: "search 用：名字关键词" },
        path: { type: "string", description: "add 用：本地图片路径" },
      },
    },
    output: toolOutput(),
    async execute(args, exec) {
      const workspace = workspaceOf(exec, cfg);
      const action = String(args?.action || "list");
      if (action === "add") {
        const entry = collectSticker(workspace, args?.path);
        if (!entry) throw new Error("love_sticker: 收不下这张图（路径不存在/格式不支持/太小或太大）");
        return { ok: true, text: `已收进图库：${entry.name}（${entry.id}）` };
      }
      const store = readStickers(workspace);
      const query = String(args?.query || "")
        .trim()
        .toLowerCase();
      const items =
        action === "search" && query
          ? store.items.filter((item) => String(item.name).toLowerCase().includes(query))
          : store.items;
      if (!items.length) {
        return {
          ok: true,
          text: action === "search" ? `图库里没有匹配「${query}」的` : "图库还是空的（别人发表情包时她会收下）",
        };
      }
      return {
        ok: true,
        text: items
          .slice(-20)
          .map((item) => `- ${item.name}｜${item.addedAt}｜${item.file}`)
          .join("\n"),
      };
    },
  };
}
