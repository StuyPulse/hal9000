/** Match-level ferry averages; an unscouted match is a gap, not a zero. */
export function timelineFerryValues(payloads: Record<string, unknown>[]) {
  if (!payloads.length) return { autoFerried: null, teleopFerried: null, ferried: null };
  const phaseValue = (payload: Record<string, unknown>, phase: "auto" | "teleop") => {
    const values = payload[phase];
    const ferry = values && typeof values === "object" ? Number((values as Record<string, unknown>).ferry ?? 0) : 0;
    return Number.isFinite(ferry) ? ferry : 0;
  };
  const autoFerried = payloads.reduce((sum, payload) => sum + phaseValue(payload, "auto"), 0) / payloads.length;
  const teleopFerried = payloads.reduce((sum, payload) => sum + phaseValue(payload, "teleop"), 0) / payloads.length;
  return { autoFerried, teleopFerried, ferried: autoFerried + teleopFerried };
}
