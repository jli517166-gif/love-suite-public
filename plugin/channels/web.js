/**
 * 通道适配器：Web（DSH 自己的会话）。
 *
 * 用途：证明「拔掉 QQ 也有灵魂」——把意图投递给同一个工作区里正开着的会话。
 * 它是临时通道：真正的目标仍然是"指定项目区里的会话"，QQ 只是其中一种传输。
 *
 * 依赖宿主提供的 `ctx.agents`：按会话 cwd 找到目标 agent，用 followup 把意图排进去。
 * 没有打开的会话 = 通道不可用，意图会进发件箱，等下次再试。
 */

let cachedFactory;

/** 懒加载 createUserMessage：拿不到就退化成普通消息对象（DSH 会自己处理）。 */
async function messageFactory() {
  if (cachedFactory !== undefined) return cachedFactory;
  try {
    const llm = await import("@deepseek-ai/dsh-llm");
    cachedFactory = typeof llm.createUserMessage === "function" ? llm.createUserMessage : null;
  } catch {
    cachedFactory = null;
  }
  return cachedFactory;
}

const normalize = (p) => String(p ?? "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/**
 * @param {{workspace: string, agents?: {list: Function}}} options
 */
export function createWebChannel(options = {}) {
  const workspace = options.workspace || "";
  const target = normalize(workspace);

  const findAgent = () => {
    const list = options.agents;
    if (!list || typeof list.list !== "function") return undefined;
    let agents = [];
    try {
      agents = list.list() || [];
    } catch {
      return undefined;
    }
    const matched = agents.filter((agent) => {
      const cwd = agent?.session?.header?.cwd;
      return cwd && normalize(cwd) === target;
    });
    return matched.length ? matched[matched.length - 1] : undefined;
  };

  return {
    id: "web",
    describe() {
      return `web (${workspace})`;
    },
    async available() {
      return Boolean(findAgent());
    },
    /**
     * 把意图排进目标会话。
     * @param {{text: string, voice?: boolean}} intent
     */
    async deliver(intent) {
      const agent = findAgent();
      if (!agent) throw new Error("web channel: 没有打开的会话");
      const text = String(intent?.text ?? "").trim();
      if (!text) throw new Error("web channel: 空的 intent");
      if (typeof agent.followup !== "function") throw new Error("web channel: agent 不支持 followup");

      const make = await messageFactory();
      const message = make
        ? make({ content: [{ type: "text", text }], source: { kind: "plugin:love-companion" } })
        : { role: "user", content: [{ type: "text", text }], source: { kind: "plugin:love-companion" } };

      const result = agent.followup(message);
      return { delivered: true, channel: "web", result };
    },
  };
}
