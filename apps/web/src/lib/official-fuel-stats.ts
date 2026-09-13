type OfficialMatch = {
  red_teams?: string[];
  blue_teams?: string[];
  tba_score_breakdown?: Record<string, unknown> | null;
};

type FuelAverages = { totalFuel: number; autoFuel: number; teleopFuel: number };

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

/**
 * TBA publishes FUEL totals per alliance, not per robot. For each team, use the
 * average official alliance FUEL total from the played matches it appeared in.
 */
export function officialFuelAverages(matches: OfficialMatch[], teamId: string): FuelAverages | null {
  const samples: FuelAverages[] = [];

  for (const match of matches) {
    const alliance = match.red_teams?.includes(teamId) ? "red" : match.blue_teams?.includes(teamId) ? "blue" : null;
    if (!alliance) continue;

    const breakdown = match.tba_score_breakdown?.[alliance] as Record<string, unknown> | undefined;
    const hubScore = breakdown?.hubScore as Record<string, unknown> | undefined;
    if (!hubScore) continue;

    samples.push({
      totalFuel: number(hubScore.totalCount ?? hubScore.totalPoints),
      autoFuel: number(hubScore.autoCount ?? hubScore.autoPoints),
      teleopFuel: number(hubScore.teleopCount ?? hubScore.teleopPoints),
    });
  }

  if (!samples.length) return null;
  const average = (key: keyof FuelAverages) => samples.reduce((total, sample) => total + sample[key], 0) / samples.length;
  return { totalFuel: average("totalFuel"), autoFuel: average("autoFuel"), teleopFuel: average("teleopFuel") };
}
