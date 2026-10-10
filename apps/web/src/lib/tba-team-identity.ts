export type TbaTeamRemaps = Record<string, string>;

/** Event aliases describe robots, not permanent team identities. */
export function tbaTeamKey(number: number, remaps: TbaTeamRemaps = {}) {
  return remaps[`frc${number}`] ?? `frc${number}`;
}

export function eventTeamNumber(number: number, remaps: TbaTeamRemaps = {}) {
  return tbaTeamKey(number, remaps).slice(3);
}

export function tbaTeamNumberResolver(remaps: TbaTeamRemaps = {}) {
  const originalByLabel = new Map<string, string>();
  for (const [original, label] of Object.entries(remaps)) {
    if (originalByLabel.has(label)) throw new Error(`TBA maps ${label} to more than one team.`);
    originalByLabel.set(label, original);
  }
  return (key: string) => {
    const numericKey = originalByLabel.get(key) ?? key;
    if (!/^frc\d+$/.test(numericKey)) throw new Error(`TBA team ${key} has no numeric event mapping. The existing schedule was left unchanged.`);
    const number = Number(numericKey.slice(3));
    if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`TBA returned an invalid team key: ${key}.`);
    return number;
  };
}

export function teamNumberLabel(team: { number?: number; team_number?: number; displayNumber?: string } | null | undefined) {
  return team?.displayNumber ?? String(team?.number ?? team?.team_number ?? "—");
}

/** Keep old numeric URLs/searches working as well as event aliases. */
export function teamMatchesQuery(team: { number: number; name: string; displayNumber?: string }, query: string) {
  return `${team.number} ${teamNumberLabel(team)} ${team.name}`.toLowerCase().includes(query.trim().toLowerCase());
}

export function eventTeamNumberFromInput(input: string, remaps: TbaTeamRemaps = {}) {
  const label = input.trim();
  if (!/^\d+[A-Za-z]*$/.test(label)) throw new Error(`Invalid team number: ${input}.`);
  // Existing numeric links always refer to their permanent directory number.
  if (/^\d+$/.test(label)) {
    const number = Number(label);
    if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`Invalid team number: ${input}.`);
    return number;
  }
  const original = Object.entries(remaps).find(([, alias]) => alias.toLowerCase() === `frc${label}`.toLowerCase())?.[0];
  if (!original) throw new Error(`Team ${label} is not mapped in this event.`);
  return Number(original.slice(3));
}

export function resolveTeamLineup<T extends { id: string; number: number; displayNumber?: string }>(inputs: string[], teams: T[]) {
  const byLabel = new Map(teams.flatMap((team) => [[String(team.number).toLowerCase(), team] as const, [teamNumberLabel(team).toLowerCase(), team] as const]));
  const lineup = inputs.map((input) => {
    const team = byLabel.get(input.trim().toLowerCase());
    if (!team) throw new Error(`Team ${input || "—"} is not in this event.`);
    return team;
  });
  if (new Set(lineup.map((team) => team.id)).size !== lineup.length) throw new Error("Each robot in the lineup must be different.");
  return lineup;
}
