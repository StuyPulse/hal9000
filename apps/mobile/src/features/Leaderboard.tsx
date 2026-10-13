import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Choice, Card } from '../components/ui';
import { Notice, Screen, useFeatureApp } from './common';
import { eventEntries, pendingSubmittedCount } from '../core/report-overlay';
import { ALL_ROUNDS, leaderboardRows, record as asRecord, scoutDisplayName, type LeaderboardEntry, type LeaderboardSection, type MatchRound } from './stats';

const SECTIONS: { id: LeaderboardSection; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'match', label: 'Match scouting' }, { id: 'pit', label: 'Pit scouting' }, { id: 'pre_scout', label: 'Pre scouting' },
];
const ROUNDS: { id: MatchRound; label: string }[] = [{ id: 'practice', label: 'Practice' }, { id: 'qualification', label: 'Qualification' }, { id: 'playoff', label: 'Playoffs' }];

/** Scout contribution counts for the active event, computed exactly as the website's /leaderboard. */
export function LeaderboardScreen() {
  const { theme, bundle, records, viewer } = useFeatureApp();
  const [section, setSection] = useState<LeaderboardSection>('all');
  const [rounds, setRounds] = useState<MatchRound[]>(ALL_ROUNDS);
  const [includePending, setIncludePending] = useState(false);

  const entries = useMemo<LeaderboardEntry[]>(() => {
    if (!bundle) return [];
    const types = new Map(bundle.matches.map((match) => [match.id, match.match_type]));
    const reports = includePending || viewer?.demo ? eventEntries(bundle, records) : bundle.entries;
    return reports.filter(entry => entry.status === 'submitted').map((entry) => {
      const manual = asRecord(entry.payload.manual_match);
      return {
        id: entry.id, type: entry.entry_type, scoutUserId: entry.scout_user_id,
        scoutName: scoutDisplayName(bundle.profiles, entry.scout_user_id, viewer),
        teamId: entry.team_id, matchId: entry.match_id, matchType: entry.match_id ? types.get(entry.match_id) ?? null : null,
        manualStage: typeof manual.stage === 'string' ? manual.stage : null,
        manualMatchKey: typeof manual.stage === 'string' && 'label' in manual ? `${manual.stage}|${typeof manual.label === 'string' ? manual.label : ''}` : null,
      };
    });
  }, [bundle, records, viewer, includePending]);

  const result = useMemo(() => leaderboardRows(entries, section, rounds), [entries, section, rounds]);
  if (!bundle) return <Screen theme={theme}><Notice theme={theme} tone="warning">Download the active event to see the leaderboard.</Notice></Screen>;
  const toggle = (round: MatchRound) => setRounds((current) => (current.includes(round) ? current.filter((item) => item !== round) : [...current, round]));

  return (
    <Screen theme={theme}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: '700' }}>Leaderboard</Text>
      <Text style={{ color: theme.muted }}>{bundle.event.name} · submitted scouting reports</Text>
      {bundle.event.status !== 'active' ? null : null}
      {pendingSubmittedCount(bundle, records) && !viewer?.demo ? <><Notice theme={theme} tone="warning">{pendingSubmittedCount(bundle, records)} report(s) are pending on this device. {includePending ? 'Preview counts include them and are not the confirmed website leaderboard.' : 'Confirmed counts below exclude them until cloud delivery.'}</Notice><Choice theme={theme} label="Preview pending local reports" selected={includePending} onPress={() => setIncludePending(value => !value)} /></> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SECTIONS.map((item) => <Choice key={item.id} theme={theme} label={item.label} selected={section === item.id} onPress={() => setSection(item.id)} />)}
      </View>
      {section === 'match' ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '600' }}>Include rounds</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ROUNDS.map((round) => <Choice key={round.id} theme={theme} label={round.label} selected={rounds.includes(round.id)} onPress={() => toggle(round.id)} />)}
          </View>
          {result.excludedUnclassified > 0 ? <Text style={{ color: theme.muted, fontSize: 13 }}>{result.excludedUnclassified} report{result.excludedUnclassified === 1 ? '' : 's'} without a round label excluded</Text> : null}
        </View>
      ) : null}
      {result.rows.length ? result.rows.map((row, index) => (
        <Card key={row.id} theme={theme} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text accessibilityLabel={`Rank ${index + 1}`} style={{ color: theme.muted, fontSize: 18, fontWeight: '700', width: 32 }}>{index + 1}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>{row.name}</Text>
            <Text style={{ color: theme.muted, fontSize: 14 }}>
              {section === 'match' ? `Teams ${row.teams} · Matches ${row.matches} · Reports ${row.reports}` : `Reports ${row.reports}`}
            </Text>
          </View>
        </Card>
      )) : <Notice theme={theme}>No reports yet.</Notice>}
    </Screen>
  );
}

export default LeaderboardScreen;
