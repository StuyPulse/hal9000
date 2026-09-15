type MatchLabelInput = {
  match_number: number | null;
  match_type: string | null;
  tba_match_key?: string | null;
};

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
  if (final) return `Final ${final[1]} · Match ${final[2]}`;
  if (tiebreaker) return `Tiebreaker ${tiebreaker[1]} · Match ${tiebreaker[2]}`;

  const number = match_number ?? "—";
  if (match_type === "qualification") return `Qualification ${number}`;
  if (match_type === "practice") return `Practice ${number}`;
  return `Playoff ${number}`;
}
