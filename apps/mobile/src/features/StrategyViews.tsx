import {friendlyError} from '../core/friendly-error';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { useRouter } from 'expo-router';
import { SvgXml } from 'react-native-svg';
import type { Category, EventBundle, Match, NativeEntry, Palette, PicklistRanking, Team } from '../core/types';
import type { BundleExtras, ScoredMatch } from './common';
import { StrategyCanvas } from './StrategyCanvas';
import { DragRow } from './DragRow';
import { drawingQueue } from '../core/strategy-sync';
import { eventEntries } from '../core/report-overlay';
import { getValue, putValue, removeValue } from '../core/storage';
import { ComparisonStatsGraph, MetricChart } from './MetricChart';
import { parseStrokes, type DrawStroke } from './strategyDrawing';
import { Button, Card, Choice, Input, Row, Section } from '../components/ui';
import { Badge, Notice, Screen, TeamPicker, useFeatureApp } from './common';
import { DataTable } from '../components/DataTable';
import { useLayout } from '../components/layout';
import { PIT_TEXT_FIELDS, PRE_SCOUT_TEXT_FIELDS } from './manualFields';
import { META_COLORS, UNSORTED, canEditPicklistRole, describeChange, groupRevisions, databaseCategory, isHexColor, planInsert, planMove, planMoveToTier, planRemoveTier, planRestore, teamsInTier, validateMetaName, type FullRanking, type RankPatch } from './picklist';
import {
  EMPTY_STATS, breakageIssues, compareMatches, formatStat, heatColor, manualMatchLabel, matchLabel, matchOutcome, matchReportKey,
  officialClimb, officialFeedStatus, officialFuelAverages, officialForTeam, officialMetrics, latestPreScout as selectLatestPreScout, STRATEGY_DEFAULT_SORT, strategyMatchOrder, teamRecord, readableSpot, record as asRecord, reportValues, selectedMatchReportEntries, statsForTeam, type ScoutStats, type StatsBasis,
} from './stats';

const FIELD_ART = require('../../assets/2026-field-map.png') as number;

// ------------------------------------------------------------------ shared analysis

type Analysis = {
  bundle: EventBundle & BundleExtras;
  matchTypes: Map<string, string>;
  entries: NativeEntry[];
  matchesById: Map<string, Match>;
  playedQualification: Set<string>;
  localUnsynced: number;
  teamsById: Map<string, Team>;
};

function useAnalysis(): Analysis | null {
  const { bundle, records } = useFeatureApp();
  return useMemo(() => {
    if (!bundle) return null;
    const submitted = eventEntries(bundle, records).filter(entry => entry.status === 'submitted');
    let localUnsynced = 0;
    for (const item of records) {
      if (item.entry.event_id !== bundle.event.id || item.entry.status !== 'submitted') continue;
      if (item.status !== 'synced' && !item.reviewRequired && item.entry.entry_type === 'match') localUnsynced += 1;
    }
    const played = new Set<string>();
    for (const match of bundle.matches) {
      if (match.match_type === 'qualification' && match.status === 'played') [...match.red_teams, ...match.blue_teams].forEach((id) => played.add(id));
    }
    return {
      bundle,
      matchTypes: new Map(bundle.matches.map((match) => [match.id, match.match_type])),
      entries: submitted,
      matchesById: new Map(bundle.matches.map((match) => [match.id, match])),
      playedQualification: played,
      localUnsynced,
      teamsById: new Map(bundle.teams.map((team) => [team.id, team])),
    };
  }, [bundle, records]);
}

function matchEntries(analysis: Analysis) {
  return analysis.entries.filter((entry) => entry.entry_type === 'match');
}

function teamStats(analysis: Analysis, teamId: string, basis: StatsBasis): ScoutStats {
  return statsForTeam(teamId, matchEntries(analysis), analysis.bundle.reportSources, analysis.matchTypes, basis, analysis.playedQualification.has(teamId));
}

function useStatsByTeam(analysis: Analysis | null, basis: StatsBasis) {
  return useMemo(() => {
    const result = new Map<string, ScoutStats>();
    if (!analysis) return result;
    for (const team of analysis.bundle.teams) result.set(team.id, teamStats(analysis, team.id, basis));
    return result;
  }, [analysis, basis]);
}

type OfficialValues = ReturnType<typeof officialMetrics>;
type MetricKey = keyof ScoutStats | keyof OfficialValues | 'team';
type Metric = { key: MetricKey; label: string; reverse?: boolean; format?: (value: number) => string; sortable?: boolean };
function metricValue(stats: ScoutStats, official: OfficialValues, key: MetricKey, number = 0): number | string {
  if (key === 'team') return number;
  return key in stats ? stats[key as keyof ScoutStats] : official[key as keyof OfficialValues];
}
function displayMetric(value: number | string, metric: Metric) { return typeof value === 'number' ? (metric.format ?? formatStat)(value) : value; }
const OFFICIAL_KEYS = new Set<MetricKey>(['rank','opr','tbaTotalFuel','tbaAutoFuel','tbaTeleopFuel','tbaTransitionFuel','tbaEndgameFuel','autoClimb','autoClimbRate','endgameClimb','endgameClimbRate','record']);
const count = (value: number) => String(Math.round(value));
const percent = (value: number) => `${value.toFixed(2)}%`;
const METRIC_GROUPS: { id: string; label: string; metrics: Metric[] }[] = [
  { id: 'summary', label: 'Summary', metrics: [
    { key: 'opr', label: 'OPR' }, { key: 'tbaTotalFuel', label: 'Total fuel' }, { key: 'tbaAutoFuel', label: 'Auto fuel' }, { key: 'tbaTeleopFuel', label: 'Teleop fuel' },
    { key: 'autoMaxScored', label: 'Auto max scored' }, { key: 'autoMaxFerried', label: 'Auto max ferried' },
    { key: 'autoAvgScored', label: 'Auto avg scored' }, { key: 'autoAvgFerried', label: 'Auto avg ferried' },
    { key: 'teleopMaxScored', label: 'Teleop max scored' }, { key: 'teleopMaxFerried', label: 'Teleop max ferried' },
    { key: 'teleopAvgScored', label: 'Teleop avg scored' }, { key: 'teleopAvgFerried', label: 'Teleop avg ferried' },
    { key: 'avgFouls', label: 'Avg fouls', reverse: true }, { key: 'defense', label: 'Defense level' },
    { key: 'brokenPercent', label: '% matches broken', reverse: true, format: percent },
  ] },
  { id: 'performance', label: 'Performance', metrics: [
    { key: 'rank', label: 'Rank', format: count }, { key: 'autoClimb', label: 'Auto climb', sortable: false }, { key: 'autoClimbRate', label: 'Auto %', format: percent },
    { key: 'endgameClimb', label: 'End climb', sortable: false }, { key: 'endgameClimbRate', label: 'End %', format: percent },
    { key: 'peakFuel', label: 'Max fuel' }, { key: 'autoMaxFerried', label: 'Auto ferry' }, { key: 'teleopMaxFerried', label: 'Tele ferry' },
    { key: 'avgFouls', label: 'Fouls' }, { key: 'defense', label: 'Defense' }, { key: 'brokenPercent', label: 'Broken', format: percent },
  ] },
  { id: 'auton', label: 'Auton', metrics: [
    { key: 'rank', label: 'Rank', format: count },
    { key: 'autoMaxScored', label: 'Max scored' }, { key: 'autoMaxFerried', label: 'Max ferried' },
    { key: 'autoAvgScored', label: 'Avg scored' }, { key: 'autoAvgFerried', label: 'Avg ferried' },
    { key: 'autoFuel', label: 'Fuel' },
  ] },
  { id: 'teleop', label: 'Teleop', metrics: [
    { key: 'rank', label: 'Rank', format: count },
    { key: 'teleopMaxScored', label: 'Max scored' }, { key: 'teleopMaxFerried', label: 'Max ferried' },
    { key: 'teleopAvgScored', label: 'Avg scored' }, { key: 'teleopAvgFerried', label: 'Avg ferried' },
    { key: 'teleopFuel', label: 'Fuel' },
  ] },
  { id: 'reliability', label: 'Reliability', metrics: [
    { key: 'rank', label: 'Rank', format: count },
    { key: 'matches', label: 'Matches scouted', format: count }, { key: 'entries', label: 'Reports', format: count },
    { key: 'avgFouls', label: 'Avg fouls', reverse: true }, { key: 'defense', label: 'Defense level' },
    { key: 'brokenPercent', label: '% matches broken', reverse: true, format: percent },
  ] },
];
const SORT_OPTIONS: Metric[] = ([{ key: 'team', label: 'Team number', format: count }, ...METRIC_GROUPS.flatMap(group => group.metrics.filter(metric => metric.sortable !== false).map(metric => ({ ...metric, label: `${group.label} · ${metric.label}` })))] as Metric[]).filter((metric, index, items) => items.findIndex(item => item.key === metric.key) === index);
const COMPARE_GROUPS = METRIC_GROUPS.map(group => group.id === 'summary' ? { ...group, metrics: [
  { key: 'rank', label: 'Rank', format: count }, { key: 'record', label: 'W–L–T', sortable: false }, { key: 'opr', label: 'OPR' },
  { key: 'tbaTotalFuel', label: 'TBA total fuel' }, { key: 'tbaAutoFuel', label: 'TBA auto fuel' }, { key: 'tbaTransitionFuel', label: 'TBA transition fuel' },
  { key: 'tbaTeleopFuel', label: 'TBA teleop fuel' }, { key: 'tbaEndgameFuel', label: 'TBA endgame fuel' },
  { key: 'matches', label: 'Matches', format: count }, { key: 'entries', label: 'Reports', format: count }, { key: 'totalFuel', label: 'Scout total fuel' },
] as Metric[] } : { ...group, metrics: group.metrics.filter(metric => metric.key !== 'rank') });


const rgba = (rgb: [number, number, number] | null) => (rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.32)` : undefined);
const goTeam = (router: ReturnType<typeof useRouter>, id: string) => router.push(`/teams/${id}` as never);

function NoEvent({ theme }: { theme: Palette }) {
  return <Screen theme={theme}><Notice theme={theme} tone="warning">No event downloaded yet.</Notice></Screen>;
}

function Tabs({ theme, items, value, onChange }: { theme: Palette; items: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8 }}>
      {items.map((item) => <Choice key={item.id} theme={theme} label={item.label} selected={item.id === value} onPress={() => onChange(item.id)} />)}
    </ScrollView>
  );
}

function SourceNotice({ theme, analysis }: { theme: Palette; analysis: Analysis }) {
  const feed = officialFeedStatus(analysis.bundle.official, analysis.bundle.event.is_manual);
  const notices = [
    feed.state === 'error' ? feed.message : null,
    analysis.localUnsynced ? `${analysis.localUnsynced} report${analysis.localUnsynced === 1 ? '' : 's'} on this phone not uploaded yet · included below` : null,
  ].filter(Boolean) as string[];
  if (!notices.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {notices.map((text) => <Notice key={text} theme={theme} tone="warning">{text}</Notice>)}
    </View>
  );
}


function PhotoPager({ theme, photos, label, index, onIndex }: { theme: Palette; photos: { id: string; uri: string }[]; label: string; index: number; onIndex: (index: number) => void }) {
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);
  useEffect(() => { if (width) scroller.current?.scrollTo({ x: index * width, animated: false }); }, [width]);
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ gap: 8 }}>
      <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEnabled={photos.length > 1} onMomentumScrollEnd={(event) => width && onIndex(Math.round(event.nativeEvent.contentOffset.x / width))} style={{ borderRadius: 16 }}>
        {photos.map((photo, position) => (
          <Image key={photo.id} source={{ uri: photo.uri }} accessibilityLabel={`${label} ${position + 1} of ${photos.length}`} resizeMode="cover" style={{ width: width || '100%', aspectRatio: 4 / 3, backgroundColor: theme.panel }} />
        ))}
      </ScrollView>
      {photos.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {photos.map((photo, position) => <View key={photo.id} style={{ width: position === index ? 18 : 7, height: 7, borderRadius: 4, backgroundColor: position === index ? theme.tint : theme.line }} />)}
        </View>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ summary

function SummaryView({ analysis, theme }: { analysis: Analysis; theme: Palette }) {
  const router = useRouter();
  const stats = useStatsByTeam(analysis, 'competitive');
  const [group, setGroup] = useState('summary');
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<MetricKey>(STRATEGY_DEFAULT_SORT);
  const officialValues = useMemo(() => new Map(analysis.bundle.teams.map(team => [team.id, officialMetrics(analysis.bundle.official, analysis.bundle.matches, team)])), [analysis.bundle]);
  const official = useMemo(() => new Map(analysis.bundle.teams.map((team) => [team.id, officialForTeam(analysis.bundle.official, team.number, team.displayNumber)])), [analysis.bundle]);
  const hasOfficial = Boolean(analysis.bundle.official && (analysis.bundle.official.rankings.length || Object.keys(analysis.bundle.official.oprs).length));
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [preScoutOpen, setPreScoutOpen] = useState<string | null>(null);
  const [layout, setLayout] = useState('table');
  const active = METRIC_GROUPS.find((item) => item.id === group) ?? METRIC_GROUPS[0];

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return analysis.bundle.teams
      .filter((team) => !needle || `${team.number} ${team.displayNumber} ${team.name}`.toLowerCase().includes(needle))
      .sort((a, b) => {
        const read = (id: string) => Number(metricValue(stats.get(id) ?? EMPTY_STATS, officialValues.get(id)!, sortKey, analysis.teamsById.get(id)?.number));
        const delta = read(a.id) - read(b.id);
        return delta === 0 ? a.number - b.number : delta * (direction === 'asc' ? 1 : -1);
      });
  }, [analysis, filter, sortKey, direction, stats, officialValues]);

  const columnValues = useMemo(() => {
    const result = new Map<string, number[]>();
    for (const metric of active.metrics) result.set(metric.key, analysis.bundle.teams.map(team => Number(metricValue(stats.get(team.id) ?? EMPTY_STATS, officialValues.get(team.id)!, metric.key))).filter(Number.isFinite));
    return result;
  }, [active, analysis.bundle.teams, stats, officialValues]);

  const latestPreScout = useMemo(() => {
    return selectLatestPreScout(analysis.entries);
  }, [analysis.entries]);

  const columns = active.metrics.map((metric) => ({ key: metric.key, title: metric.label, width: metric.label.length > 12 ? 128 : 104, sortable: metric.sortable !== false }));
  const onSort = (key: string) => {
    if (key === sortKey) setDirection((value) => (value === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key as MetricKey); setDirection(key === 'rank' || key === 'team' ? 'asc' : 'desc'); }
  };
  const preScoutColumns = [['autos', 'Auto'], ['active_shift', 'Active HUB'], ['inactive_shift', 'Inactive HUB'], ['traversal', 'Traversal'], ['average_pieces', 'Average fuel'], ['with_them', 'With them'], ['against_them', 'Against them']].map(([key, title]) => ({ key, title, width: 200, sortable: false }));
  const sortedTeams = useMemo(() => [...analysis.bundle.teams].sort((a, b) => a.number - b.number), [analysis.bundle.teams]);
  const { large, wide } = useLayout();

  return (
    <Screen theme={theme} fill>
      <SourceNotice theme={theme} analysis={analysis} />
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <TextInput accessibilityLabel="Filter teams" value={filter} onChangeText={setFilter} placeholder="Filter teams" placeholderTextColor={theme.muted} autoCorrect={false} autoCapitalize="none" style={{ flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: theme.text, backgroundColor: theme.surface, borderColor: theme.line }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
        {[['table', 'Table'], ['cards', 'Cards'], ['prescout', 'Pre-scout']].map(([id, label]) => <Choice key={id} theme={theme} label={label} selected={layout === id} onPress={() => setLayout(id)} />)}
        {layout !== 'prescout' ? <View style={{ width: 1, height: 28, backgroundColor: theme.line, marginHorizontal: 4 }} /> : null}
        {layout !== 'prescout' ? METRIC_GROUPS.map((item) => <Choice key={item.id} theme={theme} label={item.label} selected={group === item.id} onPress={() => setGroup(item.id)} />) : null}
      </ScrollView>
      {layout === 'table' ? (
        <View style={{ flex: 1, borderWidth: 1, borderColor: theme.line, borderRadius: 14, overflow: 'hidden' }}>
          <DataTable
            theme={theme} columns={columns} rows={rows} rowKey={(team) => team.id}
            sortKey={sortKey} sortDirection={direction} onSort={onSort}
            rowLabel={(team) => `Open team ${team.displayNumber}`} onPressRow={(team) => goTeam(router, team.id)}
            renderFirst={(team) => <Text numberOfLines={1} style={{ color: theme.tint, fontWeight: '800', fontSize: 16 }}>{team.displayNumber}</Text>}
            renderCell={(team, column) => {
              const metric = active.metrics.find((item) => item.key === column.key)!;
              const value = metricValue(stats.get(team.id) ?? EMPTY_STATS, officialValues.get(team.id)!, metric.key);
              const scouted = (stats.get(team.id) ?? EMPTY_STATS).matches;
              const background = typeof value === 'number' && (scouted || OFFICIAL_KEYS.has(metric.key)) && metric.key !== 'matches' && metric.key !== 'entries' ? rgba(heatColor(value, columnValues.get(metric.key) ?? [], metric.reverse)) : undefined;
              return <View style={{ flex: 1, justifyContent: 'center', marginHorizontal: -10, paddingHorizontal: 10, backgroundColor: background }}><Text numberOfLines={1} style={{ color: theme.text, fontSize: 15 }}>{metric.key === 'rank' && value === 99999 ? '—' : displayMetric(value, metric)}</Text></View>;
            }}
          />
        </View>
      ) : null}
      {layout === 'cards' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 24, flexDirection: 'row', flexWrap: 'wrap' }}>
          {rows.map((team) => {
            const value = stats.get(team.id) ?? EMPTY_STATS;
            return (
              <Pressable key={team.id} accessibilityRole="button" accessibilityLabel={`Team ${team.displayNumber} ${team.name}. ${value.matches} scouted matches. Open team profile.`} onPress={() => goTeam(router, team.id)} style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line, borderRadius: 16, padding: 14, gap: 10, flexGrow: 1, flexBasis: large ? '31%' : wide ? '47%' : '100%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', flex: 1 }} numberOfLines={1}>{team.displayNumber} · {team.name}</Text>
                  <Badge theme={theme} tone={value.matches ? 'tint' : 'muted'} text={value.matches ? `${value.matches} match${value.matches === 1 ? '' : 'es'}` : 'No data'} />
                </View>
                {hasOfficial ? (() => {
                  const info = official.get(team.id);
                  return <Text style={{ color: theme.muted, fontSize: 13 }}>TBA {info?.rank ? `rank #${info.rank}` : 'unranked'}{info?.record ? ` · ${info.record}` : ''}{info?.opr !== null && info?.opr !== undefined ? ` · OPR ${formatStat(info.opr)}` : ''}</Text>;
                })() : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {active.metrics.map((metric) => {
                    const raw = metricValue(value, officialValues.get(team.id)!, metric.key);
                    const background = typeof raw === 'number' && (value.matches || OFFICIAL_KEYS.has(metric.key)) && metric.key !== 'matches' && metric.key !== 'entries' ? rgba(heatColor(raw, columnValues.get(metric.key) ?? [], metric.reverse)) : undefined;
                    return (
                      <View key={metric.key} style={{ minWidth: '30%', flexGrow: 1, padding: 8, borderRadius: 10, backgroundColor: background ?? theme.panel }}>
                        <Text style={{ color: theme.muted, fontSize: 12 }}>{metric.label}</Text>
                        <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>{metric.key === 'rank' && raw === 99999 ? '—' : displayMetric(raw, metric)}</Text>
                      </View>
                    );
                  })}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {layout === 'prescout' ? (
        <View style={{ flex: 1, borderWidth: 1, borderColor: theme.line, borderRadius: 14, overflow: 'hidden' }}>
          <DataTable
            theme={theme} columns={preScoutColumns} rows={sortedTeams} rowKey={(team) => team.id} rowHeight={72}
            rowLabel={(team) => `Open team ${team.displayNumber}`} onPressRow={(team) => goTeam(router, team.id)}
            renderFirst={(team) => <Text numberOfLines={1} style={{ color: theme.tint, fontWeight: '800', fontSize: 16 }}>{team.displayNumber}</Text>}
            renderCell={(team, column) => <Text numberOfLines={3} style={{ color: theme.text, fontSize: 14 }}>{String(latestPreScout.get(team.id)?.payload[column.key] ?? '—')}</Text>}
          />
        </View>
      ) : null}
    </Screen>
  );
}

// ------------------------------------------------------------------ compare

function CompareView({ analysis, theme }: { analysis: Analysis; theme: Palette }) {
  const app = useFeatureApp();
  const router = useRouter();
  const stats = useStatsByTeam(analysis, 'competitive');
  const [selected, setSelected] = useState<string[]>(['', '']);
  const [group, setGroup] = useState('summary');
  const active = COMPARE_GROUPS.find((item) => item.id === group) ?? COMPARE_GROUPS[0];
  const officialValues = useMemo(() => new Map(analysis.bundle.teams.map(team => [team.id, officialMetrics(analysis.bundle.official, analysis.bundle.matches, team)])), [analysis.bundle]);
  const chosen = selected.map((id) => analysis.teamsById.get(id)).filter((team): team is Team => Boolean(team));
  const photoFor = (teamId: string) => {
    const local = app.photos.find((photo) => photo.team_id === teamId && photo.localUri);
    if (local) return local.localUri;
    const downloaded=analysis.bundle.photos.find((photo) => photo.team_id === teamId && (photo.localUri || photo.signedUrl));
    return downloaded?.localUri ?? downloaded?.signedUrl;
  };

  return (
    <Screen theme={theme}>
      <SourceNotice theme={theme} analysis={analysis} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[0, 1].map(index => <View key={index} style={{ flex: 1, minWidth: 140 }}><TeamPicker theme={theme} teams={analysis.bundle.teams.filter(team => team.id !== selected[1 - index])} value={selected[index] || null} onChange={id => setSelected(current => current.map((value, slot) => slot === index ? id : value))} label={index === 0 ? 'Team A' : 'Team B'} /></View>)}
      </View>
      {chosen.length >= 2 ? (
        <>
          <Tabs theme={theme} value={group} onChange={setGroup} items={COMPARE_GROUPS.map(item => ({ id: item.id, label: item.label }))} />
          <ScrollView horizontal>
            <View style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 12, gap: 10, minWidth: '100%' }}>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: 150 }} />
                {chosen.map((team) => {
                  const photo = photoFor(team.id);
                  return (
                    <Pressable key={team.id} accessibilityRole="button" accessibilityLabel={`Open team ${team.displayNumber}`} onPress={() => goTeam(router, team.id)} style={{ width: 112, alignItems: 'center', gap: 6 }}>
                      {photo ? <Image source={{ uri: photo }} accessibilityLabel={`Team ${team.displayNumber} robot`} style={{ width: 96, height: 72, borderRadius: 10, backgroundColor: theme.panel }} /> : <View style={{ width: 96, height: 72, borderRadius: 10, backgroundColor: theme.panel, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: theme.muted, fontSize: 11 }}>No pit photo</Text></View>}
                      <Text style={{ color: theme.text, fontWeight: '700' }}>{team.displayNumber}</Text>
                      <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>{team.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <>
              {active.metrics.map((metric) => {
                const values = chosen.map(team => metricValue(stats.get(team.id) ?? EMPTY_STATS, officialValues.get(team.id)!, metric.key));
                const numeric = values.map(Number);
                const best = metric.key === 'matches' || metric.key === 'entries' || !numeric.every(Number.isFinite) ? NaN : metric.reverse ? Math.min(...numeric) : Math.max(...numeric);
                return (
                  <View key={metric.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderColor: theme.line }}>
                    <Text style={{ color: theme.muted, width: 150, fontSize: 14 }}>{metric.label}</Text>
                    {chosen.map((team, index) => {
                      const has = (stats.get(team.id)?.matches ?? 0) > 0;
                      const isBest = (has || OFFICIAL_KEYS.has(metric.key)) && numeric[index] === best && new Set(values).size > 1;
                      return <Text key={team.id} style={{ width: 112, textAlign: 'center', fontSize: 17, fontWeight: isBest ? '800' : '600', color: isBest ? theme.success : theme.text }}>{metric.key === 'rank' && values[index] === 99999 ? '—' : displayMetric(values[index], metric)}</Text>;
                    })}
                  </View>
                );
              })}
              </>
            </View>
          </ScrollView>
          {group !== 'summary' ? <ComparisonStatsGraph theme={theme} series={chosen.map((team, index) => ({ label: team.displayNumber, color: index === 0 ? theme.red : theme.blue, stats: stats.get(team.id) ?? EMPTY_STATS }))} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

// ------------------------------------------------------------------ picklist

function PicklistView({ analysis, theme }: { analysis: Analysis; theme: Palette }) {
  const app = useFeatureApp();
  const router = useRouter();
  const stats = useStatsByTeam(analysis, 'competitive');
  const { bundle } = analysis;
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [manage, setManage] = useState<'category' | 'tag' | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(META_COLORS[0]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(15);
  const [openRevision, setOpenRevision] = useState<string | null>(null);
  const rowHeights = useRef(new Map<string, number>());
  const headerHeights = useRef(new Map<string, number>());
  const [liftTier, setLiftTier] = useState<string | null>(null);

  const roleCanEdit = canEditPicklistRole(app.viewer?.role);
  const writer = app.savePicklistRanking;
  const bulkWriter = app.savePicklistRankings;
  const canEdit = roleCanEdit && typeof writer === 'function';

  const rankings = useMemo(() => new Map(bundle.rankings.map((ranking) => [ranking.team_id, ranking])), [bundle.rankings]);
  const orderedTeams = useMemo(() => bundle.teams.map(team => ({ ...team, opr: officialForTeam(bundle.official, team.number, team.displayNumber).opr ?? 0 })).sort((a, b) => b.opr - a.opr || a.number - b.number), [bundle]);
  const categories = useMemo(() => [...bundle.categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)), [bundle.categories]);
  const tags = useMemo(() => [...bundle.tags].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)), [bundle.tags]);
  const tiers: { id: string; name: string; color: string }[] = useMemo(() => [{ id: UNSORTED, name: 'Unsorted', color: '#64748b' }, ...categories.map((category: Category) => ({ id: category.id, name: category.name, color: category.color }))], [categories]);
  const tierOrders = useMemo(() => Object.fromEntries(tiers.map((tier) => [tier.id, teamsInTier(orderedTeams, rankings, tier.id).map((team) => ({ teamId: team.id, rank: rankings.get(team.id)?.rank ?? null }))])), [tiers, orderedTeams, rankings]);
  const tierIds = tiers.map((tier) => tier.id);
  const revisions = useMemo(() => groupRevisions(bundle.picklistHistory ?? []), [bundle.picklistHistory]);

  if (!bundle.canViewPicklist) {
    return <Screen theme={theme}><Notice theme={theme} tone="warning">Picklist access is restricted for your account.</Notice></Screen>;
  }

  async function write(patches: { teamId: string; patch: Partial<PicklistRanking> }[], success: string) {
    if (!writer) return;
    setBusy(patches[0]?.teamId ?? 'all');
    setNotice(null);
    try {
      await bulkWriter(patches);
      setNotice({ text: success, error: false });
    } catch (error) {
      setNotice({ text: friendlyError(error, 'That change was not saved. Check your connection and role, then retry.'), error: true });
    } finally {
      setBusy(null);
    }
  }

  /** Drag-to-reorder: turn the finger's final position into a tier and an index, across tiers. */
  function dropTeam(teamId: string, tierId: string, dy: number) {
    if (Math.abs(dy) < 12) return;
    let y = 0;
    let draggedMid = 0;
    const spans: { tier: string; start: number; end: number; rows: { id: string; mid: number }[] }[] = [];
    for (const tier of tiers) {
      const start = y;
      y += (headerHeights.current.get(tier.id) ?? 28) + 16;
      const rows: { id: string; mid: number }[] = [];
      for (const team of teamsInTier(orderedTeams, rankings, tier.id).filter((item) => visible(item.id))) {
        const height = (rowHeights.current.get(team.id) ?? 76) + 8;
        if (team.id === teamId) draggedMid = y + height / 2;
        rows.push({ id: team.id, mid: y + height / 2 });
        y += height;
      }
      spans.push({ tier: tier.id, start, end: y, rows });
    }
    const pointer = draggedMid + dy;
    const span = spans.find((item) => pointer >= item.start && pointer < item.end) ?? (pointer < 0 ? spans[0] : spans[spans.length - 1]);
    const dest = span.tier;
    const index = span.rows.filter((row) => row.id !== teamId && row.mid < pointer).length;
    const order = tierOrders[dest] ?? [];
    const others = order.filter((item) => item.teamId !== teamId);
    const team = orderedTeams.find((item) => item.id === teamId);
    if (dest === tierId && order.findIndex((item) => item.teamId === teamId) === index) return;
    const destName = tiers.find((item) => item.id === dest)?.name ?? 'tier';
    const note = dest === tierId ? `${team?.displayNumber ?? 'Team'} moved.` : `${team?.displayNumber ?? 'Team'} moved to ${destName}.`;
    if (others.some((item) => item.rank === null)) {
      // Unranked teams sort after ranked ones, so number the whole destination tier like the website does.
      const ids = others.map((item) => item.teamId);
      ids.splice(Math.min(index, ids.length), 0, teamId);
      void write(ids.map((id, position) => ({ teamId: id, patch: { rank: (position + 1) * 1024, category_id: databaseCategory(dest) } })), note);
      return;
    }
    void write(toPatches(planInsert(teamId, others, index, dest)), note);
  }
  const metaWriter = app.savePicklistMeta;
  const metaDeleter = app.deletePicklistMeta;
  const canManage = canEdit && typeof metaWriter === 'function' && typeof metaDeleter === 'function';
  const nameOf = (id: string) => analysis.teamsById.get(id)?.displayNumber ?? 'Team';
  const categoryName = (id: unknown) => (typeof id === 'string' ? categories.find((item) => item.id === id)?.name ?? 'Unsorted' : 'Unsorted');
  const tagName = (id: string) => tags.find((item) => item.id === id)?.name;

  async function guarded(task: () => Promise<void>, success: string) {
    setBusy('meta');
    setNotice(null);
    try {
      await task();
      setNotice({ text: success, error: false });
    } catch (error) {
      setNotice({ text: friendlyError(error, 'That change was not saved.'), error: true });
    } finally {
      setBusy(null);
    }
  }
  async function addMeta(kind: 'category' | 'tag') {
    if (!metaWriter) return;
    const list = kind === 'category' ? categories : tags;
    const problem = validateMetaName(newName, list.map((item) => item.name));
    if (problem) { setNotice({ text: problem, error: true }); return; }
    if (!isHexColor(newColor)) { setNotice({ text: 'Choose a color.', error: true }); return; }
    const name = newName.trim();
    await guarded(async () => { await metaWriter(kind, { name, color: newColor, sort_order: list.length }); setNewName(''); }, `${name} ${kind === 'category' ? 'tier' : 'tag'} added.`);
  }
  async function moveTier(id: string, direction: -1 | 1) {
    if (!metaWriter) return;
    const index = categories.findIndex((item) => item.id === id);
    const other = categories[index + direction];
    if (index < 0 || !other) return;
    const current = categories[index];
    await guarded(async () => {
      await metaWriter('category', { id: current.id, name: current.name, color: current.color, sort_order: other.sort_order });
      await metaWriter('category', { id: other.id, name: other.name, color: other.color, sort_order: current.sort_order });
    }, 'Tier order saved.');
  }
  async function removeTier(id: string) {
    if (!metaDeleter || !writer) return;
    const plan = planRemoveTier(id, tierIds, tierOrders);
    if (!plan.fallback) { setNotice({ text: 'Keep at least one tier.', error: true }); return; }
    const name = categoryName(id);
    const originals = (tierOrders[id] ?? []).map((item) => ({ teamId: item.teamId, rank: item.rank, category_id: id }));
    await guarded(async () => {
      await bulkWriter(toPatches(plan.patches));
      try {
        await metaDeleter('category', id);
      } catch (error) {
        // Deleting failed (for example only the creator or an admin may delete a tier): put the teams back.
        try { await bulkWriter(originals.map(original => ({ teamId: original.teamId, patch: { rank: original.rank, category_id: original.category_id } }))); } catch { /* best effort; original failure remains visible */ }
        throw error;
      }
    }, `${name} tier removed; its teams moved to ${categoryName(plan.fallback)}.`);
  }
  async function removeTag(id: string) {
    if (!metaDeleter) return;
    const name = tagName(id) ?? 'Tag';
    await guarded(async () => { await metaDeleter('tag', id); setActiveTags((current) => current.filter((item) => item !== id)); }, `${name} tag removed.`);
  }
  async function restore(index: number) {
    if (!writer) return;
    const current = new Map<string, FullRanking>(bundle.rankings.map((ranking) => [ranking.team_id, { rank: ranking.rank, category_id: ranking.category_id, note: ranking.note ?? '', selected: ranking.selected, tag_ids: ranking.tag_ids }]));
    const order = orderedTeams.map(team => team.id);
    const plan = planRestore(current, revisions, index, order);
    if (!plan.length) { setNotice({ text: 'The picklist already matches this version.', error: false }); return; }
    await guarded(() => bulkWriter(plan.map(item => ({ teamId: item.teamId, patch: item.state }))), `Restored ${plan.length} team${plan.length === 1 ? '' : 's'} to the ${new Date(revisions[index].createdAt).toLocaleString()} version.`);
  }
  const toPatches = (plan: RankPatch[]) => plan.map((item) => ({ teamId: item.teamId, patch: { rank: item.rank, category_id: item.category_id } }));
  const visible = (teamId: string) => !activeTags.length || (rankings.get(teamId)?.tag_ids ?? []).some((id) => activeTags.includes(id));
  const overallByTeam = new Map(tierIds.flatMap(id => tierOrders[id].map(item => item.teamId)).map((id, index) => [id, index + 1]));

  return (
    <Screen theme={theme}>
      {!canEdit ? (
        <Notice theme={theme}>{roleCanEdit ? 'Editing is not available in this build; showing the board read-only.' : `View only. Strategists, masters, global scouts and admins can edit the picklist (your role: ${app.viewer?.role ?? 'unknown'}).`}</Notice>
      ) : null}
      {!app.online ? <Notice theme={theme}>Offline · read-only</Notice> : null}
      {notice ? <Notice theme={theme} tone={notice.error ? 'danger' : 'success'}>{notice.text}</Notice> : null}

      {tags.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.text, fontWeight: '600' }}>Filter by tag</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {tags.map((tag) => <Choice key={tag.id} theme={theme} label={tag.name} selected={activeTags.includes(tag.id)} onPress={() => setActiveTags((current) => (current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id]))} />)}
            {activeTags.length ? <Choice theme={theme} label="Clear" selected={false} onPress={() => setActiveTags([])} /> : null}
          </ScrollView>
        </View>
      ) : null}

      {tiers.map((tier) => {
        const members = teamsInTier(orderedTeams, rankings, tier.id);
        const shown = members.filter((team) => visible(team.id));
        const header = (
          <View key={`${tier.id}-head`} onLayout={(event) => { headerHeights.current.set(tier.id, event.nativeEvent.layout.height); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <View style={{ width: 12, height: 28, borderRadius: 6, backgroundColor: tier.color }} />
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 19, fontWeight: '700' }}>{tier.name}</Text>
            <Text style={{ color: theme.muted }}>{activeTags.length ? `${shown.length} of ${members.length}` : members.length} teams</Text>
          </View>
        );
        return (
          <View key={tier.id} style={{ gap: 8, zIndex: liftTier === tier.id ? 50 : 0 }}>
            {header}
            {shown.length ? shown.map((team) => {
              const overall = overallByTeam.get(team.id) ?? 0;
              const ranking = rankings.get(team.id);
              const value = stats.get(team.id) ?? EMPTY_STATS;
              const open = expanded === team.id;
              const teamTags = tags.filter((tag) => ranking?.tag_ids.includes(tag.id));
              const position = tierOrders[tier.id].findIndex((item) => item.teamId === team.id);
              const saving = busy === team.id;
              return (
                <DragRow key={team.id} enabled={canEdit && !open && !activeTags.length} color={theme.muted} onLayoutHeight={(height) => { rowHeights.current.set(team.id, height); }} onLift={(lifted) => setLiftTier(lifted ? tier.id : null)} onDrop={(dy) => dropTeam(team.id, tier.id, dy)} style={{ backgroundColor: ranking?.selected ? theme.selection : theme.surface, borderRadius: 14, padding: 12, gap: 8, borderLeftWidth: 5, borderLeftColor: tier.color }}>
                  {(handle) => (<>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Team ${team.displayNumber} ${team.name}, position ${overall}${ranking?.selected ? ', selected' : ''}. ${open ? 'Collapse' : 'Expand'} controls`} accessibilityState={{ expanded: open }} onPress={() => setExpanded(open ? null : team.id)} style={{ minHeight: 48, justifyContent: 'center', gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ color: theme.muted, width: 28 }}>{overall}</Text>
                      <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', flex: 1 }} numberOfLines={1}>{team.displayNumber} · {team.name}</Text>
                      {ranking?.selected ? <Badge theme={theme} tone="success" text="Selected" /> : null}
                      {handle}
                    </View>
                    {value.matches ? <Text style={{ color: theme.muted, fontSize: 13 }}>{`Auto ${formatStat(value.autoAvgScored)} · Teleop ${formatStat(value.teleopAvgScored)} · ${value.brokenPercent.toFixed(0)}% broken`}</Text> : null}
                    {teamTags.length ? <Text style={{ color: theme.tint, fontSize: 13 }}>{teamTags.map((tag) => tag.name).join(' · ')}</Text> : null}
                    {!open && ranking?.note ? <Text style={{ color: theme.text, fontSize: 14 }} numberOfLines={2}>{ranking.note}</Text> : null}
                  </Pressable>
                  {open ? (
                    <View style={{ gap: 10 }}>
                      {canEdit ? (
                        <>
                          <TextInput
                            accessibilityLabel={`Notes for team ${team.displayNumber}`}
                            value={notes[team.id] ?? ranking?.note ?? ''}
                            onChangeText={(text) => setNotes((current) => ({ ...current, [team.id]: text }))}
                            onBlur={() => { const next = (notes[team.id] ?? ranking?.note ?? '').trim(); if (next !== (ranking?.note ?? '')) void write([{ teamId: team.id, patch: { note: next } }], `Note saved for ${team.displayNumber}.`); }}
                            editable={!saving}
                            multiline maxLength={2000} placeholder="Notes" placeholderTextColor={theme.muted}
                            style={{ minHeight: 72, borderWidth: 1, borderColor: theme.line, borderRadius: 12, padding: 12, color: theme.text, backgroundColor: theme.bg, fontSize: 15, textAlignVertical: 'top' }}
                          />
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            <Choice theme={theme} label={ranking?.selected ? 'Selected ✓' : 'Mark selected'} selected={Boolean(ranking?.selected)} onPress={() => void write([{ teamId: team.id, patch: { selected: !ranking?.selected } }], ranking?.selected ? `${team.displayNumber} unselected.` : `${team.displayNumber} selected.`)} />
                            <Choice theme={theme} label="Move up" selected={false} onPress={() => void write(toPatches(planMove(team.id, tierIds, tierOrders, tier.id, -1)), `${team.displayNumber} moved.`)} />
                            <Choice theme={theme} label="Move down" selected={false} onPress={() => void write(toPatches(planMove(team.id, tierIds, tierOrders, tier.id, 1)), `${team.displayNumber} moved.`)} />
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {tiers.map((option) => <Choice key={option.id} theme={theme} label={option.name} selected={option.id === tier.id} onPress={() => option.id !== tier.id && void write(toPatches(planMoveToTier(team.id, tierOrders, option.id)), `${team.displayNumber} moved to ${option.name}.`)} />)}
                          </View>
                          {tags.length ? (
                            <>
                              <Text style={{ color: theme.muted, fontSize: 13 }}>Tags</Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {tags.map((tag) => {
                                  const on = ranking?.tag_ids.includes(tag.id) ?? false;
                                  return <Choice key={tag.id} theme={theme} label={tag.name} selected={on} onPress={() => void write([{ teamId: team.id, patch: { tag_ids: on ? (ranking?.tag_ids ?? []).filter((id) => id !== tag.id) : [...(ranking?.tag_ids ?? []), tag.id] } }], `Tags saved for ${team.displayNumber}.`)} />;
                                })}
                              </View>
                            </>
                          ) : null}
                          {saving ? <Text style={{ color: theme.muted, fontSize: 12 }}>Saving…</Text> : null}
                        </>
                      ) : (
                        <Text style={{ color: theme.text, fontSize: 15 }}>{ranking?.note || 'No notes.'}</Text>
                      )}
                      <Button theme={theme} secondary title="Open team profile" onPress={() => goTeam(router, team.id)} />
                    </View>
                  ) : null}
                  </>)}
                </DragRow>
              );
            }) : <Text style={{ color: theme.muted }}>{activeTags.length ? 'No teams match these tags.' : 'No teams in this tier.'}</Text>}
          </View>
        );
      })}

      {canEdit ? (
        <Section theme={theme} title="Manage tiers and tags">
          {!canManage ? null : (
            <>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Choice theme={theme} label="Tiers" selected={manage === 'category'} onPress={() => setManage(manage === 'category' ? null : 'category')} />
                <Choice theme={theme} label="Tags" selected={manage === 'tag'} onPress={() => setManage(manage === 'tag' ? null : 'tag')} />
              </View>
              {manage ? (
                <Card theme={theme}>
                  {(manage === 'category' ? categories : tags).map((item, index, list) => (
                    <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 }}>
                      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: item.color }} />
                      <Text style={{ color: theme.text, flex: 1, fontSize: 16 }}>{item.name}</Text>
                      {manage === 'category' ? <Choice theme={theme} label="↑" selected={false} onPress={() => index > 0 && void moveTier(item.id, -1)} /> : null}
                      {manage === 'category' ? <Choice theme={theme} label="↓" selected={false} onPress={() => index < list.length - 1 && void moveTier(item.id, 1)} /> : null}
                      <Choice theme={theme} label="Delete" selected={false} onPress={() => void (manage === 'category' ? removeTier(item.id) : removeTag(item.id))} />
                    </View>
                  ))}
                  <Input theme={theme} label={manage === 'category' ? 'New tier name' : 'New tag name'} value={newName} onChangeText={setNewName} maxLength={48} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {META_COLORS.map((color) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`Color ${color}`} accessibilityState={{ selected: newColor === color }} onPress={() => setNewColor(color)} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: color, borderWidth: newColor === color ? 4 : 0, borderColor: theme.text }} />)}
                  </View>
                  <Button theme={theme} title={manage === 'category' ? 'Add tier' : 'Add tag'} disabled={!newName.trim() || busy === 'meta' || !app.online} onPress={() => { void addMeta(manage); }} />
                </Card>
              ) : null}
            </>
          )}
        </Section>
      ) : null}

      <Section theme={theme} title="History">
        <Text style={{ color: theme.muted, fontSize: 14 }}>{(bundle.picklistHistory ?? []).length} recorded changes in {revisions.length} editing sessions.</Text>
        {bundle.picklistHistory === undefined ? <Notice theme={theme}>History is not downloaded in this build.</Notice> : (
          <>
            <Button theme={theme} secondary title={historyOpen ? 'Hide full history' : 'View full history'} onPress={() => setHistoryOpen((value) => !value)} />
            {historyOpen ? (
              <>
                {revisions.slice(0, historyLimit).map((revision, index) => {
                  const teamsTouched = new Set(revision.changes.map((change) => change.team_id)).size;
                  const open = openRevision === revision.id;
                  const editor = (revision.actorUserId && bundle.profiles?.[revision.actorUserId]) || 'Unknown member';
                  return (
                    <Card key={revision.id} theme={theme}>
                      <Text style={{ color: theme.text, fontWeight: '700' }}>{revision.changes.length} edit{revision.changes.length === 1 ? '' : 's'} · {teamsTouched} team{teamsTouched === 1 ? '' : 's'}</Text>
                      <Text style={{ color: theme.muted, fontSize: 13 }}>{editor} · {new Date(revision.createdAt).toLocaleString()}</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Choice theme={theme} label={open ? 'Hide edits' : 'View edits'} selected={open} onPress={() => setOpenRevision(open ? null : revision.id)} />
                        {canEdit ? <Choice theme={theme} label="Restore version" selected={false} onPress={() => void restore(index)} /> : null}
                      </View>
                      {open ? revision.changes.map((change) => (
                        <Text key={change.id} style={{ color: theme.text, fontSize: 14 }}>{nameOf(change.team_id)} — {describeChange(change, categoryName, tagName)}</Text>
                      )) : null}
                    </Card>
                  );
                })}
                {revisions.length > historyLimit ? <Button theme={theme} secondary title="Show older sessions" onPress={() => setHistoryLimit((value) => value + 15)} /> : null}
              </>
            ) : null}
          </>
        )}
      </Section>
    </Screen>
  );
}

// ------------------------------------------------------------------ match strategy

function MatchStrategyView({ analysis, theme }: { analysis: Analysis; theme: Palette }) {
  const router = useRouter();
  const app = useFeatureApp();
  const saved = useMemo(() => {
    const mine = (analysis.bundle.strategyDrawings ?? []).find((item) => item.user_id === app.viewer?.userId);
    return parseStrokes(mine?.strokes);
  }, [analysis.bundle.strategyDrawings, app.viewer?.userId]);
  const [strokes, setStrokes] = useState<DrawStroke[]>(saved);
  const [flipped, setFlipped] = useState(false);
  const [lineupOpen, setLineupOpen] = useState(false);
  const [savingDrawing, setSavingDrawing] = useState(false);
  const [drawingNotice, setDrawingNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [dirtyDrawing, setDirtyDrawing] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const dirtyRef = useRef(false);
  const sketchRevision = useRef(0);
  const draftWrites = useRef(Promise.resolve());
  const draftKey = `strategy-sketch:${analysis.bundle.event.id}:${app.viewer?.userId}`;
  useEffect(() => {
    let active = true;
    // Event/user changed: never carry the previous event's strokes or dirty flag across the boundary.
    dirtyRef.current = false; sketchRevision.current += 1;
    setDraftLoaded(false); setDirtyDrawing(false); setDrawingNotice(null); setPendingUpload(false);
    setStrokes(parseStrokes((analysis.bundle.strategyDrawings ?? []).find((item) => item.user_id === app.viewer?.userId)?.strokes));
    void getValue<DrawStroke[]>(analysis.bundle.scope, 'working-sketch', draftKey).then(draft => {
      if (!active) return;
      if (draft) { setStrokes(parseStrokes(draft)); setDirtyDrawing(true); dirtyRef.current = true; }
      setDraftLoaded(true);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.bundle.scope, draftKey]);
  useEffect(() => { if (draftLoaded && !dirtyRef.current) setStrokes(saved); }, [saved, draftLoaded]);
  function changeSketch(next: DrawStroke[]) {
    sketchRevision.current += 1;
    dirtyRef.current = true;
    setStrokes(next); setDirtyDrawing(true); setDrawingNotice(null);
    const scope = analysis.bundle.scope;
    draftWrites.current = draftWrites.current.catch(() => {}).then(() => putValue(scope, 'working-sketch', draftKey, next));
    void draftWrites.current.catch(error => setDrawingNotice({ text: `Could not retain this sketch: ${friendlyError(error)}`, error: true }));
  }
  const writeDrawing = app.saveStrategyDrawing;
  async function saveDrawing() {
    if (!writeDrawing) return;
    setSavingDrawing(true);
    setDrawingNotice(null);
    const revision = sketchRevision.current;
    try {
      await writeDrawing(strokes);
      await draftWrites.current;
      if (revision === sketchRevision.current) {
        await removeValue(analysis.bundle.scope, 'working-sketch', draftKey);
        dirtyRef.current = false;
        setDirtyDrawing(false);
      }
      // The context resolves once the drawing is safe on this device; ask the queue whether the upload finished.
      const waiting = analysis.bundle.scope && !app.viewer?.demo ? (await drawingQueue(analysis.bundle.scope).pending()).some((item) => item.event_id === analysis.bundle.event.id) : false;
      setPendingUpload(waiting);
      setDrawingNotice({ text: waiting ? 'Drawing saved on this device. It will upload when the connection allows.' : 'Drawing saved.', error: false });
    } catch (error) {
      setDrawingNotice({ text: friendlyError(error, 'Could not save the drawing.'), error: true });
    } finally {
      setSavingDrawing(false);
    }
  }
  const stats = useStatsByTeam(analysis, 'auto');
  const [now, setNow] = useState(Date.now);
  const [observedAt, setObservedAt] = useState<Record<string, number>>({});
  const previousStatuses = useRef(new Map(analysis.bundle.matches.map(match => [match.id, match.status])));
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const newlyPlayed = analysis.bundle.matches.filter(match => match.status === 'played' && previousStatuses.current.get(match.id) !== 'played');
    if (newlyPlayed.length) setObservedAt(current => ({ ...current, ...Object.fromEntries(newlyPlayed.map(match => [match.id, Date.now()])) }));
    previousStatuses.current = new Map(analysis.bundle.matches.map(match => [match.id, match.status]));
  }, [analysis.bundle.matches]);
  const matches = useMemo(() => strategyMatchOrder(analysis.bundle.matches, observedAt, now), [analysis.bundle.matches, observedAt, now]);
  const [matchId, setMatchId] = useState<string | null>(matches[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState<string[]>(() => { const first = matches[0]; return [0, 1, 2].map(index => analysis.teamsById.get(first?.red_teams[index] ?? '')?.displayNumber ?? '').concat([0, 1, 2].map(index => analysis.teamsById.get(first?.blue_teams[index] ?? '')?.displayNumber ?? '')); });
  const [overrides, setOverrides] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [drawing, setDrawing] = useState(false);

  const selected = matches.find((match) => match.id === matchId);
  const label = (match: Match) => matchLabel(match);
  const lineup = (match: Match) => `${match.red_teams.map((id) => analysis.teamsById.get(id)?.displayNumber ?? '—').join(' ')} vs ${match.blue_teams.map((id) => analysis.teamsById.get(id)?.displayNumber ?? '—').join(' ')}`;
  const results = matches.filter((match) => `${label(match)} ${lineup(match)}`.toLowerCase().includes(query.trim().toLowerCase()));

  const slotIds = (match: Match | undefined) => [0, 1, 2].map((i) => match?.red_teams[i] ?? '').concat([0, 1, 2].map((i) => match?.blue_teams[i] ?? ''));
  const effective = overrides ?? slotIds(selected);

  function chooseMatch(match: Match) {
    setMatchId(match.id);
    setOverrides(null);
    setError('');
    setManual(slotIds(match).map((id) => analysis.teamsById.get(id)?.displayNumber ?? ''));
  }
  function applyLineup() {
    const byLabel = new Map<string, Team>();
    for (const team of analysis.bundle.teams) { byLabel.set(String(team.number).toLowerCase(), team); byLabel.set(team.displayNumber.toLowerCase(), team); }
    const picked: string[] = [];
    for (const input of manual) {
      const team = byLabel.get(input.trim().toLowerCase());
      if (!team) { setError(`Team ${input.trim() || '—'} is not in this event.`); return; }
      picked.push(team.id);
    }
    if (new Set(picked).size !== picked.length) { setError('Each robot in the lineup must be different.'); return; }
    setError('');
    setOverrides(picked);
  }

  const alliance = (name: 'Red' | 'Blue', ids: string[]) => {
    const teams = ids.map((id) => analysis.teamsById.get(id)).filter((team): team is Team => Boolean(team));
    const total = (pick: (value: ScoutStats) => number) => teams.reduce((sum, team) => sum + pick(stats.get(team.id) ?? EMPTY_STATS), 0);
    return (
      <Card theme={theme} style={{ borderLeftWidth: 5, borderLeftColor: name === 'Red' ? theme.red : theme.blue }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>{name} alliance · {teams.length}/3 teams</Text>
        {teams.map((team) => {
          const value = stats.get(team.id) ?? EMPTY_STATS;
          const basis = analysis.playedQualification.has(team.id) ? 'competitive' : 'practice';
          return (
            <Pressable key={team.id} accessibilityRole="button" accessibilityLabel={`Open team ${team.displayNumber}`} onPress={() => goTeam(router, team.id)} style={{ minHeight: 56, justifyContent: 'center' }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{team.displayNumber} · {team.name}</Text>
              {value.matches ? <Text style={{ color: theme.muted, fontSize: 13 }}>{`Auto ${formatStat(value.autoAvgScored)} · Teleop ${formatStat(value.teleopAvgScored)} avg · ${value.matches} match${value.matches === 1 ? '' : 'es'}${basis === 'practice' ? ' (practice)' : ''}`}</Text> : null}
            </Pressable>
          );
        })}
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
          Auto avg {formatStat(total((value) => value.autoAvgScored))} · peak {formatStat(total((value) => value.autoMaxScored))}
        </Text>
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
          Teleop avg {formatStat(total((value) => value.teleopAvgScored))} · peak {formatStat(total((value) => value.teleopMaxScored))}
        </Text>
      </Card>
    );
  };

  return (
    <Screen theme={theme} scrollEnabled={!drawing}>
      <SourceNotice theme={theme} analysis={analysis} />
      {matches.length > 10 ? <TextInput accessibilityLabel="Find a match or team" value={query} onChangeText={setQuery} placeholder="Find a match or team" placeholderTextColor={theme.muted} autoCorrect={false} autoCapitalize="none" style={{ minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: theme.text, backgroundColor: theme.surface, borderColor: theme.line }} /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
        {results.map((match) => <Choice key={match.id} theme={theme} label={`${label(match)}${match.status === 'played' ? ' ✓' : ''}`} selected={selected?.id === match.id && !overrides} onPress={() => chooseMatch(match)} />)}
      </ScrollView>
      {!matches.length ? <Notice theme={theme}>No matches are downloaded for this event.</Notice> : null}

      {draftLoaded ? (
        <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: lineupOpen || Boolean(overrides) }} onPress={() => setLineupOpen((open) => !open)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.tint, fontWeight: '700', fontSize: 15 }}>{overrides ? 'Custom lineup' : 'Edit lineup'}</Text>
            <Text style={{ color: theme.muted }}>{lineupOpen || overrides ? '▴' : '▾'}</Text>
          </Pressable>
          {lineupOpen || overrides ? <Section theme={theme}>
            
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[0, 1, 2].map((i) => <TextInput key={`r${i}`} accessibilityLabel={`Red alliance team ${i + 1}`} value={manual[i]} onChangeText={(text) => setManual((current) => current.map((item, index) => (index === i ? text.replace(/[^0-9a-z]/gi, '') : item)))} maxLength={8} placeholder={`R${i + 1}`} placeholderTextColor={theme.muted} autoCapitalize="characters" style={{ flex: 1, minHeight: 52, borderWidth: 2, borderColor: theme.red, borderRadius: 12, textAlign: 'center', color: theme.text, backgroundColor: theme.surface, fontSize: 17 }} />)}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[3, 4, 5].map((i) => <TextInput key={`b${i}`} accessibilityLabel={`Blue alliance team ${i - 2}`} value={manual[i]} onChangeText={(text) => setManual((current) => current.map((item, index) => (index === i ? text.replace(/[^0-9a-z]/gi, '') : item)))} maxLength={8} placeholder={`B${i - 2}`} placeholderTextColor={theme.muted} autoCapitalize="characters" style={{ flex: 1, minHeight: 52, borderWidth: 2, borderColor: theme.blue, borderRadius: 12, textAlign: 'center', color: theme.text, backgroundColor: theme.surface, fontSize: 17 }} />)}
            </View>
            {error ? <Notice theme={theme} tone="danger">{error}</Notice> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button theme={theme} title="Use lineup" onPress={applyLineup} style={{ flex: 1 }} />
              {overrides ? <Button theme={theme} secondary title="Use scheduled" onPress={() => { setOverrides(null); setError(''); setManual(slotIds(selected).map((id) => analysis.teamsById.get(id)?.displayNumber ?? '')); }} style={{ flex: 1 }} /> : null}
            </View>
          </Section> : null}
          {alliance('Red', effective.slice(0, 3).filter(Boolean))}
          {alliance('Blue', effective.slice(3).filter(Boolean))}
          
          <Section theme={theme} title="Strategy drawing">
            
            {dirtyDrawing ? <Notice theme={theme}>Unsaved sketch</Notice> : null}
            <StrategyCanvas theme={theme} strokes={strokes} flipped={flipped} onChange={changeSketch} fieldArt={FIELD_ART} onDrawingChange={setDrawing} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button theme={theme} secondary title={flipped ? 'Alliance view: flipped' : 'Flip alliance view'} onPress={() => setFlipped((value) => !value)} style={{ flex: 1 }} />
              <Button theme={theme} title={savingDrawing ? 'Saving…' : dirtyDrawing ? 'Save drawing' : 'Saved'} disabled={!writeDrawing || savingDrawing || !dirtyDrawing} onPress={() => { void saveDrawing(); }} style={{ flex: 1 }} />
            </View>
            {!app.online ? <Notice theme={theme}>Offline · will upload when connected</Notice> : pendingUpload ? <Notice theme={theme} tone="warning">Waiting to upload</Notice> : null}
            {drawingNotice ? <Notice theme={theme} tone={drawingNotice.error ? 'danger' : 'success'}>{drawingNotice.text}</Notice> : null}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

// ------------------------------------------------------------------ payload display

const LABELS: Record<string, string> = {
  ...Object.fromEntries(PRE_SCOUT_TEXT_FIELDS.map((field) => [field.id, field.label])),
  ...Object.fromEntries(Object.values(PIT_TEXT_FIELDS).map((field) => [field.id, field.label])),
  average_pieces: 'Average game pieces scored', driver_experience: 'Driver experience', operator_experience: 'Operator experience',
  drivetrain_length: 'Drivetrain length (in)', drivetrain_width: 'Drivetrain width (in)', dimensions: 'Drivetrain dimensions',
  robot_weight: 'Robot weight (lb)', hopper_capacity: 'Maximum hopper capacity (fuel)', traversal: 'Traversal',
  auto_routines_notes: 'Auton notes',
};
const titleCase = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function PayloadList({ theme, payload }: { theme: Palette; payload: Record<string, unknown> }) {
  const drawing = typeof payload.auto_routines_drawing === 'string' ? payload.auto_routines_drawing : '';
  const entries = Object.entries(payload).filter(([key, value]) => key !== 'auto_routines_drawing' && value !== null && value !== undefined && value !== '');
  return (
    <View style={{ gap: 8 }}>
      {entries.map(([key, value]) => (
        <View key={key} style={{ gap: 2 }}>
          <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '600' }}>{LABELS[key] ?? titleCase(key)}</Text>
          <Text style={{ color: theme.text, fontSize: 15, lineHeight: 21 }}>{typeof value === 'object' ? JSON.stringify(value) : key === 'traversal' && typeof value === 'string' && /^(bump|trench)(,(bump|trench))?$/.test(value) ? value.split(',').map((item) => item[0].toUpperCase() + item.slice(1)).join(', ') : String(value)}</Text>
        </View>
      ))}
      {drawing.includes('<svg') ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '600' }}>Autonomous routes</Text>
          <View style={{ aspectRatio: 1380 / 674, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.panel }}><SvgXml xml={drawing} width="100%" height="100%" /></View>
        </View>
      ) : null}
      {!entries.length && !drawing ? <Text style={{ color: theme.muted }}>No field values were saved.</Text> : null}
    </View>
  );
}

// ------------------------------------------------------------------ team profile

const DRIVETRAINS = ['Swerve', 'Tank'];
const SHOOTERS = ['Single Turret', 'Single Fixed Shooter', 'Double Wide Shooter', 'Dumper', 'No Shooter', 'Triple Wide Shooter', 'Dual Fixed Shooters', 'Double Turret'];

export function TeamProfileScreen({ teamId }: { teamId: string }) {
  const app = useFeatureApp();
  const { theme } = app;
  const router = useRouter();
  const analysis = useAnalysis();
  const [scope, setScope] = useState<'competitive' | 'practice' | 'all'>('competitive');
  const [openMatch, setOpenMatch] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [robotNotice, setRobotNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [sourceBusy, setSourceBusy] = useState<string | null>(null);
  const [sourceNotice, setSourceNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [chartMetrics, setChartMetrics] = useState(['totalFuel', 'autoFuel', 'teleopFuel']);
  if (!analysis) return <NoEvent theme={theme} />;
  const team = analysis.teamsById.get(teamId);
  if (!team) return <Screen theme={theme}><Notice theme={theme} tone="warning">That team is not part of the downloaded event.</Notice></Screen>;

  const value = teamStats(analysis, teamId, 'competitive');
  const mine = matchEntries(analysis).filter((entry) => entry.team_id === teamId);
  const sources = analysis.bundle.reportSources.filter((source) => source.team_id === teamId);

  // Timeline: scheduled matches the team plays, then manual reports with no scheduled slot.
  type Slot = { key: string; label: string; type: string; alliance: 'red' | 'blue' | null; status: string; order: number; reports: NativeEntry[]; outcome?: 'win' | 'loss' | 'tie' | 'pending'; score?: string };
  const slots: Slot[] = [];
  const byKey = new Map<string, NativeEntry[]>();
  mine.forEach((entry, index) => { const key = matchReportKey(entry, index); byKey.set(key, [...(byKey.get(key) ?? []), entry]); });
  for (const match of analysis.bundle.matches.filter((item) => [...item.red_teams, ...item.blue_teams].includes(teamId))) {
    const key = `scheduled:${match.id}`;
    const result = matchOutcome(match as ScoredMatch, teamId);
    slots.push({ key, label: matchLabel(match), type: match.match_type, alliance: match.red_teams.includes(teamId) ? 'red' : 'blue', status: match.status, order: 0, reports: byKey.get(key) ?? [], outcome: result.outcome, score: result.score });
    byKey.delete(key);
  }
  slots.sort((a, b) => analysis.matchesById.size && compareMatches(
    analysis.bundle.matches.find((match) => `scheduled:${match.id}` === a.key) ?? { match_number: 0, match_type: a.type },
    analysis.bundle.matches.find((match) => `scheduled:${match.id}` === b.key) ?? { match_number: 0, match_type: b.type },
  ));
  for (const [key, reports] of byKey) {
    const manual = asRecord(reports[0].payload.manual_match);
    const stage = typeof manual.stage === 'string' ? manual.stage.trim().toLowerCase() : 'other';
    slots.push({ key, label: manualMatchLabel(manual), type: stage === 'qualification' || stage === 'practice' ? stage : ['quarterfinal', 'semifinal', 'final', 'playoff'].includes(stage) ? 'playoff' : 'other', alliance: manual.alliance === 'blue' ? 'blue' : manual.alliance === 'red' ? 'red' : null, status: 'manual', order: 1, reports });
  }
  const round = (slot: Slot) => slot.type === 'practice' ? 0 : slot.type === 'qualification' ? 1 : slot.label.startsWith('Semifinal') ? 3 : slot.label.startsWith('Final') ? 4 : slot.label.startsWith('Tiebreaker') ? 5 : slot.type === 'playoff' ? 2 : 6;
  slots.sort((a, b) => round(a) - round(b) || a.label.localeCompare(b.label, undefined, { numeric: true }));
  const visibleSlots = slots.filter((slot) => scope === 'all' || (scope === 'practice' ? slot.type === 'practice' : slot.type === 'qualification' || slot.type === 'playoff'));
  const timelineMetrics = [
    { key: 'totalFuel', label: 'Avg fuel', color: theme.red }, { key: 'autoFuel', label: 'Auto fuel', color: '#c79314' }, { key: 'teleopFuel', label: 'Teleop fuel', color: theme.blue },
    { key: 'ferried', label: 'Avg ferried', color: '#1498a8' }, { key: 'autoFerried', label: 'Auto ferried', color: '#d78227' }, { key: 'teleopFerried', label: 'Teleop ferried', color: '#639627' },
    { key: 'fouls', label: 'Fouls', color: '#ad77d3' }, { key: 'defense', label: 'Defense', color: theme.success }, { key: 'broken', label: 'Broken', color: '#d9668c' },
  ];
  const timelineValue = (slot: Slot, key: string) => {
    const reports = selectedMatchReportEntries(slot.reports, sources);
    if (!reports.length) return null;
    const values = reports.map(report => reportValues(report.payload));
    const read = (value: ReturnType<typeof reportValues>) => key === 'totalFuel' ? value.autoFuel + value.teleopFuel : key === 'ferried' ? value.autoFerried + value.teleopFerried : key === 'autoFerried' ? value.autoFerried : key === 'teleopFerried' ? value.teleopFerried : value[key as keyof typeof value];
    if (key === 'broken') return Math.max(...values.map(read));
    return values.reduce((sum, value) => sum + read(value), 0) / values.length;
  };

  const entriesFor = (kind: 'pit' | 'pre_scout') => eventEntries(analysis.bundle, app.records).filter(entry => entry.entry_type === kind && entry.team_id === teamId);
  const pit = entriesFor('pit');
  const pre = entriesFor('pre_scout');
  const photos = [
    ...app.photos.filter((photo) => photo.team_id === teamId).map((photo) => ({ id: photo.id, uri: photo.localUri, pending: photo.status !== 'synced' })),
    ...analysis.bundle.photos.filter((photo) => photo.team_id === teamId && (photo.signedUrl || photo.localUri)).map((photo) => ({ id: photo.id, uri: (photo.localUri ?? photo.signedUrl)!, pending: false })),
  ];
  const scoredMatches = analysis.bundle.matches.filter((match) => [...match.red_teams, ...match.blue_teams].includes(teamId)) as ScoredMatch[];
  const playedMatches = scoredMatches.filter((match) => match.status === 'played' && match.match_type !== 'practice');
  const record = teamRecord(scoredMatches, teamId);
  const fuel = officialFuelAverages(playedMatches, teamId);
  const climb = officialClimb(playedMatches, teamId);
  const tbaTeam = officialForTeam(analysis.bundle.official, team.number, team.displayNumber);
  const robot = analysis.bundle.robotProfiles[teamId];
  const robotRows = robot ? Object.entries(robot).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object') : [];
  const current = photos[Math.min(photoIndex, Math.max(0, photos.length - 1))];
  const drivetrain = typeof robot?.drivetrain_type === 'string' ? robot.drivetrain_type : null;
  const shooter = typeof robot?.shooter_type === 'string' ? robot.shooter_type : null;
  // Any organization member may edit; the server route and database policy are the real gate.
  const canEditRobot = typeof app.saveRobotProfile === 'function' && Boolean(app.viewer);
  async function saveRobot(next: { drivetrain_type: string | null; shooter_type: string | null }) {
    if (!app.saveRobotProfile) return;
    setRobotNotice(null);
    try {
      await app.saveRobotProfile(teamId, next);
      setRobotNotice({ text: 'Robot profile saved.', error: false });
    } catch (error) {
      setRobotNotice({ text: friendlyError(error, 'Could not save the robot profile.'), error: true });
    }
  }

  const tiles: { label: string; value: string; detail: string }[] = [
    { label: 'Scouted matches', value: String(value.matches), detail: value.entries ? `${value.entries} report${value.entries === 1 ? '' : 's'}` : '' },
    { label: 'Auto', value: `Avg ${formatStat(value.autoAvgScored)}`, detail: `Peak ${formatStat(value.autoMaxScored)} scored · avg ${formatStat(value.autoAvgFerried)} ferried` },
    { label: 'Teleop', value: `Avg ${formatStat(value.teleopAvgScored)}`, detail: `Peak ${formatStat(value.teleopMaxScored)} scored · avg ${formatStat(value.teleopAvgFerried)} ferried` },
    { label: 'Reliability', value: `${value.brokenPercent.toFixed(0)}% broken`, detail: `${formatStat(value.avgFouls)} fouls · defense ${formatStat(value.defense)}` },
    { label: 'TBA rank', value: tbaTeam.rank ? `#${tbaTeam.rank}` : '—', detail: tbaTeam.record ? `${tbaTeam.record} record${tbaTeam.opr !== null ? ` · OPR ${formatStat(tbaTeam.opr)}` : ''}` : analysis.bundle.official?.apiError ? 'TBA unavailable' : 'not published' },
    { label: 'Official record', value: `${record.wins}-${record.losses}-${record.ties}`, detail: 'W-L-T' },
    ...(fuel ? [{ label: 'Official alliance fuel', value: `${formatStat(fuel.total)} avg`, detail: `Auto ${formatStat(fuel.auto)} · teleop ${formatStat(fuel.teleop)} · alliance totals over ${fuel.matches} match${fuel.matches === 1 ? '' : 'es'}` }] : []),
    ...(climb.matches ? [{ label: 'Official climb', value: `Endgame ${climb.endgameClimb}`, detail: `${climb.endgameClimbRate.toFixed(0)}% endgame · auto ${climb.autoClimb} (${climb.autoClimbRate.toFixed(0)}%) · ${climb.matches} match${climb.matches === 1 ? '' : 'es'}` }] : []),
  ];

  return (
    <Screen theme={theme}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: '700' }}>{team.displayNumber} · {team.name}</Text>
      {team.displayNumber !== String(team.number) ? <Text style={{ color: theme.muted }}>Team {team.number}</Text> : null}

      {current ? (
        <View style={{ gap: 8 }}>
          <PhotoPager theme={theme} photos={photos} label={`Team ${team.displayNumber} robot photo`} index={photoIndex} onIndex={setPhotoIndex} />
          {current.pending ? <Badge theme={theme} tone="warning" text="Photo not uploaded yet" /> : null}
        </View>
      ) : null}

      <SourceNotice theme={theme} analysis={analysis} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((tile) => (
          <Card key={tile.label} theme={theme} style={{ width: '48%', flexGrow: 0, padding: 12, gap: 2 }}>
            <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>{tile.label}</Text>
            <Text style={{ color: theme.text, fontSize: 19, fontWeight: '700' }}>{tile.value}</Text>
            {tile.detail ? <Text style={{ color: theme.muted, fontSize: 12 }}>{tile.detail}</Text> : null}
          </Card>
        ))}
      </View>
      

      <Section theme={theme} title="Robot profile">
        {robotRows.length ? <Card theme={theme}>{robotRows.map(([key, v]) => <Text key={key} style={{ color: theme.text, fontSize: 15 }}>{titleCase(key.replace(/_type$/, ''))}: {String(v)}</Text>)}</Card> : null}
        {canEditRobot ? (
          <Card theme={theme}>
            <Text style={{ color: theme.text, fontWeight: '600' }}>Drivetrain</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['', ...DRIVETRAINS].map((option) => <Choice key={option || 'unknown'} theme={theme} label={option || 'Unknown'} selected={(drivetrain ?? '') === option} onPress={() => void saveRobot({ drivetrain_type: option || null, shooter_type: shooter })} />)}
            </View>
            <Text style={{ color: theme.text, fontWeight: '600' }}>Shooter</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['', ...SHOOTERS].map((option) => <Choice key={option || 'unknown'} theme={theme} label={option || 'Unknown'} selected={(shooter ?? '') === option} onPress={() => void saveRobot({ drivetrain_type: drivetrain, shooter_type: option || null })} />)}
            </View>
            {robotNotice ? <Notice theme={theme} tone={robotNotice.error ? 'danger' : 'success'}>{robotNotice.text}</Notice> : null}
          </Card>
        ) : <Text style={{ color: theme.muted, fontSize: 13 }}>Sign in to edit the robot profile.</Text>}
      </Section>

      <Section theme={theme} title="Match timeline">
        <Tabs theme={theme} value={scope} onChange={(id) => { setScope(id as typeof scope); setOpenMatch(null); }} items={[{ id: 'competitive', label: 'Qualifications + playoffs' }, { id: 'practice', label: 'Practice' }, { id: 'all', label: 'All' }]} />
        <Text style={{ color: theme.muted }}>{visibleSlots.filter((slot) => slot.reports.length).length} / {visibleSlots.length} scouted</Text>
        {visibleSlots.some(slot => slot.reports.length) ? <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{timelineMetrics.map(metric => <Choice key={metric.key} theme={theme} label={metric.label} selected={chartMetrics.includes(metric.key)} onPress={() => setChartMetrics(current => current.includes(metric.key) ? current.length === 1 ? current : current.filter(key => key !== metric.key) : [...current, metric.key].slice(-4))} />)}</View>
          <MetricChart theme={theme} labels={visibleSlots.map(slot => slot.label.replace('Qualification ', 'Q').replace('Practice ', 'P').replace('Playoff Match ', 'M'))} series={timelineMetrics.filter(metric => chartMetrics.includes(metric.key)).map(metric => ({ label: metric.label, color: metric.color, values: visibleSlots.map(slot => timelineValue(slot, metric.key)) }))} />
        </> : <Text style={{ color: theme.muted }}>No submitted reports yet.</Text>}
        {sourceNotice ? <Notice theme={theme} tone={sourceNotice.error ? 'danger' : 'success'}>{sourceNotice.text}</Notice> : null}
        {visibleSlots.length ? visibleSlots.map((slot) => {
          const selectedId = sources.find((source) => source.match_key === slot.key)?.selected_entry_id;
          const used = selectedMatchReportEntries(slot.reports, sources.map((source) => ({ ...source })));
          const open = openMatch === slot.key;
          const sums = used.reduce((total, report) => { const v = reportValues(report.payload); return { scored: total.scored + v.autoScored + v.teleopScored, ferried: total.ferried + v.autoFerried + v.teleopFerried }; }, { scored: 0, ferried: 0 });
          const n = used.length || 1;
          return (
            <View key={slot.key} style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 12, gap: 6, borderLeftWidth: 5, borderLeftColor: slot.alliance === 'blue' ? theme.blue : slot.alliance === 'red' ? theme.red : theme.line }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${slot.label}, ${slot.reports.length ? `${slot.reports.length} reports` : 'missing'}`} onPress={() => slot.reports.length && setOpenMatch(open ? null : slot.key)} style={{ minHeight: 48, justifyContent: 'center', gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16, flex: 1 }}>{slot.label}</Text>
                  <Badge theme={theme} tone={slot.reports.length ? 'success' : 'muted'} text={slot.reports.length ? `Scouted · ${slot.reports.length}` : 'Missing'} />
                </View>
                <Text style={{ color: theme.muted, fontSize: 13 }}>
                  {slot.alliance ? `${slot.alliance === 'red' ? 'Red' : 'Blue'} alliance · ` : ''}{slot.outcome && slot.outcome !== 'pending' ? `${slot.outcome === 'win' ? 'Won' : slot.outcome === 'loss' ? 'Lost' : 'Tied'} ${slot.score}` : slot.status === 'played' ? 'played' : slot.status === 'manual' ? 'manual report' : slot.status}
                  {slot.reports.length ? ` · Scored ${formatStat(sums.scored / n)} · Ferried ${formatStat(sums.ferried / n)}` : ''}
                </Text>
                {selectedId ? <Text style={{ color: theme.tint, fontSize: 12 }}>Admin selected one report for this match.</Text> : null}
              </Pressable>
              {(() => {
                const tbaKey = analysis.bundle.matches.find((item) => item.tba_match_key === slot.key)?.tba_match_key;
                if (!tbaKey || tbaKey.startsWith('manual_')) return null;
                return <Text accessibilityRole="link" onPress={() => void Linking.openURL(`https://www.thebluealliance.com/match/${tbaKey}`).catch(() => undefined)} style={{ color: theme.tint, fontSize: 13, fontWeight: '600' }}>View on The Blue Alliance ↗</Text>;
              })()}
              {app.viewer?.role === 'admin' && slot.reports.length > 1 ? (
                <View style={{ gap: 6 }}>
                  <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>Data source for this match</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {[{ id: null as string | null, label: 'Combined' }, ...slot.reports.map((report) => ({ id: report.id as string | null, label: (analysis.bundle.profiles?.[report.scout_user_id] ?? 'Scout').split(' ')[0] }))].map((option) => (
                      <Choice key={option.id ?? 'combined'} theme={theme} label={option.label} selected={(selectedId ?? null) === option.id}
                        onPress={() => {
                          if (sourceBusy || (selectedId ?? null) === option.id) return;
                          setSourceBusy(slot.key); setSourceNotice(null);
                          app.saveReportSource(teamId, slot.key, option.id)
                            .then(() => setSourceNotice({ text: option.id ? 'Selected report saved.' : 'Using combined reports.', error: false }))
                            .catch((error: unknown) => setSourceNotice({ text: friendlyError(error, 'Could not save the selected report.'), error: true }))
                            .finally(() => setSourceBusy(null));
                        }} />
                    ))}
                  </View>
                  {sourceBusy === slot.key ? <Text style={{ color: theme.muted, fontSize: 12 }}>Saving…</Text> : null}
                </View>
              ) : null}
              {open ? slot.reports.map((report, index) => {
                const payload = report.payload;
                const auto = asRecord(payload.auto);
                const teleop = asRecord(payload.teleop);
                const issues = breakageIssues(payload);
                const defended = Array.isArray(payload.defended_teams) ? payload.defended_teams.map((id) => analysis.teamsById.get(String(id))?.displayNumber ?? '?').join(', ') : '';
                return (
                  <View key={report.id} style={{ gap: 4, paddingTop: 8, borderTopWidth: 1, borderColor: theme.line }}>
                    <Text style={{ color: theme.text, fontWeight: '600' }}>Report {index + 1} of {slot.reports.length}{analysis.bundle.profiles?.[report.scout_user_id] ? ` · ${analysis.bundle.profiles[report.scout_user_id]}` : ''}{report.id === selectedId ? ' · selected' : ''}</Text>
                    {payload.no_show === true ? <Badge theme={theme} tone="danger" text="No show" /> : null}
                    <Text style={{ color: theme.text }}>Start: {readableSpot(payload.starting_spot)}</Text>
                    <Text style={{ color: theme.text }}>Auto — scored {String(auto.shoot ?? payload.auto_fuel ?? 0)} · ferried {String(auto.ferry ?? 0)}</Text>
                    <Text style={{ color: theme.text }}>Teleop — scored {String(teleop.shoot ?? payload.teleop_fuel ?? 0)} · ferried {String(teleop.ferry ?? 0)}</Text>
                    <Text style={{ color: theme.text }}>Fouls {String(payload.fouls ?? 0)} · Defense {payload.defense === true ? `level ${String(payload.defense_level ?? '—')}/10${defended ? ` vs ${defended}` : ''}` : 'not played'}</Text>
                    <Text style={{ color: issues.length ? theme.danger : theme.text }}>Broken: {issues.length ? issues.map((issue) => `${issue.issue}${issue.timestamp ? ` (${issue.timestamp})` : ''}`).join(' · ') : payload.robot_broke === true ? 'Yes' : 'No'}</Text>
                    {typeof payload.comments === 'string' && payload.comments.trim() ? <Text style={{ color: theme.text }}>“{payload.comments.trim()}”</Text> : null}
                    <Button theme={theme} secondary title="Open report" onPress={() => router.push(`/submission/${report.id}` as never)} />
                  </View>
                );
              }) : null}
            </View>
          );
        }) : <Text style={{ color: theme.muted }}>No matches have been published for this team in this view.</Text>}
      </Section>

      <Section theme={theme} title="Scouting research">
        {[{ title: 'Pit scouting', list: pit }, { title: 'Pre-scouting', list: pre }].map((group) => (
          <Card key={group.title} theme={theme}>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}>{group.title}</Text>
            {group.list.length ? group.list.map((entry) => (
              <View key={entry.id} style={{ gap: 8, paddingVertical: 6, borderTopWidth: 1, borderColor: theme.line }}>
                <Text style={{ color: theme.muted, fontSize: 13 }}>{analysis.bundle.profiles?.[entry.scout_user_id] ? `${analysis.bundle.profiles[entry.scout_user_id]} · ` : ''}{entry.status === 'submitted' ? (entry.submitted_at ? new Date(entry.submitted_at).toLocaleString() : 'Submitted') : 'Draft'}</Text>
                <PayloadList theme={theme} payload={entry.payload} />
                <Button theme={theme} secondary title="Open report" onPress={() => router.push(`/submission/${entry.id}` as never)} />
              </View>
            )) : <Text style={{ color: theme.muted }}>Not scouted yet.</Text>}
          </Card>
        ))}
      </Section>
    </Screen>
  );
}

// ------------------------------------------------------------------ entry point

export function StrategyScreen({ mode }: { mode: 'summary' | 'compare' | 'picklist' | 'strategy' }) {
  const { theme } = useFeatureApp();
  const analysis = useAnalysis();
  if (!analysis) return <NoEvent theme={theme} />;
  if (mode === 'compare') return <CompareView analysis={analysis} theme={theme} />;
  if (mode === 'picklist') return <PicklistView analysis={analysis} theme={theme} />;
  if (mode === 'strategy') return <MatchStrategyView key={`${analysis.bundle.scope}:${analysis.bundle.event.id}`} analysis={analysis} theme={theme} />;
  return <SummaryView analysis={analysis} theme={theme} />;
}

export default StrategyScreen;
