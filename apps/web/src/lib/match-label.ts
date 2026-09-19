type MatchLabelInput = {
  match_number: number | null;
  match_type: string | null;
  tba_match_key?: string | null;
};

export type ManualMatchDetails = {
  stage?: unknown;
  label?: unknown;
};

const manualStageNames: Record<string, string> = {
  qualification: "Qualification",
  practice: "Practice",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
};

/** A human-readable label for a manual report, including its round and number. */
export function manualMatchLabel({ stage, label }: ManualMatchDetails) {
  const rawStage = typeof stage === "string" ? stage.trim() : "";
  const rawLabel = typeof label === "string" ? label.trim() : "";
  const normalizedStage = rawStage.toLowerCase();
  const stageLabel = manualStageNames[normalizedStage]
    ?? (normalizedStage === "other" || normalizedStage === "other / exception" || normalizedStage === "manual match" ? "" : rawStage);
  return rawLabel ? `${stageLabel || "Match"} ${rawLabel}` : stageLabel || "Match details unavailable";
}

export function manualMatchIsCompetitive({ stage }: ManualMatchDetails) {
  return ["qualification", "quarterfinal", "semifinal", "final", "playoff"].includes(typeof stage === "string" ? stage.trim().toLowerCase() : "");
}

/** A compact label for dense chart axes; the full label remains available in surrounding UI. */
export function compactMatchLabel({ match_number, match_type, tba_match_key }: MatchLabelInput) {
  const key = tba_match_key ?? "";
  const qualification = key.match(/_qm(\d+)$/);
  const practice = key.match(/_pm(\d+)$/);
  const quarterfinal = key.match(/_qf(\d+)m(\d+)$/);
  const semifinal = key.match(/_sf(\d+)m(\d+)$/);
  const final = key.match(/_f(\d+)m(\d+)$/);
  const tiebreaker = key.match(/_ef(\d+)m(\d+)$/);

  if (qualification) return `Q${qualification[1]}`;
  if (practice) return `P${practice[1]}`;
  if (quarterfinal) return `QF${quarterfinal[1]}${quarterfinal[2]}`;
  if (semifinal) return `SF${semifinal[1]}${semifinal[2]}`;
  if (final) return `F${final[2]}`;
  if (tiebreaker) return `EF${tiebreaker[2]}`;

  const number = match_number ?? "—";
  if (match_type === "qualification") return `Q${number}`;
  if (match_type === "practice") return `P${number}`;
  return `SF${number}`;
}

export function compactManualMatchLabel({ stage, label }: ManualMatchDetails) {
  const number = typeof label === "string" ? label.trim() : "";
  const normalizedStage = typeof stage === "string" ? stage.trim().toLowerCase() : "";
  if (!number) return normalizedStage === "other" ? "Manual" : "Match";
  if (normalizedStage === "qualification") return `Q${number}`;
  if (normalizedStage === "practice") return `P${number}`;
  if (normalizedStage === "quarterfinal") return `QF${number}`;
  if (normalizedStage === "semifinal" || normalizedStage === "playoff") return `SF${number}`;
  if (normalizedStage === "final") return `F${number}`;
  return number;
}

export function matchLabel({ match_number, match_type, tba_match_key }: MatchLabelInput) {
  const key = tba_match_key ?? "";
  const qualification = key.match(/_qm(\d+)$/);
  const practice = key.match(/_pm(\d+)$/);
  const quarterfinal = key.match(/_qf(\d+)m(\d+)$/);
  const semifinal = key.match(/_sf(\d+)m(\d+)$/);
  const final = key.match(/_f(\d+)m(\d+)$/);
  const tiebreaker = key.match(/_ef(\d+)m(\d+)$/);

  if (qualification) return `Qualification ${qualification[1]}`;
  if (practice) return `Practice ${practice[1]}`;
  if (quarterfinal) return `Quarterfinal ${quarterfinal[1]} · Match ${quarterfinal[2]}`;
  if (semifinal) return `Semifinal ${semifinal[1]} · Match ${semifinal[2]}`;
  if (final) return `Final ${final[2]}`;
  if (tiebreaker) return `Tiebreaker ${tiebreaker[2]}`;

  const number = match_number ?? "—";
  if (match_type === "qualification") return `Qualification ${number}`;
  if (match_type === "practice") return `Practice ${number}`;
  return `Playoff Match ${number}`;
}

export function matchRoundOrder({ match_type, tba_match_key }: Pick<MatchLabelInput, "match_type" | "tba_match_key">) {
  if (match_type === "practice") return 0;
  if (match_type === "qualification") return 1;
  const key = tba_match_key ?? "";
  if (/_qf\d+m\d+$/.test(key)) return 2;
  if (/_sf\d+m\d+$/.test(key)) return 3;
  if (/_f\d+m\d+$/.test(key)) return 4;
  if (/_ef\d+m\d+$/.test(key)) return 5;
  return 2;
}
