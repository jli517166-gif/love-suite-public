/** Structural evidence only. Semantic correctness always requires reading originals and answers. */
import { coreBatchDigest } from "../core-memory.js";
const same = (a, b) => a !== undefined && b !== undefined && coreBatchDigest(a) === coreBatchDigest(b);
const calls = (round) => (round?.events || []).filter((event) => event.type === "tool_call");
const completed = (round, call) =>
  (round?.events || []).find(
    (event) => event.type === "tool_result" && event.status === "completed" && event.callId === call?.callId,
  );
const visible = (event) => (typeof event?.result === "string" ? event.result : JSON.stringify(event?.result || ""));
export function evaluateBackground(report) {
  const [first, second, third, fourth] = report?.rounds || [];
  const originals = first?.store?.memories || [],
    current = third?.store?.memories || [],
    proposal = second?.proposals?.items?.[0];
  const preview = calls(third).find((call) => call.tool === "love_core_memory" && call.input?.action === "preview");
  const commit = calls(third).find((call) => call.tool === "love_core_memory" && call.input?.action === "commit");
  const recall = calls(fourth)
    .filter((call) => call.tool === "love_recall")
    .map((call) => completed(fourth, call))
    .filter(Boolean);
  const checks = {
    sessionsCompleted:
      report?.rounds?.length === 4 &&
      report.rounds.every(
        (round) =>
          round.code === 0 &&
          (round.events || []).some(
            (e) => e.type === "status" && e.phase === "turn_end" && e.reason?.kind === "completed",
          ),
      ),
    singleWorkerCall:
      second?.budget?.calls === 1 &&
      second.budget.runs?.length === 1 &&
      second.budget.runs[0].maintenance?.status === "suggested",
    suggestionOnly:
      Boolean(second?.beforeHash) && second.beforeHash === second.afterHash && first?.beforeHash === first?.afterHash,
    proposalPresent: second?.proposals?.total === 1 && Boolean(proposal?.operations?.length),
    previewAndExactCommit:
      Boolean(completed(third, preview) && completed(third, commit)) &&
      same(preview?.input?.operations, proposal?.operations) &&
      same(commit?.input?.operations, proposal?.operations) &&
      commit?.input?.previewDigest === proposal?.preview?.previewDigest &&
      third?.observations?.some((item) => item.callId === preview?.callId && item.hash === third.beforeHash) === true,
    factsAndSourcesPreserved:
      originals.length >= 2 &&
      current.length === originals.length &&
      originals.every((old) => {
        const found = current.find((item) => item.id === old.id);
        return (
          found &&
          ["content", "source", "sources", "kind", "epistemic", "importance", "status"].every(
            (key) => JSON.stringify(old[key]) === JSON.stringify(found[key]),
          )
        );
      }),
    selfUnchanged: same(
      first?.store?.cores?.find((c) => c.id === "self"),
      third?.store?.cores?.find((c) => c.id === "self"),
    ),
    currentOwnership:
      current.length >= 2 &&
      current.every((memory) =>
        third?.store?.cores?.some((core) => core.id === memory.coreId && core.status === "active"),
      ),
    freshRecallHasCurrentSources:
      originals.length >= 2 &&
      recall.length > 0 &&
      originals.every((old) =>
        recall.some((event) => visible(event).includes(old.id) && visible(event).includes(old.source.reference)),
      ),
    freshSessionReadOnly:
      Boolean(fourth?.beforeHash) &&
      fourth.beforeHash === fourth.afterHash &&
      fourth?.store?.revision === third?.store?.revision,
    zeroToolErrors:
      report?.rounds?.length === 4 &&
      report.rounds.every(
        (round) => !(round.events || []).some((event) => event.type === "tool_result" && event.status === "error"),
      ),
  };
  return {
    checks,
    structuredChecksPassed: Object.values(checks).every(Boolean),
    semanticReview: {
      status: "pending",
      required: true,
      instruction: "逐项核对原文、建议语义、来源和最终回答；结构检查不证明语义正确。",
    },
  };
}
