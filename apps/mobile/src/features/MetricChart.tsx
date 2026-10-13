import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import type { Palette } from '../core/types';
import { Choice } from '../components/ui';
import { formatStat, type ScoutStats } from './stats';

const STAT_LABELS: Record<keyof Omit<ScoutStats, 'entries' | 'matches'>, string> = {
  peakFuel: 'Peak fuel', totalFuel: 'Total fuel', autoFuel: 'Auto fuel', teleopFuel: 'Teleop fuel', autoPeakFuel: 'Auto peak fuel', teleopPeakFuel: 'Teleop peak fuel',
  autoMaxScored: 'Auto max scored', autoMaxFerried: 'Auto max ferried', autoAvgScored: 'Auto avg scored', autoAvgFerried: 'Auto avg ferried',
  teleopMaxScored: 'Teleop max scored', teleopMaxFerried: 'Teleop max ferried', teleopAvgScored: 'Teleop avg scored', teleopAvgFerried: 'Teleop avg ferried',
  avgFouls: 'Avg fouls', defense: 'Defense', brokenPercent: '% broken',
};
type StatKey = keyof typeof STAT_LABELS;
/** Website StatsGraph semantics: 1–4 independently selected metrics, normalized bars. */
export function ComparisonStatsGraph({ theme, series }: { theme: Palette; series: { label: string; color: string; stats: ScoutStats }[] }) {
  const [keys, setKeys] = useState<StatKey[]>(['totalFuel', 'autoAvgScored', 'teleopAvgScored']);
  const max = Math.max(1, ...series.flatMap(item => keys.map(key => item.stats[key])));
  return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: theme.text, fontWeight: '700', fontSize: 18 }}>Stats graph</Text>
    <Text style={{ color: theme.muted }}>Choose up to four metrics. Bars normalize to the largest selected value.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(Object.keys(STAT_LABELS) as StatKey[]).map(key => <Choice key={key} theme={theme} label={STAT_LABELS[key]} selected={keys.includes(key)} onPress={() => setKeys(current => current.includes(key) ? current.length === 1 ? current : current.filter(item => item !== key) : [...current, key].slice(-4))} />)}</View>
    {keys.map(key => <View key={key} style={{ gap: 8 }}><Text style={{ color: theme.text, fontWeight: '600' }}>{STAT_LABELS[key]}</Text>{series.map(item => <View key={item.label} accessible accessibilityLabel={`Team ${item.label}, ${STAT_LABELS[key]} ${formatStat(item.stats[key])}`} style={{ gap: 4 }}><Text style={{ color: theme.text }}>{item.label} · {formatStat(item.stats[key])}</Text><View style={{ height: 20, backgroundColor: theme.panel, borderRadius: 4 }}><View style={{ height: 20, width: `${Math.max(0, item.stats[key]) / max * 100}%`, backgroundColor: item.color, borderRadius: 4 }} /></View></View>)}</View>)}
  </View>;
}

export type ChartSeries = { label: string; color: string; values: (number | null)[] };
/** A real metric chart, with missing observations left as gaps rather than zeroes. */
export function MetricChart({ theme, labels, series }: { theme: Palette; labels: string[]; series: ChartSeries[] }) {
  const width = Math.max(320, labels.length * 56 + 64), height = 240;
  const finite = series.flatMap(item => item.values.filter((value): value is number => value !== null && Number.isFinite(value)));
  const max = Math.max(1, ...finite), min = Math.min(0, ...finite), range = max - min;
  const x = (index: number) => 44 + index * (width - 68) / Math.max(1, labels.length - 1);
  const y = (value: number) => 190 - (value - min) / range * 168;
  return <View style={{ gap: 8 }}>
    <ScrollView horizontal accessibilityLabel="Metric chart; scroll horizontally to review every match">
      <Svg width={width} height={height} accessibilityRole="image" accessibilityLabel={series.map(item => `${item.label}: ${item.values.map((value, index) => `${labels[index]} ${value === null ? 'not recorded' : value.toFixed(2)}`).join(', ')}`).join('. ')}>
        {[0, 0.5, 1].map(fraction => <React.Fragment key={fraction}><Line x1={44} x2={width - 24} y1={y(min + range * fraction)} y2={y(min + range * fraction)} stroke={theme.line} /><SvgText x={38} y={y(min + range * fraction) + 4} textAnchor="end" fill={theme.muted} fontSize={11}>{(min + range * fraction).toFixed(0)}</SvgText></React.Fragment>)}
        {labels.map((label, index) => <SvgText key={`${index}:${label}`} x={x(index)} y={215} textAnchor="middle" fill={theme.muted} fontSize={10}>{label}</SvgText>)}
        {series.map(item => {
          const segments: string[][] = [[]];
          item.values.forEach((value, index) => { if (value === null || !Number.isFinite(value)) { if (segments[segments.length - 1].length) segments.push([]); } else segments[segments.length - 1].push(`${x(index)},${y(value)}`); });
          return <React.Fragment key={item.label}>{segments.filter(segment => segment.length > 1).map((segment, index) => <Polyline key={index} points={segment.join(' ')} fill="none" stroke={item.color} strokeWidth={2.5} />)}{item.values.map((value, index) => value === null || !Number.isFinite(value) ? null : <Circle key={index} cx={x(index)} cy={y(value)} r={3} fill={item.color} />)}</React.Fragment>;
        })}
      </Svg>
    </ScrollView>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{series.map(item => <Text key={item.label} style={{ color: item.color, fontWeight: '600' }}>{item.label}</Text>)}</View>
  </View>;
}
