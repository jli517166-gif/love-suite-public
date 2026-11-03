/**
 * dsh-love-semantic
 *
 * 本地语义检索：Transformers.js + ONNX 模型，不调用云 API。
 * 主插件没装这个包时仍走 BM25；装了之后可以把它当 retriever 用。
 */

import os from "node:os";
import path from "node:path";

const DEFAULT_MODEL = "Xenova/bge-small-zh-v1.5";
let extractorPromise = null;
let extractorModel = "";
const cache = new Map();

async function getExtractor(model) {
  if (extractorPromise && extractorModel === model) return extractorPromise;
  extractorModel = model;
  extractorPromise = (async () => {
    let transformers;
    try {
      transformers = await import("@xenova/transformers");
    } catch (error) {
      throw new Error("dsh-love-semantic: 需要先安装 @xenova/transformers（" + error.message + "）");
    }
    if (transformers.env) {
      transformers.env.cacheDir = process.env.LOVE_SEMANTIC_CACHE || path.join(os.homedir(), ".dsh", "love-semantic", "models");
    }
    return transformers.pipeline("feature-extraction", model);
  })();
  return extractorPromise;
}

function normalizeVector(values) {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => value / norm);
}

export async function embedMany(texts, options = {}) {
  const list = (Array.isArray(texts) ? texts : [texts]).map((text) => String(text ?? ""));
  if (!list.length) return [];
  const model = options.model || process.env.LOVE_SEMANTIC_MODEL || DEFAULT_MODEL;
  const extractor = await getExtractor(model);
  const output = await extractor(list, { pooling: "mean", normalize: true });
  const rows = typeof output.tolist === "function" ? output.tolist() : output;
  return (Array.isArray(rows?.[0]) ? rows : [rows]).map((row) => normalizeVector(Array.from(row)));
}

export async function embed(text, options = {}) {
  const [vector] = await embedMany([text], options);
  return vector;
}

export function cosine(a, b) {
  let dot = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) dot += a[index] * b[index];
  return dot;
}

/**
 * 语义排序。返回 [{ item, score }]，分数是 cosine，0–1。
 */
export async function rankBySemantic(query, items, textOf, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Number(options.limit) || 5);
  if (!list.length) return [];
  const model = options.model;
  const queryVector = await embed(query, { model });
  const textOfItem = textOf || ((item) => item?.text || item);
  const docs = list.map((item) => String(textOfItem(item)));
  const vectors = [];
  for (let index = 0; index < docs.length; index += 32) {
    vectors.push(...await embedMany(docs.slice(index, index + 32), { model }));
  }
  return list
    .map((item, index) => ({ item, score: cosine(queryVector, vectors[index]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** 给主插件用的适配器：输入带 text 的条目，返回重新排序后的条目。 */
export async function rerank(query, items, options = {}) {
  const ranked = await rankBySemantic(query, items, (item) => item?.text || item, options);
  return ranked.map((row) => row.item);
}

export default { embed, embedMany, cosine, rankBySemantic, rerank };
