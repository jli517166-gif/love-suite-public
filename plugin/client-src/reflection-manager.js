import { useState, useEffect, useCallback, useRef, h } from "./react.js";
import { api } from "./api.js";

export function ReflectionManager({ groupId = "" }) {
  const [listing, setListing] = useState(null),
    [filter, setFilter] = useState("active"),
    [offset, setOffset] = useState(0);
  const [job, setJob] = useState(null),
    [page, setPage] = useState(null),
    [reason, setReason] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const labels = {
    pending: "等待整理",
    leased: "正在整理",
    needs_review: "待补读",
    failed: "失败",
    done: "已完成",
    skipped: "已跳过",
    active: "待处理",
    all: "全部保留记录",
  };
  const scope = groupId ? `&groupId=${encodeURIComponent(groupId)}` : "";
  const loadList = useCallback(async () => {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const data = await api(`/reflection?status=${filter}&offset=${offset}${scope}`);
      if (current === generation.current) setListing(data);
    } catch (e) {
      if (current === generation.current) setError(String(e.message || e));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }, [scope, filter, offset]);
  useEffect(() => {
    setJob(null);
    setPage(null);
    setReason("");
    void loadList();
    return () => {
      generation.current++;
    };
  }, [loadList]);
  const readJob = async (id) => {
    const current = generation.current;
    setBusy(true);
    setError("");
    setPage(null);
    setReason("");
    try {
      const data = await api(`/reflection?jobId=${encodeURIComponent(id)}${scope}`);
      if (current === generation.current) {
        setJob(data.job);
        setListing((old) => ({ ...old, status: data.status }));
      }
    } catch (e) {
      if (current === generation.current) setError(String(e.message || e));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  const readPage = async (start) => {
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      const data = await api(`/reflection?jobId=${encodeURIComponent(job.id)}&material=1&offset=${start}${scope}`);
      if (current === generation.current) setPage(data.page);
    } catch (e) {
      if (current === generation.current) setError(String(e.message || e));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  const act = async (action) => {
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      await api("/reflection", {
        action,
        groupId,
        jobId: job.id,
        expectedRevision: listing.status.revision,
        reason: reason.trim(),
      });
      const detail = await api(`/reflection?jobId=${encodeURIComponent(job.id)}${scope}`);
      const data = await api(`/reflection?status=${filter}&offset=${offset}${scope}`);
      if (current === generation.current) {
        setJob(detail.job);
        setListing(data);
        setReason("");
      }
    } catch (e) {
      if (current === generation.current) setError(String(e.message || e));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  const locked = job?.status === "leased";
  return h(
    "div",
    { className: "lc-reflection-manager" },
    h("h4", null, groupId ? `群 ${groupId} 的整理批次` : "私聊整理批次"),
    h(
      "p",
      { className: "lc-hint" },
      "查看材料与处理原因。后台共享每日预算；前台工具整理另计。重试不清空预算，进行中的批次不能由面板抢占。",
    ),
    h(
      "div",
      { className: "lc-field" },
      h(
        "select",
        {
          className: "lc-input",
          value: filter,
          "aria-label": "筛选整理批次",
          disabled: busy,
          onChange: (e) => {
            setFilter(e.target.value);
            setOffset(0);
          },
        },
        ...Object.entries(labels).map(([value, label]) => h("option", { key: value, value }, label)),
      ),
      h("button", { className: "lc-btn", disabled: busy, onClick: loadList }, "刷新批次"),
    ),
    error ? h("p", { role: "alert", className: "lc-hint" }, error) : null,
    listing
      ? h(
          "p",
          { className: "lc-hint" },
          `当前范围共 ${listing.total || 0} 批；失败 ${listing.status?.failed || 0}，待补读 ${listing.status?.needs_review || 0}`,
        )
      : h("p", null, "正在读取批次…"),
    ...(listing?.jobs || []).map((item) =>
      h(
        "div",
        { className: "lc-line", key: item.id },
        h(
          "span",
          { style: { overflowWrap: "anywhere" } },
          `${labels[item.status]} · ${item.sessionId} · 第${item.turn}轮`,
          item.lastError ? h("small", { style: { display: "block" } }, item.lastError) : null,
          item.diagnosis ? h("small", { style: { display: "block" } }, item.diagnosis.reason) : null,
        ),
        h("button", { className: "lc-btn", disabled: busy, onClick: () => readJob(item.id) }, "查看批次"),
      ),
    ),
    h(
      "div",
      { className: "lc-field" },
      offset
        ? h(
            "button",
            { className: "lc-btn", disabled: busy, onClick: () => setOffset(Math.max(0, offset - 20)) },
            "上一页批次",
          )
        : null,
      listing?.nextOffset != null
        ? h(
            "button",
            { className: "lc-btn", disabled: busy, onClick: () => setOffset(listing.nextOffset) },
            "下一页批次",
          )
        : null,
    ),
    job
      ? h(
          "div",
          { style: { borderTop: "1px solid var(--lc-border)", marginTop: 12, paddingTop: 12 } },
          h("h4", null, `${labels[job.status]} · 第${job.turn}轮`),
          h("p", { className: "lc-hint", style: { overflowWrap: "anywhere" } }, job.sessionId),
          h("p", null, `领取 ${job.attempts} 次，手动重试 ${job.manualRetries || 0}/3 次`),
          job.lastError ? h("p", null, `原因：${job.lastError}`) : null,
          job.outcome ? h("p", null, `处理结果：${job.outcome.reason}`) : null,
          job.lastManualAction ? h("p", null, `上次操作：${job.lastManualAction.reason}`) : null,
          (job.manualActions || []).length > 1
            ? h(
                "p",
                { className: "lc-hint" },
                "历次重试：" + job.manualActions.map((action) => action.reason).join("；"),
              )
            : null,
          h("p", { className: "lc-hint" }, job.fullTextReason),
          job.diagnosis
            ? h(
                "div",
                { className: "lc-hint" },
                h("p", null, job.diagnosis.reason),
                h(
                  "p",
                  null,
                  job.diagnosis.committed === true
                    ? "已有核心提交回执"
                    : job.diagnosis.committed === false
                      ? "本批尚未提交核心记忆"
                      : "核心提交情况尚未确认，请核对回执",
                ),
                h("p", null, job.diagnosis.recovery),
                job.diagnosis.resumeAt
                  ? h("p", null, "后台下次可用时间：" + new Date(job.diagnosis.resumeAt).toLocaleString())
                  : null,
              )
            : null,
          job.fullTextAvailable
            ? h("button", { className: "lc-btn", disabled: busy, onClick: () => readPage(0) }, "读取全文")
            : null,
          page
            ? h(
                "div",
                null,
                h(
                  "p",
                  { className: "lc-hint" },
                  `${page.complete ? "完整文字快照" : "部分文字，材料仍缺失"} · ${page.offset + 1}–${page.offset + page.text.length} / ${page.totalChars}`,
                ),
                h(
                  "pre",
                  {
                    style: {
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      maxHeight: 320,
                      overflow: "auto",
                      fontFamily: "inherit",
                      fontSize: 13,
                    },
                  },
                  page.text,
                ),
                h(
                  "div",
                  { className: "lc-field" },
                  page.previousOffset != null
                    ? h(
                        "button",
                        { className: "lc-btn", disabled: busy, onClick: () => readPage(page.previousOffset) },
                        "上一页全文",
                      )
                    : null,
                  page.nextOffset != null
                    ? h(
                        "button",
                        { className: "lc-btn", disabled: busy, onClick: () => readPage(page.nextOffset) },
                        "下一页全文",
                      )
                    : null,
                ),
              )
            : h(
                "p",
                { className: "lc-hint" },
                "材料节选：" +
                  job.materials
                    .map((item) => item.text)
                    .join("\n")
                    .slice(0, 1200),
              ),
          !job.outcome
            ? h(
                "div",
                null,
                h("input", {
                  className: "lc-input wide",
                  value: reason,
                  disabled: busy || locked,
                  "aria-label": "批次处理理由",
                  placeholder: "填写重试或跳过的理由",
                  onChange: (e) => setReason(e.target.value),
                  maxLength: 1000,
                }),
                h(
                  "div",
                  { className: "lc-field" },
                  ["failed", "pending"].includes(job.status)
                    ? h(
                        "button",
                        {
                          className: "lc-btn",
                          disabled: busy || !reason.trim() || (job.manualRetries || 0) >= 3,
                          onClick: () => act("retry"),
                        },
                        "重试此批次",
                      )
                    : null,
                  h(
                    "button",
                    { className: "lc-btn", disabled: busy || locked || !reason.trim(), onClick: () => act("skip") },
                    "跳过此批次",
                  ),
                ),
                job.status === "needs_review"
                  ? h(
                      "p",
                      { className: "lc-hint" },
                      "面板用于查看全文；请让她在当前范围通过整理工具领取并顺序补读后提交。缺失附件或旧全文的批次仍需重新提供原材料。",
                    )
                  : null,
              )
            : null,
        )
      : null,
  );
}
