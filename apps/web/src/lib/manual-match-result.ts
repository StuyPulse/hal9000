import { z } from "zod";

// Blank inputs must not silently become a zero score through Number coercion.
const score = z.string().trim().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(2147483647));
export const manualMatchResultSchema = z.object({
  eventId: z.string().uuid(),
  matchId: z.string().uuid(),
  redScore: score,
  blueScore: score,
});
