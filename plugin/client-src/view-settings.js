import { h } from "./react.js";
import { Info, Switch, fmt } from "./components.js";
import { ReflectionManager } from "./reflection-manager.js";

/** Explicit view inputs keep rendering independent from state ownership. */
export function renderSettings({
  settingsMode,
  persona,
  busy,
  deleteKey,
  deletePersonaNow,
  installOpen,
  newKey,
  newName,
  newDesc,
  newBody,
  installPersonaSkill,
  doctorText,
  form,
  extraWs,
  saveWorkspaces,
  status,
  stickers,
  stickerQuery,
  stickerPath,
  addSticker,
  exportMemoryFile,
  importMemoryFile,
  dryRun,
  preview,
  msg,
  err,
  setSettingsMode,
  switchPersona,
  setDeleteKey,
  setInstallOpen,
  setNewKey,
  setNewName,
  setNewDesc,
  setNewBody,
  setField,
  save,
  setExtraWs,
  dirty,
  load,
  sendGroupTest,
  setStickerQuery,
  setStickerPath,
  setConfirmText,
  setConfirmOpen,
}) {
  return h(
    "div",
    { className: "lc-body lc-settings" },
    settingsMode === "menu"
      ? h(
          "div",
          { className: "lc-settings-menu" },
          h("p", { className: "lc-hint" }, "选一个功能进入；不再把所有设置铺在一页里。"),
          [
            ["persona", "人格", "说话方式"],
            ["workspace", "聊天工作区", "目录与隔离"],
            ["proactive", "主动聊天", "间隔、时段、频率"],
            ["reflection", "后台整理", "记忆提炼、预算与结果"],
            ["voice", "语音提示", "只影响提示"],
            ["stickers", "表情包图库", "收图与手动添加"],
            ["data", "数据", "导入导出"],
            ["features", "功能开关", "即时生效"],
            ["preview", "预览", "只生成不发送"],
          ].map(([key, label, hint]) =>
            h(
              "button",
              { key, className: "lc-settings-card", onClick: () => setSettingsMode(key) },
              h("b", null, label),
              h("span", null, hint),
              h("em", null, "进入"),
            ),
          ),
        )
      : h("button", { className: "lc-settings-back", onClick: () => setSettingsMode("menu") }, "← 返回设置"),
    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "人格"),
      h("p", { className: "lc-hint" }, "只影响说话方式；记忆、工具、学会的事都不随人格变。切换后新开一轮对话生效。"),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "当前人格"),
        h(
          "select",
          {
            className: "lc-input",
            style: { width: 180 },
            value: (persona && persona.current) || "whale",
            onChange: (e) => switchPersona(e.target.value),
            disabled: busy,
            "aria-label": "人格",
          },
          (persona && persona.items && persona.items.length
            ? persona.items
            : [{ key: "whale", name: "鲸鱼娘·大肥鱼" }]
          ).map((item) => h("option", { key: item.key, value: item.key }, item.name)),
        ),
      ),
      h(
        "div",
        { className: "lc-row", style: { marginTop: 10 } },
        h("label", null, "删除人格", h(Info, { text: "只删人格 skill；记忆不受影响；当前人格不能删" })),
        h(
          "div",
          { className: "lc-field" },
          h(
            "select",
            {
              className: "lc-input",
              value: deleteKey || "",
              onChange: (e) => setDeleteKey(e.target.value),
              "aria-label": "要删除的人格",
            },
            h("option", { value: "" }, "选择…"),
            (persona?.items || [])
              .filter((item) => item.key !== "none" && item.key !== persona?.current)
              .map((item) => h("option", { key: item.key, value: item.key }, item.name)),
          ),
          h("button", { className: "lc-btn", onClick: deletePersonaNow, disabled: busy || !deleteKey }, "删除"),
        ),
      ),
      h(
        "div",
        { className: "lc-field", style: { marginTop: 10 } },
        h(
          "button",
          {
            className: "lc-btn",
            onClick: () => setInstallOpen((v) => !v),
            disabled: busy,
          },
          installOpen ? "取消安装" : "安装人格 skill…",
        ),
        h("span", { className: "lc-hint", style: { margin: 0 } }, "会新建 skill 文件并登记到 persona.py"),
      ),
      installOpen
        ? h(
            "div",
            { className: "lc-install" },
            h(
              "div",
              { className: "lc-row" },
              h("label", null, "key"),
              h("input", {
                className: "lc-input",
                placeholder: "neko",
                value: newKey || "",
                onChange: (e) => setNewKey(e.target.value),
                "aria-label": "人格 key",
              }),
            ),
            h(
              "div",
              { className: "lc-row" },
              h("label", null, "显示名"),
              h("input", {
                className: "lc-input wide",
                placeholder: "猫娘",
                value: newName || "",
                onChange: (e) => setNewName(e.target.value),
                "aria-label": "人格显示名",
              }),
            ),
            h(
              "div",
              { className: "lc-row" },
              h("label", null, "一句话描述"),
              h("input", {
                className: "lc-input wide",
                placeholder: "可选：她是谁、怎么说话",
                value: newDesc || "",
                onChange: (e) => setNewDesc(e.target.value),
                "aria-label": "人格描述",
              }),
            ),
            h("textarea", {
              className: "lc-textarea",
              placeholder: "可选：口吻、称呼、情绪表达、边界（会写进 SKILL.md；留空用占位模板）",
              value: newBody || "",
              onChange: (e) => setNewBody(e.target.value),
              "aria-label": "人格正文",
            }),
            h(
              "div",
              { className: "lc-field" },
              h(
                "button",
                {
                  className: "lc-btn primary",
                  onClick: installPersonaSkill,
                  disabled: busy || !(newKey || "").trim() || !(newName || "").trim(),
                },
                "安装",
              ),
            ),
          )
        : null,
      doctorText ? h("pre", { className: "lc-pre" }, doctorText) : null,
    ),

    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "聊天工作区"),
      h("p", { className: "lc-hint" }, "插件只在这个目录的会话里生效；记忆、心情、心跳都跟着它走。"),
      h(
        "div",
        { className: "lc-field" },
        h("input", {
          className: "lc-input wide",
          value: form.workspace || "",
          onChange: (e) => setField("workspace", e.target.value),
          placeholder: "E:\\path\\to\\love",
          "aria-label": "聊天工作区路径",
        }),
        h(
          "button",
          {
            className: "lc-btn primary",
            onClick: () => save({ workspace: form.workspace }),
            disabled: busy,
          },
          "保存",
        ),
      ),
      h(
        "div",
        { className: "lc-row", style: { alignItems: "flex-start", marginTop: 14 } },
        h("label", null, "额外工作区", h(Info, { text: "一行一个路径。每个区一套记忆/心跳；留空只用主工作区" })),
        h(
          "div",
          { className: "lc-field", style: { flex: "1 1 320px", flexDirection: "column", alignItems: "stretch" } },
          h("textarea", {
            className: "lc-textarea",
            value: extraWs || "",
            onChange: (e) => {
              setExtraWs(e.target.value);
              dirty.current = true;
            },
            placeholder: "E:\\path\\to\\another-workspace",
            "aria-label": "额外工作区",
          }),
          h(
            "div",
            { className: "lc-field" },
            h("button", { className: "lc-btn primary", onClick: saveWorkspaces, disabled: busy }, "保存工作区列表"),
            h("button", { className: "lc-btn", onClick: () => load(), disabled: busy }, "还原"),
          ),
        ),
      ),
    ),

    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "主动聊天"),
      h("p", { className: "lc-hint" }, "她会不会主动找你、隔多久、什么时段。心跳是本地计算，不受这里影响。"),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "允许主动开口"),
        h(Switch, {
          on: Boolean(status.proactiveEnabled),
          label: "主动聊天",
          disabled: busy,
          onChange: () => save({ proactiveEnabled: !status.proactiveEnabled }),
        }),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "间隔范围", h(Info, { text: "两次主动之间随机等这么久（小时）" })),
        h(
          "div",
          { className: "lc-field" },
          h("input", {
            className: "lc-input",
            type: "number",
            min: 1,
            max: 72,
            value: form.minGapHours ?? 4,
            "aria-label": "最短间隔",
            onChange: (e) => setField("minGapHours", Number(e.target.value)),
          }),
          h("span", { style: { color: "var(--lc-muted)" } }, "—"),
          h("input", {
            className: "lc-input",
            type: "number",
            min: 1,
            max: 72,
            value: form.maxGapHours ?? 12,
            "aria-label": "最长间隔",
            onChange: (e) => setField("maxGapHours", Number(e.target.value)),
          }),
          h("span", { className: "lc-unit" }, "小时"),
        ),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "活跃时段", h(Info, { text: "这个时段之外不主动，也不补发积压消息" })),
        h(
          "div",
          { className: "lc-field" },
          h("input", {
            className: "lc-input",
            type: "number",
            min: 0,
            max: 23,
            value: form.activeStartHour ?? 10,
            "aria-label": "开始小时",
            onChange: (e) => setField("activeStartHour", Number(e.target.value)),
          }),
          h("span", { style: { color: "var(--lc-muted)" } }, "—"),
          h("input", {
            className: "lc-input",
            type: "number",
            min: 1,
            max: 24,
            value: form.activeEndHour ?? 22,
            "aria-label": "结束小时",
            onChange: (e) => setField("activeEndHour", Number(e.target.value)),
          }),
          h("span", { className: "lc-unit" }, "点"),
        ),
      ),
      h(
        "details",
        { className: "lc-advanced" },
        h("summary", null, "更多节奏"),
        h(
          "div",
          { className: "lc-row" },
          h("label", null, "当天跳过概率", h(Info, { text: "0–1。越高越容易「今天算了」，不主动" })),
          h("input", {
            className: "lc-input",
            type: "number",
            step: "0.05",
            min: 0,
            max: 1,
            value: form.dailySkipChance ?? 0.45,
            "aria-label": "跳过概率",
            onChange: (e) => setField("dailySkipChance", Number(e.target.value)),
          }),
        ),
        h(
          "div",
          { className: "lc-row" },
          h("label", null, "每天最多", h(Info, { text: "一天最多主动几次；默认 1" })),
          h("input", {
            className: "lc-input",
            type: "number",
            min: 1,
            max: 5,
            value: form.maxPerDay ?? 1,
            "aria-label": "每天最多",
            onChange: (e) => setField("maxPerDay", Number(e.target.value)),
          }),
        ),
        h(
          "div",
          { className: "lc-row" },
          h("label", null, "每周最多", h(Info, { text: "一周最多主动几次" })),
          h("input", {
            className: "lc-input",
            type: "number",
            min: 1,
            max: 50,
            value: form.maxPerWeek ?? 3,
            "aria-label": "每周最多",
            onChange: (e) => setField("maxPerWeek", Number(e.target.value)),
          }),
        ),
        h(
          "div",
          { className: "lc-row" },
          h("label", null, "刚聊完静默", h(Info, { text: "刚聊完这么多分钟内不主动（分钟）" })),
          h("input", {
            className: "lc-input",
            type: "number",
            min: 0,
            max: 1440,
            value: form.quietAfterChatMinutes ?? 120,
            "aria-label": "静默分钟",
            onChange: (e) => setField("quietAfterChatMinutes", Number(e.target.value)),
          }),
        ),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "群聊主动", h(Info, { text: "允许主动消息发到群；需要下面填群号。默认关" })),
        h(Switch, {
          on: form.groupProactive === true,
          disabled: busy,
          onChange: () => save({ groupProactive: !(form.groupProactive === true) }),
          label: "群聊主动",
        }),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "群聊上下文", h(Info, { text: "@ 之后带多少条群历史（0–100），默认 20" })),
        h("input", {
          className: "lc-input",
          type: "number",
          min: 0,
          max: 100,
          value: form.groupContextMessages ?? 20,
          onChange: (e) => setField("groupContextMessages", Number(e.target.value)),
          "aria-label": "群聊上下文条数",
        }),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "群号", h(Info, { text: "逗号或空格分隔；只对这些群主动" })),
        h("input", {
          className: "lc-input wide",
          value: (form.groupIds || []).join(","),
          onChange: (e) =>
            setField(
              "groupIds",
              e.target.value
                .split(/[,\s]+/)
                .map((s) => s.trim())
                .filter(Boolean),
            ),
          placeholder: "123456789,987654321",
          "aria-label": "群号",
        }),
      ),
      h(
        "div",
        { className: "lc-field", style: { marginTop: 8 } },
        h(
          "button",
          {
            className: "lc-btn",
            onClick: () => sendGroupTest((form.groupIds || [])[0]),
            disabled: busy || !(form.groupIds || []).length,
          },
          "发一条到群",
        ),
        h("span", { className: "lc-hint", style: { margin: 0 } }, "用第一个群号，立刻发一条测试"),
      ),
      h(
        "div",
        { className: "lc-field", style: { marginTop: 8 } },
        h("button", { className: "lc-btn", onClick: () => load(), disabled: busy }, "重读状态"),
        h(
          "button",
          {
            className: "lc-btn primary",
            onClick: () =>
              save({
                minGapHours: Number(form.minGapHours ?? 4),
                maxGapHours: Number(form.maxGapHours ?? 12),
                activeStartHour: Number(form.activeStartHour ?? 10),
                activeEndHour: Number(form.activeEndHour ?? 22),
                dailySkipChance: Number(form.dailySkipChance ?? 0.45),
                maxPerDay: Number(form.maxPerDay ?? 1),
                maxPerWeek: Number(form.maxPerWeek ?? 3),
                quietAfterChatMinutes: Number(form.quietAfterChatMinutes ?? 120),
                groupIds: (form.groupIds || []).map((s) => String(s).trim()).filter(Boolean),
                groupContextMessages: Number(form.groupContextMessages ?? 20),
              }),
            disabled: busy,
          },
          "保存",
        ),
      ),
    ),

    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "语音提示"),
      h("p", { className: "lc-hint" }, "她偶尔在主动消息里带一句「可以发语音」；真正发不发由 agent 决定。"),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "出现概率", h(Info, { text: "0–1。语音提示出现的概率，0 就是不提示" })),
        h("input", {
          className: "lc-input",
          type: "number",
          step: "0.01",
          min: 0,
          max: 1,
          value: form.voiceChance ?? 0.08,
          "aria-label": "语音概率",
          onChange: (e) => setField("voiceChance", Number(e.target.value)),
        }),
      ),
      h(
        "div",
        { className: "lc-row" },
        h("label", null, "冷却", h(Info, { text: "两次语音提示至少隔多少小时" })),
        h("input", {
          className: "lc-input",
          type: "number",
          min: 1,
          max: 168,
          value: form.voiceCooldownHours ?? 8,
          "aria-label": "语音冷却",
          onChange: (e) => setField("voiceCooldownHours", Number(e.target.value)),
        }),
      ),
      h(
        "div",
        { className: "lc-field", style: { marginTop: 8 } },
        h(
          "button",
          {
            className: "lc-btn primary",
            onClick: () =>
              save({
                voiceChance: Number(form.voiceChance ?? 0.08),
                voiceCooldownHours: Number(form.voiceCooldownHours ?? 8),
              }),
            disabled: busy,
          },
          "保存",
        ),
      ),
    ),

    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "表情包图库"),
      h(
        "p",
        { className: "lc-hint" },
        Array.isArray(stickers)
          ? `一共 ${stickers.length} 张。别人发的会自动收；也可以手动加一张本地图片。`
          : "正在读取…",
      ),
      h(
        "div",
        { className: "lc-field", style: { margin: "4px 0 10px" } },
        h("input", {
          className: "lc-input wide",
          value: stickerQuery || "",
          onChange: (e) => setStickerQuery(e.target.value),
          placeholder: "搜图库名字",
          "aria-label": "搜索表情包",
        }),
      ),
      (Array.isArray(stickers) ? stickers : [])
        .filter((item) => !stickerQuery || String(item.name || "").includes(stickerQuery))
        .slice(0, 10)
        .map((item) =>
          h(
            "div",
            { className: "lc-line", key: item.id || item.file },
            h("span", null, item.name || "未命名"),
            h(
              "b",
              { style: { fontSize: 12, color: "var(--lc-muted)", fontWeight: 400 } },
              String(item.addedAt || "").slice(0, 10),
            ),
          ),
        ),
      h(
        "div",
        { className: "lc-row", style: { marginTop: 8 } },
        h("label", null, "手动加一张"),
        h(
          "div",
          { className: "lc-field" },
          h("input", {
            className: "lc-input wide",
            value: stickerPath || "",
            onChange: (e) => setStickerPath(e.target.value),
            placeholder: "图片绝对路径（gif/png/jpg/webp）",
            "aria-label": "表情包路径",
          }),
          h(
            "button",
            { className: "lc-btn", onClick: addSticker, disabled: busy || !(stickerPath || "").trim() },
            "添加",
          ),
        ),
      ),
    ),

    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "数据"),
      h(
        "p",
        { className: "lc-hint" },
        "换机器或做备份：导出是一份 JSON；导入会覆盖当前记忆，导入前自动整份备份。表情包图片不包含在导出里。",
      ),
      h(
        "div",
        { className: "lc-field" },
        h("button", { className: "lc-btn primary", onClick: exportMemoryFile, disabled: busy }, "导出记忆"),
        h(
          "label",
          { className: "lc-btn", style: { cursor: "pointer" } },
          "导入记忆",
          h("input", {
            type: "file",
            accept: "application/json,.json",
            style: { display: "none" },
            onChange: importMemoryFile,
          }),
        ),
      ),
    ),

    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "功能开关"),
      h("p", { className: "lc-hint" }, "点一下立刻生效，不用重启。"),
      ...[
        ["emojiEnabled", "QQ 表情注解", "把 [QQ表情:id] 注解成名称和 QQ 语义"],
        ["moodInjection", "心情注入", "每轮把心情送进上下文，约 +30 token/轮"],
        ["autoAppraisal", "自动好感", "模型忘了记时，按话里的强信号 ±1"],
        ["autoLearn", "自动学习", "从「教你/记住/以后可以」这类话里自动记能力；可能误记，可关"],
        [
          "reflectionEnabled",
          "会话记忆整理",
          "轮次结束后收集真实文字材料；关闭时也会取消后台提炼。收集本身不额外调用模型",
        ],
        [
          "reflectionBackgroundEnabled",
          "后台提炼记忆",
          "用原会话模型独立整理，会额外消耗模型预算；关闭后仍可在正常对话中手动整理",
        ],
        ["composeEnabled", "模板直发", "主动消息写成一句人话；配 HTTP 直发时省一轮模型调用"],
      ].map(([key, label, hint]) =>
        h(
          "div",
          { className: "lc-row", key },
          h("label", null, label, h(Info, { text: hint })),
          h(Switch, {
            on: form[key] !== false,
            label,
            disabled: busy,
            onChange: () => save({ [key]: !(form[key] !== false) }),
          }),
        ),
      ),
    ),

    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "后台整理"),
      h(
        "p",
        { className: "lc-hint" },
        "她根据真实对话自主提炼记忆，会使用原会话模型并额外消耗预算。同工作区的私聊和群共享调用上限；不发送整理消息。",
      ),
      h(
        "p",
        null,
        status.reflectionWorker?.enabled
          ? status.reflectionWorker.running
            ? "正在整理"
            : status.reflectionWorker.reason || "等待材料"
          : "后台整理已暂停",
      ),
      h(
        "p",
        { className: "lc-hint" },
        "今日调用：" +
          (status.reflectionWorker?.dailyCalls || 0) +
          " / " +
          (status.reflectionWorker?.maxCallsPerDay || 6) +
          "（UTC 日）",
      ),
      status.reflectionCapture
        ? h(
            "p",
            { className: "lc-hint" },
            `本次启动后，本工作区（含群）收到 ${status.reflectionCapture.scopedTurns} 次轮次结束，入队 ${status.reflectionCapture.queuedBatches} 批；关闭收集 ${status.reflectionCapture.disabledTurns} 次，收集失败 ${status.reflectionCapture.errorCount} 次。` +
              (status.reflectionCapture.lastQueuedAt
                ? `最近入队：${fmt(new Date(status.reflectionCapture.lastQueuedAt).toISOString())}。`
                : "尚未观察到新批次，请在配置的工作区正常对话后刷新。"),
          )
        : null,
      status.reflectionCapture?.lastError ? h("p", { className: "lc-hint" }, status.reflectionCapture.lastError) : null,
      status.reflectionCapture?.overflowCount
        ? h("p", { className: "lc-hint" }, "曾出现队列满载，需先处理已有批次。")
        : null,
      ...[
        ["reflectionCooldownMinutes", "整理间隔（分钟）", 10, 1, 1440],
        ["reflectionMaxCallsPerDay", "每天最多调用", 6, 1, 24],
        ["reflectionMaxOutputTokens", "单次输出 token 上限", 4096, 512, 8192],
      ].map(([key, label, fallback, min, max]) =>
        h(
          "div",
          { className: "lc-row", key },
          h("label", null, label),
          h("input", {
            className: "lc-input",
            type: "number",
            min,
            max,
            value: form[key] ?? fallback,
            "aria-label": label,
            onChange: (e) => setField(key, e.target.value),
          }),
        ),
      ),
      h(
        "div",
        { className: "lc-field" },
        h(
          "button",
          {
            className: "lc-btn primary",
            disabled: busy,
            onClick: () =>
              save({
                reflectionCooldownMinutes: Number(form.reflectionCooldownMinutes ?? 10),
                reflectionMaxCallsPerDay: Number(form.reflectionMaxCallsPerDay ?? 6),
                reflectionMaxOutputTokens: Number(form.reflectionMaxOutputTokens ?? 4096),
              }),
          },
          "保存整理预算",
        ),
        h(
          "button",
          {
            className: "lc-btn",
            disabled: busy,
            onClick: () => save({ reflectionBackgroundEnabled: !(form.reflectionBackgroundEnabled !== false) }),
          },
          form.reflectionBackgroundEnabled !== false ? "暂停后台整理" : "继续后台整理",
        ),
      ),
      status.reflectionWorker?.lastResult
        ? h("p", { className: "lc-hint" }, "最近结果：" + status.reflectionWorker.lastResult.reason)
        : null,
      status.reflectionWorker?.lastResult?.usage
        ? h(
            "p",
            { className: "lc-hint" },
            "宿主报告用量：输入 " +
              status.reflectionWorker.lastResult.usage.inputTokens +
              " · 输出 " +
              status.reflectionWorker.lastResult.usage.outputTokens +
              " token",
          )
        : null,
      status.reflectionWorker?.nextAllowedAt
        ? h(
            "p",
            { className: "lc-hint" },
            "冷却至：" + fmt(new Date(status.reflectionWorker.nextAllowedAt).toISOString()),
          )
        : null,
      h(ReflectionManager, { groupId: "", key: "private-reflection" }),
    ),

    h(
      "section",
      { className: "lc-group" },
      h("h3", null, "预览"),
      h("p", { className: "lc-hint" }, "只生成一条主动提示，不会发送。"),
      h(
        "div",
        { className: "lc-field" },
        h("button", { className: "lc-btn", onClick: dryRun, disabled: busy }, "生成一条"),
      ),
      preview ? h("pre", { className: "lc-pre" }, preview) : null,
    ),

    h(
      "section",
      { className: "lc-group lc-danger" },
      h("h3", null, "恢复出厂设置"),
      h(
        "p",
        { className: "lc-hint" },
        "清空称呼、偏好、边界、关系与好感、心情、日记、小生活、自我叙事、表情包图库、发件箱和调度状态，回到刚认识。",
        h("br"),
        "会先把整份记忆备份到工作区的 .reset-backups 下，可以手动恢复。meow 的长期记忆由另一个插件管，不在这里清。",
      ),
      h(
        "div",
        { className: "lc-field" },
        h(
          "button",
          {
            className: "lc-btn danger",
            onClick: () => {
              setConfirmText("");
              setConfirmOpen(true);
            },
            disabled: busy,
          },
          "恢复出厂设置…",
        ),
      ),
    ),

    msg ? h("p", { role: "status", "aria-live": "polite", className: "lc-msg" }, msg) : null,
    err ? h("p", { role: "alert", className: "lc-msg err" }, err) : null,
  );
}
