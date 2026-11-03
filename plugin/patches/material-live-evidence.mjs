/** The segmented fixture intentionally blocks a foreground step after its worker tick. */
export function completedMaterialRound(round) {
  if (round.kind !== "background-driver")
    return (
      round.code === 0 &&
      round.events.some((e) => e.type === "status" && e.phase === "turn_end" && e.reason?.kind === "completed")
    );
  return (
    round.code === 1 &&
    round.events.some((e) => e.type === "status" && e.phase === "turn_end" && e.reason?.kind === "blocked") &&
    !round.events.some((e) => e.type === "tool_call" || e.type === "error") &&
    ["staged", "done", "skipped", "deferred"].includes(round.budget?.runs.at(-1)?.status)
  );
}
