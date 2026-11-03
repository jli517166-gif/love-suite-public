/** Canonical operation fields/schema; caller policies remain independent subsets. */
function deepFreeze(value) {
  for (const item of Object.values(value)) if (item && typeof item === "object") deepFreeze(item);
  return Object.freeze(value);
}
export const operationDefinitions = deepFreeze({
  create_core: {
    required: ["ref", "title", "summary", "reason", "evidenceIds"],
    hint: "核心必须有依据；可同批创建记忆并用 $引用作为 evidenceIds，不能无依据单独创建。",
  },
  record_memory: {
    required: ["ref", "coreId", "content", "kind", "epistemic", "importance", "reason", "source"],
    hint: "新记忆必须填写 reason 和 source；没有 title 字段。来源引用从 read.sourceHints 或本批 materials 取得。",
  },
  attach_source: {
    required: ["id", "source", "epistemic", "reason"],
    hint: "重复确认只给已有记忆补来源，不再新增相同星点。",
  },
  supersede_memory: {
    required: ["id", "replacementId", "source", "epistemic", "reason"],
    hint: "明确修正才取代，替代项可引用同批新记忆；保留旧正文和历史。",
  },
  adopt_legacy: { required: ["ref", "legacyId", "coreId", "kind", "importance", "reason"] },
  release_legacy: { required: ["id", "reason"] },
  update_core: { required: ["id", "reason"], optional: ["title", "summary", "evidenceIds"] },
  update_memory: {
    required: ["id", "reason"],
    optional: ["coreId", "content", "kind", "epistemic", "importance", "source"],
    hint: "只移动归属时仅填op/id/coreId/reason，不要重复填写正文或认知类型。修改content/source/epistemic时必须给source和epistemic，source.reference逐字引用当前read.sourceHints，不能复用旧会话来源。明确事实修正优先record_memory加supersede_memory保留旧原文。",
  },
  link: { required: ["ref", "source", "target", "relation", "reason"] },
  archive: { required: ["id", "reason"] },
});
export const operationFields = deepFreeze(
  Object.fromEntries(
    Object.entries(operationDefinitions).map(([op, spec]) => [op, ["op", ...spec.required, ...(spec.optional || [])]]),
  ),
);
/** Deliberately narrower than the foreground tool: no migration/archive/body rewrites. */
export const backgroundOperations = Object.freeze([
  "create_core",
  "record_memory",
  "link",
  "attach_source",
  "supersede_memory",
  "update_core",
]);
/** Suggestions do not execute, and may only change organization of already-read records. */
export const proposalFields = deepFreeze({
  update_memory: operationFields.update_memory.filter((key) => ["op", "id", "coreId", "reason"].includes(key)),
  update_core: operationFields.update_core,
  archive: operationFields.archive,
  link: operationFields.link,
});
export function memoryOperationsSchema(minItems = 1, maxItems = 50) {
  const fields = {
    op: {
      type: "string",
      enum: [
        "create_core",
        "record_memory",
        "attach_source",
        "supersede_memory",
        "adopt_legacy",
        "release_legacy",
        "update_core",
        "update_memory",
        "link",
        "archive",
      ],
    },
    legacyId: { type: "string" },
    ref: {
      type: "string",
      pattern: "^\\$",
      description: "新增临时引用必须$开头，例如$new；同批唯一。正式ID在commit成功后返回。",
    },
    id: { type: "string" },
    title: { type: "string" },
    summary: { type: "string" },
    reason: { type: "string" },
    evidenceIds: {
      type: "array",
      items: { type: "string" },
      description:
        "仅填写已有记忆ID或同批record_memory的$临时引用，例如$memory；这里不是消息/会话来源引用，消息来源只放source.reference。",
    },
    coreId: { type: "string" },
    content: { type: "string" },
    kind: { type: "string", enum: ["event", "fact", "preference", "reflection", "skill"] },
    epistemic: { type: "string", enum: ["reported", "inferred", "experienced"] },
    importance: { type: "integer", minimum: 1, maximum: 5 },
    source: {
      oneOf: [
        { type: "string" },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "reference"],
          properties: {
            kind: { type: "string", enum: ["conversation", "tool_result", "reflection", "import"] },
            reference: { type: "string" },
          },
        },
      ],
    },
    target: { type: "string" },
    replacementId: { type: "string" },
    relation: { type: "string" },
  };
  const definitions = operationDefinitions;
  return {
    type: "array",
    minItems,
    maxItems,
    items: {
      oneOf: Object.entries(definitions).map(([op, definition]) => ({
        type: "object",
        additionalProperties: false,
        required: ["op", ...definition.required],
        ...(definition.hint ? { description: definition.hint } : {}),
        properties: {
          op: { type: "string", const: op },
          ...Object.fromEntries(
            [...definition.required, ...(definition.optional || [])].map((key) => [
              key,
              key === "evidenceIds" ? { ...fields[key], minItems: 1 } : fields[key],
            ]),
          ),
        },
      })),
    },
  };
}
