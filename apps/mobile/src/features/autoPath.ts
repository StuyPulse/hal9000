// Autonomous-path drawing model. The website stores `auto_routines_drawing` as an
// SVG *string* (not a PNG), written by apps/web/src/components/auto-path-drawer.tsx.
// This module reproduces that exact output and can also read it back, so editing a
// report does not discard the earlier drawing (the website does).
export type Point = { x: number; y: number };
export type Stroke = { color: string; points: Point[] };

export const PATH_WIDTH = 1380;
export const PATH_HEIGHT = 674;
export const MAX_STROKES = 12;
export const MAX_POINTS_PER_STROKE = 600;
export const MIN_POINT_DISTANCE = 5;
export const START_OPACITY = 0.4;
export const PATH_COLORS = [
  { value: '#ef4444', name: 'Red' },
  { value: '#2563eb', name: 'Blue' },
  { value: '#22c55e', name: 'Green' },
  { value: '#111827', name: 'Black' },
] as const;

/** Byte-for-byte the website's svgFor(): one gradient + one path per stroke of 2+ points. */
export function strokesToSvg(strokes: Stroke[]): string {
  const drawable = strokes.filter((stroke) => stroke.points.length > 1);
  const gradients = drawable.map((stroke, index) => {
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    return `<linearGradient id="route-${index}" gradientUnits="userSpaceOnUse" x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}"><stop offset="0" stop-color="${stroke.color}" stop-opacity="${START_OPACITY}"/><stop offset="1" stop-color="${stroke.color}" stop-opacity="1"/></linearGradient>`;
  }).join('');
  const paths = drawable.map((stroke, index) => `<path d="M ${stroke.points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')}" fill="none" stroke="url(#route-${index})" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return paths ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PATH_WIDTH} ${PATH_HEIGHT}"><defs>${gradients}</defs>${paths}</svg>` : '';
}

/** Parse a drawing written by the website or by strokesToSvg. Unknown input returns []. */
export function svgToStrokes(svg: string): Stroke[] {
  if (!svg.includes('<svg') || !svg.includes('<path')) return [];
  const colors = new Map<string, string>();
  for (const gradient of svg.matchAll(/<linearGradient\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/linearGradient>/g)) {
    const stop = gradient[2].match(/stop-color="(#[0-9a-fA-F]{6})"/);
    if (stop) colors.set(gradient[1], stop[1].toLowerCase());
  }
  const strokes: Stroke[] = [];
  for (const path of svg.matchAll(/<path\b[^>]*>/g)) {
    const tag = path[0];
    const d = tag.match(/\sd="([^"]+)"/)?.[1];
    if (!d) continue;
    const reference = tag.match(/stroke="url\(#([^)]+)\)"/)?.[1];
    const direct = tag.match(/stroke="(#[0-9a-fA-F]{6})"/)?.[1];
    const color = (reference ? colors.get(reference) : undefined) ?? direct?.toLowerCase() ?? PATH_COLORS[0].value;
    const points: Point[] = [];
    for (const pair of d.matchAll(/(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/g)) points.push({ x: Number(pair[1]), y: Number(pair[2]) });
    if (points.length > 1) strokes.push({ color, points });
  }
  return strokes.slice(0, MAX_STROKES);
}

export function canStartStroke(strokes: Stroke[]) {
  return strokes.length < MAX_STROKES;
}

/** Adds a point honouring the website's minimum spacing and per-stroke cap. */
export function appendPoint(strokes: Stroke[], point: Point): Stroke[] {
  const last = strokes[strokes.length - 1];
  const previous = last?.points[last.points.length - 1];
  if (!last || !previous || last.points.length >= MAX_POINTS_PER_STROKE) return strokes;
  if (Math.hypot(point.x - previous.x, point.y - previous.y) < MIN_POINT_DISTANCE) return strokes;
  return [...strokes.slice(0, -1), { ...last, points: [...last.points, point] }];
}

export const clampPoint = (x: number, y: number): Point => ({ x: Math.min(PATH_WIDTH, Math.max(0, x)), y: Math.min(PATH_HEIGHT, Math.max(0, y)) });
