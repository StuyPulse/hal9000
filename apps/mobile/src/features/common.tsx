import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import type { EventBundle, FeatureContext, Match, Palette, PicklistRanking, Team } from '../core/types';
import { useApp } from '../core/context';
import { Card } from '../components/ui';
import { Screen as AppScreen } from '../components/Screen';

export type PicklistHistoryRow = {
  id: string; team_id: string; actor_user_id: string | null; action: 'baseline' | 'created' | 'updated' | 'deleted';
  before_state: Record<string, unknown> | null; after_state: Record<string, unknown> | null; created_at: string;
};
export type MetaPatch = { id?: string; name: string; color: string; sort_order: number };
/** Raw TBA-derived match fields that Codex is adding to core Match. Optional until then. */
export type ScoredMatch = Match & { red_score?: number | null; blue_score?: number | null; tba_score_breakdown?: Record<string, unknown> | null; actual_at?: string | null };
/** Bundle fields and context writers that may not exist in core yet; every use checks for presence. */
export type BundleExtras = { picklistHistory?: PicklistHistoryRow[]; profiles?: Record<string, string>; strategyDrawings?: { id: string; user_id: string; strokes: unknown }[] };
/** Core now declares every writer and bundle field; this alias keeps feature imports stable. */
export type FeatureApp = FeatureContext;
export const useFeatureApp = (): FeatureApp => useApp();

/** The screen's scroll view, so drawing canvases can block it while a finger is down on them. */
export const ScrollRefContext = createContext<React.RefObject<unknown> | null>(null);

export function Screen({ theme, children, scrollEnabled = true, footer, fill = false }: { theme: Palette; children: React.ReactNode; scrollEnabled?: boolean; footer?: React.ReactNode; fill?: boolean }) {
  const scrollRef = useRef<unknown>(null);
  return (
    <ScrollRefContext.Provider value={scrollRef}>
    <AppScreen scroll={!fill} scrollEnabled={scrollEnabled} scrollRef={scrollRef} footer={footer}>{children}</AppScreen>
    </ScrollRefContext.Provider>
  );
}

export function Notice({ theme, tone = 'muted', children }: { theme: Palette; tone?: 'muted' | 'warning' | 'danger' | 'success'; children: React.ReactNode }) {
  const color = tone === 'muted' ? theme.muted : theme[tone];
  return (
    <View accessibilityRole={tone === 'danger' ? 'alert' : undefined} style={[local.notice, { borderColor: color, backgroundColor: theme.surface }]}>
      <Text style={{ color: tone === 'muted' ? theme.text : color, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function Badge({ theme, text, tone = 'muted' }: { theme: Palette; text: string; tone?: 'muted' | 'success' | 'warning' | 'danger' | 'tint' }) {
  const color = tone === 'muted' ? theme.muted : tone === 'tint' ? theme.tint : theme[tone];
  return <Text style={[local.badge, { color, borderColor: color }]}>{text}</Text>;
}

/** Large +/- with direct numeric entry; commits clamped values on blur. */
export function Stepper({ theme, label, value, min, max, step, unit, hint, onChange, emptyWhenZero = false }: { theme: Palette; label: string; value: number; min: number; max: number; step: number; unit: string; hint?: string; onChange: (value: number) => void; emptyWhenZero?: boolean }) {
  const [text, setText] = useState(emptyWhenZero && value === 0 ? '' : String(value));
  useEffect(() => { setText(emptyWhenZero && value === 0 ? '' : String(value)); }, [value, emptyWhenZero]);
  const commit = (next: number) => onChange(Math.min(max, Math.max(min, Math.round(next / step) * step)));
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      {hint ? <Text style={{ color: theme.muted, fontSize: 13 }}>{hint}</Text> : null}
      <View style={local.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} disabled={value <= min} onPress={() => commit(value - step)} style={[local.stepButton, { backgroundColor: theme.panel, opacity: value <= min ? 0.4 : 1 }]}>
          <Text style={{ color: theme.tint, fontSize: 24, fontWeight: '700' }}>−</Text>
        </Pressable>
        <TextInput
          accessibilityLabel={`${label} in ${unit}`}
          value={text}
          onChangeText={(raw) => setText(raw.replace(step % 1 ? /[^0-9.]/g : /[^0-9]/g, ''))}
          onEndEditing={() => (text === '' ? commit(min) : commit(Number(text)))}
          onBlur={() => (text === '' ? commit(min) : commit(Number(text)))}
          keyboardType={step % 1 ? 'decimal-pad' : 'number-pad'}
          placeholder="0"
          placeholderTextColor={theme.muted}
          style={[local.stepInput, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.line }]}
        />
        <Text style={{ color: theme.muted, fontSize: 15, minWidth: 34 }}>{unit}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} disabled={value >= max} onPress={() => commit(value + step)} style={[local.stepButton, { backgroundColor: theme.panel, opacity: value >= max ? 0.4 : 1 }]}>
          <Text style={{ color: theme.tint, fontSize: 24, fontWeight: '700' }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Searchable team chooser; matches permanent number, event alias and name. */
export function TeamPicker({ theme, teams, value, onChange, markedIds = [], markedLabel, disabled = false, label = 'Team' }: { theme: Palette; teams: Team[]; value: string | null; onChange: (teamId: string) => void; markedIds?: string[]; markedLabel?: string; disabled?: boolean; label?: string }) {
  const [query, setQuery] = useState('');
  const [changing, setChanging] = useState(false);
  const marked = useMemo(() => new Set(markedIds), [markedIds]);
  const sorted = useMemo(() => [...teams].sort((a, b) => a.number - b.number), [teams]);
  const selected = sorted.find((team) => team.id === value);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sorted.filter((team) => !needle || `${team.number} ${team.displayNumber} ${team.name}`.toLowerCase().includes(needle)).slice(0, 8);
  }, [query, sorted]);
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      {selected ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderRadius: 14, paddingLeft: 14, paddingRight: 6, minHeight: 56 }}>
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '700', flex: 1 }} numberOfLines={1}>{selected.displayNumber} · {selected.name}</Text>
          {marked.has(selected.id) && markedLabel ? <Badge theme={theme} tone="success" text={markedLabel} /> : null}
          {!disabled ? <Pressable accessibilityRole="button" accessibilityLabel={changing ? 'Keep this team' : 'Change team'} onPress={() => setChanging((value) => !value)} style={{ minHeight: 48, paddingHorizontal: 12, justifyContent: 'center' }}><Text style={{ color: theme.tint, fontWeight: '700', fontSize: 15 }}>{changing ? 'Keep' : 'Change'}</Text></Pressable> : null}
        </View>
      ) : null}
      {!disabled && (!selected || changing) ? (
        <>
          <TextInput
            accessibilityLabel={`Search ${label.toLowerCase()} by number or name`}
            value={query}
            onChangeText={setQuery}
            placeholder="Search 694, 1678, robot name…"
            placeholderTextColor={theme.muted}
            autoCorrect={false}
            autoCapitalize="none"
            style={[local.search, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.line }]}
          />
          {results.length ? results.map((team) => (
            <Pressable key={team.id} accessibilityRole="button" accessibilityState={{ selected: team.id === value }} accessibilityLabel={`Team ${team.displayNumber} ${team.name}${marked.has(team.id) && markedLabel ? `, ${markedLabel}` : ''}`} onPress={() => { onChange(team.id); setQuery(''); setChanging(false); }} style={[local.result, { borderColor: team.id === value ? theme.tint : theme.line, backgroundColor: team.id === value ? theme.selection : theme.surface }]}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>{team.displayNumber}</Text>
              <Text style={{ color: theme.muted, flex: 1, fontSize: 15 }} numberOfLines={1}>{team.name}</Text>
              {marked.has(team.id) && markedLabel ? <Badge theme={theme} tone="success" text="Reported" /> : null}
            </Pressable>
          )) : <Text style={{ color: theme.muted }}>No event teams match that search.</Text>}
        </>
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  notice: { borderWidth: 1, borderRadius: 12, padding: 12 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, fontSize: 12, fontWeight: '700', overflow: 'hidden', alignSelf: 'flex-start' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: { minWidth: 52, minHeight: 52, borderRadius: Platform.OS === 'android' ? 26 : 12, alignItems: 'center', justifyContent: 'center' },
  stepInput: { flex: 1, minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  search: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  result: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
