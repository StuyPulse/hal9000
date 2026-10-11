/** Moving a team to the other alliance changes the match identity too. */
export function matchTeamsChanged(current: { red_teams: string[]; blue_teams: string[] }, redTeamIds: string[], blueTeamIds: string[]) {
  const sameTeams = (left: string[], right: string[]) => [...left].sort().join(":") === [...right].sort().join(":");
  return !sameTeams(current.red_teams, redTeamIds) || !sameTeams(current.blue_teams, blueTeamIds);
}
