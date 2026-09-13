const labels: Record<string, string> = {
  auto: "Autonomous", auto_fuel: "Autonomous fuel", auto_routines_notes: "Auton notes", break_tag: "Breakage type", break_timestamp: "Breakage time", comments: "Comments", defended_teams: "Teams defended", defense: "Played defense", defense_level: "Defense level", ferry: "Ferried", fouls: "Fouls", manual_match: "Manual match", no_show: "No show", no_show_reason: "No-show reason", robot_broke: "Robot broke or was disabled", shoot: "Scored", starting_spot: "Starting position", starting_spot_confirmed: "Starting position confirmed", teleop: "Teleop", teleop_fuel: "Teleop fuel",
};

function fieldLabel(key: string) { return labels[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function scalar(value: unknown) { if (typeof value === "boolean") return value ? "Yes" : "No"; if (value === null || value === undefined || value === "") return "Not recorded"; return String(value); }

function PayloadValue({ value, fieldKey, teamNames }: { value: unknown; fieldKey?: string; teamNames: Map<string, string> }) {
  if (Array.isArray(value)) return value.length ? <div className="submission-array">{value.map((item, index) => <div className="submission-array-item" key={index}>{fieldKey === "defended_teams" ? teamNames.get(String(item)) ?? "Unknown team" : typeof item === "object" && item !== null ? <PayloadGrid payload={item as Record<string, unknown>} compact teamNames={teamNames}/> : scalar(item)}</div>)}</div> : <span>Not recorded</span>;
  if (typeof value === "object" && value !== null) return <PayloadGrid payload={value as Record<string, unknown>} compact teamNames={teamNames}/>;
  return <span>{scalar(value)}</span>;
}

function AutoPathPreview({ svg }: { svg: string }) {
  if (!svg.includes("<svg") || !svg.includes("<path")) return <span>Not recorded</span>;
  return <div className="auto-path-preview"><img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="Autonomous route drawn over the 2026 field"/></div>;
}

export function PayloadGrid({ payload, compact = false, teamNames }: { payload: Record<string, unknown>; compact?: boolean; teamNames: Map<string, string> }) {
  const hasPeriodBreakdown = "auto" in payload || "teleop" in payload;
  const fields = Object.entries(payload).filter(([key, value]) => value !== undefined && value !== null && value !== "" && !(hasPeriodBreakdown && ["auto_fuel", "teleop_fuel", "starting_spot_confirmed", "report_source"].includes(key)));
  if (!fields.length) return <p className="muted">No field values were saved for this entry.</p>;
  return <dl className={compact ? "submission-detail-grid submission-detail-grid-compact" : "submission-detail-grid"}>{fields.map(([key, value]) => <div className={key === "auto_routines_drawing" ? "submission-drawing" : undefined} key={key}><dt>{fieldLabel(key)}</dt><dd>{key === "auto_routines_drawing" && typeof value === "string" ? <AutoPathPreview svg={value}/> : <PayloadValue value={value} fieldKey={key} teamNames={teamNames}/>}</dd></div>)}</dl>;
}
