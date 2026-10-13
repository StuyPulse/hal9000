// Strategy sketches are stored per user and event in strategy_drawings.strokes as
// normalized points (0..1) so they survive any screen size. Same shape as the website.
export type DrawPoint = { x: number; y: number };
export type DrawStroke = { color: string; points: DrawPoint[] };
export const DRAWING_COLORS = ['#ef4444', '#38bdf8', '#facc15', '#34d399', '#a78bfa', '#fb923c'] as const;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Defensive parse of whatever the database returned; invalid strokes are dropped. */
export function parseStrokes(value: unknown): DrawStroke[] {
  if (!Array.isArray(value)) return [];
  const strokes: DrawStroke[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { color, points } = item as { color?: unknown; points?: unknown };
    if (typeof color !== 'string' || !Array.isArray(points)) continue;
    const clean = points
      .filter((point): point is DrawPoint => !!point && typeof point === 'object' && finite((point as DrawPoint).x) && finite((point as DrawPoint).y))
      .map((point) => ({ x: Math.min(1, Math.max(0, point.x)), y: Math.min(1, Math.max(0, point.y)) }));
    if (clean.length) strokes.push({ color, points: clean });
  }
  return strokes;
}

/** `flipped` mirrors the alliance view; points are stored in the unflipped frame. */
export const toStored = (x: number, y: number, flipped: boolean): DrawPoint => {
  const nx = Math.min(1, Math.max(0, x));
  const ny = Math.min(1, Math.max(0, y));
  return flipped ? { x: 1 - nx, y: 1 - ny } : { x: nx, y: ny };
};
export const toDisplay = (point: DrawPoint, flipped: boolean): DrawPoint => (flipped ? { x: 1 - point.x, y: 1 - point.y } : point);
