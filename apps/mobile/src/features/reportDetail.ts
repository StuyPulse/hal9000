// Grouped, human-readable view of a saved report payload for the report detail screen.
// Pure so it can be tested; the raw JSON stays available next to it.
import type { Payload } from '../core/types';
import { reviewRows, splitPayload, unknownKeys } from './manualFields';
import { breakageIssues, manualMatchLabel, readableSpot, record } from './stats';

export type DetailRow = { label: string; value: string };
export type DetailGroup = { title: string; rows: DetailRow[] };

const yesNo = (value: unknown) => (value === true ? 'Yes' : value === false ? 'No' : 'Not recorded');
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Not recorded');
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : 'Not recorded');
const humanKey = (key: string) => { const spaced = key.replace(/_/g, ' '); return spaced.charAt(0).toUpperCase() + spaced.slice(1); };
const short = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const MATCH_KNOWN = new Set(['no_show', 'starting_spot', 'starting_spot_confirmed', 'auto', 'teleop', 'auto_fuel', 'teleop_fuel', 'fouls', 'defense', 'defense_level', 'defended_teams', 'robot_broke', 'breakage_issues', 'break_tag', 'break_timestamp', 'comments', 'report_source', 'manual_match']);

export function reportGroups(entryType: string, payload: Payload, teamName: (id: string) => string = (id) => id): DetailGroup[] {
  if (entryType === 'pit' || entryType === 'pre_scout') {
    const kind = entryType;
    const { fields } = splitPayload(payload);
    const groups: DetailGroup[] = [{ title: kind === 'pit' ? 'Pit report' : 'Pre-scout report', rows: reviewRows(kind, fields).map((row) => ({ label: row.label, value: row.value })) }];
    const extra = unknownKeys(kind, payload).filter((key) => key !== 'auto_routines_drawing');
    if (extra.length) groups.push({ title: 'Other fields', rows: extra.map((key) => ({ label: humanKey(key), value: short(payload[key]) })) });
    if (kind === 'pit') groups[0].rows.push({ label: 'Autonomous drawing', value: typeof payload.auto_routines_drawing === 'string' && payload.auto_routines_drawing ? 'Saved' : 'Not recorded' });
    return groups;
  }
  const auto = record(payload.auto);
  const teleop = record(payload.teleop);
  const manual = payload.manual_match ? manualMatchLabel(record(payload.manual_match)) : null;
  const noShow = payload.no_show === true;
  const groups: DetailGroup[] = [];
  groups.push({ title: 'Match', rows: [
    { label: 'Source', value: manual ? `Manual report · ${manual}` : 'Scheduled match' },
    { label: 'No-show', value: noShow ? 'Yes · scoring zeroed' : 'No' },
    { label: 'Starting spot', value: payload.starting_spot ? `${readableSpot(payload.starting_spot)}${payload.starting_spot_confirmed === true ? ' (confirmed)' : ''}` : 'Not recorded' },
  ] });
  if (!noShow) {
    groups.push({ title: 'Scoring', rows: [
      { label: 'Auto scored', value: count(auto.shoot) },
      { label: 'Auto ferried', value: count(auto.ferry) },
      { label: 'Teleop scored', value: count(teleop.shoot) },
      { label: 'Teleop ferried', value: count(teleop.ferry) },
      { label: 'Fouls', value: count(payload.fouls) },
    ] });
    const defended = Array.isArray(payload.defended_teams) ? payload.defended_teams.filter((id): id is string => typeof id === 'string').map(teamName) : [];
    groups.push({ title: 'Defense', rows: [
      { label: 'Played defense', value: yesNo(payload.defense) },
      ...(payload.defense === true ? [{ label: 'Level (1–10)', value: count(payload.defense_level) }, { label: 'Defended', value: defended.length ? defended.join(', ') : 'Not recorded' }] : []),
    ] });
  }
  const issues = breakageIssues(payload);
  groups.push({ title: 'Reliability', rows: [
    { label: 'Robot broke', value: yesNo(payload.robot_broke) },
    ...issues.map((item, index) => ({ label: `Issue ${index + 1}`, value: item.timestamp ? `${item.issue} · ${item.timestamp}` : item.issue })),
  ] });
  groups.push({ title: 'Notes', rows: [{ label: 'Comments', value: text(payload.comments) }] });
  const extra = Object.keys(payload).filter((key) => !MATCH_KNOWN.has(key));
  if (extra.length) groups.push({ title: 'Other fields', rows: extra.map((key) => ({ label: humanKey(key), value: short(payload[key]) })) });
  return groups;
}

/** Width for the QR code: fits the measured container, never above the proven 265pt render. */
export function qrSize(containerWidth: number, padding = 16, max = 320, min = 160) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 265;
  return Math.max(min, Math.min(max, Math.floor(containerWidth - padding * 2)));
}
