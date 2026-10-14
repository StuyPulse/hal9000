// Field definitions and bounds for the website's pit and pre-scout forms
// (apps/web/src/app/scout/manual/manual-scouting.tsx). Both are form_version 2 and
// every value is stored as a string.
import type { Payload } from '../core/types';

export type ManualKind = 'pit' | 'pre_scout';
export const MANUAL_FORM_VERSION = 2;
export const MANUAL_TITLES: Record<ManualKind, string> = { pit: 'Pit scouting', pre_scout: 'Pre scouting' };

export type TextField = { id: string; label: string; placeholder: string; helper?: string };

export const PRE_SCOUT_TEXT_FIELDS: TextField[] = [
  { id: 'autos', label: 'Autos: position, estimated fuel, path', placeholder: 'e.g. Position 3 → HUB, 20 fuel' },
  { id: 'active_shift', label: 'Active HUB strategy', placeholder: 'e.g. Scores from depot, then ferries' },
  { id: 'inactive_shift', label: 'Inactive HUB strategy', placeholder: 'e.g. Collects from floor and stages fuel' },
  { id: 'traversal', label: 'Bump / trench preference', placeholder: 'e.g. Uses trench both directions' },
  { id: 'with_them', label: 'Strategy with them', placeholder: 'e.g. Leave depot lane open' },
  { id: 'against_them', label: 'Strategy against them', placeholder: 'e.g. Block their preferred lane' },
  { id: 'notes', label: 'Notes', placeholder: 'Useful scouting observations' },
];

export const PIT_TEXT_FIELDS: Record<'contact_info' | 'teleop_active_hub' | 'teleop_inactive_hub' | 'offseason' | 'scoring_area' | 'comments', TextField> = {
  contact_info: { id: 'contact_info', label: 'Team contact info', placeholder: 'e.g. Avery Chen — student drive coach — achen@example.com', helper: 'Include the person’s role: student, mentor, coach, or another contact.' },
  teleop_active_hub: { id: 'teleop_active_hub', label: 'Teleop strategy — active HUB', placeholder: 'e.g. Cycles DEPOT → active HUB' },
  teleop_inactive_hub: { id: 'teleop_inactive_hub', label: 'Teleop strategy — inactive HUB', placeholder: 'e.g. Collects and stages fuel while inactive' },
  offseason: { id: 'offseason', label: 'Offseason drive-team plans', placeholder: 'e.g. Two events planned before build season' },
  scoring_area: { id: 'scoring_area', label: 'Preferred scoring area', placeholder: 'e.g. Near-side HUB' },
  comments: { id: 'comments', label: 'Additional comments', placeholder: 'Anything a strategist should know' },
};

export const EXPERIENCE_OPTIONS = [
  { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' },
  { value: '3', label: '3' }, { value: '4+', label: '4+' },
];
export const OPERATOR_EXPERIENCE_OPTIONS = [{ value: 'none', label: 'None' }, ...EXPERIENCE_OPTIONS];
export const TRAVERSAL_OPTIONS = [
  { value: 'bump', label: 'Bump', hint: 'Can cross the bump' },
  { value: 'trench', label: 'Trench', hint: 'Can use the trench' },
] as const;

export type NumericSpec = { id: string; label: string; unit: string; min: number; max: number; step: number; hint?: string };
export const DRIVETRAIN_LENGTH: NumericSpec = { id: 'drivetrain_length', label: 'Length', unit: 'in', min: 0, max: 55, step: 0.5 };
export const DRIVETRAIN_WIDTH: NumericSpec = { id: 'drivetrain_width', label: 'Width', unit: 'in', min: 0, max: 55, step: 0.5 };
export const ROBOT_WEIGHT: NumericSpec = { id: 'robot_weight', label: 'Robot weight', unit: 'lb', min: 0, max: 135, step: 1, hint: 'Maximum 135 lb.' };
export const HOPPER_CAPACITY: NumericSpec = { id: 'hopper_capacity', label: 'Maximum hopper capacity', unit: 'fuel', min: 0, max: 500, step: 10 };
export const PERIMETER_LIMIT = 110;

export const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
/** Snap to the spec's step, then clamp. 0.5 in for dimensions, 10 fuel for the hopper. */
export const snap = (spec: NumericSpec, value: number) => clamp(Math.round(value / spec.step) * spec.step, spec.min, spec.max);

export const perimeterOf = (length: number, width: number) => 2 * (length + width);
/** The derived `dimensions` string is rewritten whenever length or width changes. */
export function dimensionsLabel(length: number, width: number) {
  return `${length} in × ${width} in (${perimeterOf(length, width)} in perimeter)`;
}

export function parseTraversal(value: string | undefined) {
  return (value ?? '').split(',').filter((item): item is 'bump' | 'trench' => item === 'bump' || item === 'trench');
}
export function toggleTraversal(value: string | undefined, option: 'bump' | 'trench') {
  const next = new Set(parseTraversal(value));
  if (next.has(option)) next.delete(option); else next.add(option);
  return [...next].join(',');
}

/** Only string values are editable; anything else in a loaded payload is preserved on save. */
export function splitPayload(payload: Payload): { fields: Record<string, string>; extras: Payload } {
  const fields: Record<string, string> = {};
  const extras: Payload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string') fields[key] = value; else extras[key] = value;
  }
  return { fields, extras };
}
export const joinPayload = (fields: Record<string, string>, extras: Payload): Payload => ({ ...extras, ...fields });
export function mergeManualPayload(saved:Payload,fields:Record<string,string>,extras:Payload):Payload {
 return {...saved,...extras,...fields};
}

export function setDimensions(fields: Record<string, string>, length: number, width: number): Record<string, string> {
  const safeLength = snap(DRIVETRAIN_LENGTH, length);
  const safeWidth = snap(DRIVETRAIN_WIDTH, width);
  return { ...fields, drivetrain_length: String(safeLength), drivetrain_width: String(safeWidth), dimensions: dimensionsLabel(safeLength, safeWidth) };
}

export type ValidationResult = { errors: string[]; warnings: string[] };
export function validateManual(kind: ManualKind, teamId: string | null, fields: Record<string, string>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!teamId) errors.push('Choose a team.');
  if (kind === 'pre_scout' && fields.average_pieces && !/^[0-9]{1,3}$/.test(fields.average_pieces)) errors.push('Average game pieces scored must be a whole number up to 999.');
  if (kind === 'pit') {
    const length = Number(fields.drivetrain_length ?? 0);
    const width = Number(fields.drivetrain_width ?? 0);
    if (perimeterOf(length, width) > PERIMETER_LIMIT) warnings.push(`Perimeter is ${perimeterOf(length, width)} in; the limit is ${PERIMETER_LIMIT} in.`);
  }
  return { errors, warnings };
}

/** Label/value rows for the review step, in form order, never dropping a field. */
export function reviewRows(kind: ManualKind, fields: Record<string, string>): { id: string; label: string; value: string }[] {
  const rows: { id: string; label: string; value: string }[] = [];
  const add = (id: string, label: string, value?: string) => rows.push({ id, label, value: value && value.length ? value : 'Not recorded' });
  const experience = (value?: string) => (value === 'none' ? 'No operator' : value ? `${value} ${value === '1' ? 'year' : 'years'}` : undefined);
  if (kind === 'pre_scout') {
    add('average_pieces', 'Average game pieces scored', fields.average_pieces);
    for (const field of PRE_SCOUT_TEXT_FIELDS) add(field.id, field.label, fields[field.id]);
  } else {
    add('driver_experience', 'Driver experience', experience(fields.driver_experience));
    add('operator_experience', 'Operator experience', experience(fields.operator_experience));
    add('contact_info', PIT_TEXT_FIELDS.contact_info.label, fields.contact_info);
    add('dimensions', 'Drivetrain dimensions', fields.dimensions);
    add('robot_weight', 'Robot weight', fields.robot_weight ? `${fields.robot_weight} lb` : undefined);
    add('hopper_capacity', 'Maximum hopper capacity', fields.hopper_capacity ? `${fields.hopper_capacity} fuel` : undefined);
    add('teleop_active_hub', PIT_TEXT_FIELDS.teleop_active_hub.label, fields.teleop_active_hub);
    add('teleop_inactive_hub', PIT_TEXT_FIELDS.teleop_inactive_hub.label, fields.teleop_inactive_hub);
    add('offseason', PIT_TEXT_FIELDS.offseason.label, fields.offseason);
    add('scoring_area', PIT_TEXT_FIELDS.scoring_area.label, fields.scoring_area);
    add('traversal', 'Traversal', parseTraversal(fields.traversal).map((value) => (value === 'bump' ? 'Bump' : 'Trench')).join(', '));
    add('comments', PIT_TEXT_FIELDS.comments.label, fields.comments);
    add('auto_routines_notes', 'Auton notes', fields.auto_routines_notes);
  }
  return rows;
}

const KNOWN_PIT = new Set(['driver_experience', 'operator_experience', 'contact_info', 'drivetrain_length', 'drivetrain_width', 'dimensions', 'robot_weight', 'hopper_capacity', 'teleop_active_hub', 'teleop_inactive_hub', 'offseason', 'scoring_area', 'traversal', 'comments', 'auto_routines_drawing', 'auto_routines_notes']);
const KNOWN_PRE = new Set(['average_pieces', ...PRE_SCOUT_TEXT_FIELDS.map((field) => field.id)]);
/** Keys present in a saved payload that this build's form does not render. They are preserved untouched. */
export function unknownKeys(kind: ManualKind, payload: Payload) {
  const known = kind === 'pit' ? KNOWN_PIT : KNOWN_PRE;
  return Object.keys(payload).filter((key) => !known.has(key));
}
