import { AppShell, PageHeader } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalDateTime } from "@/components/local-date-time";
import { PayloadGrid } from "@/components/scouting-payload";

export default async function SubmissionDetailPage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  const supabase = await createClient();
  const { data: entry } = await (supabase as any).from("scouting_entries").select("id,event_id,entry_type,status,form_version,payload,submitted_at,created_at,updated_at,matches(match_number),teams(team_number,name),profiles(display_name)").eq("id", entryId).maybeSingle();
  if (!entry) notFound();
  const { data: eventTeams } = await supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", entry.event_id);
  const teamNames = new Map((eventTeams ?? []).map((row: any) => [row.team_id, `${row.teams?.team_number ?? "Unknown"} · ${row.teams?.name ?? "team"}`]));
  const timestamp = entry.submitted_at ?? entry.created_at;
  const teamName = [entry.teams?.team_number, entry.teams?.name].filter(Boolean).join(" · ") || "Team report";
  return <AppShell active="Submissions"><PageHeader eyebrow="Scouting record" title={teamName}><Link className="link" href="/submissions">All submissions</Link></PageHeader><section className="card submission-detail"><div className="submission-detail-head"><div><span className="submission-kind">{entry.entry_type.replace("_", " ")} report</span><h2>{entry.entry_type === "match" && entry.matches?.match_number ? `Qualification ${entry.matches.match_number}` : "Scouting report"}</h2><p className="muted">{entry.profiles?.display_name ?? "Scout"} · {timestamp ? <LocalDateTime value={timestamp}/> : "Saved draft"}</p></div><span className={`tag ${entry.status === "submitted" ? "complete" : "pending"}`}>{entry.status}</span></div><div className="submission-meta"><span>Form v{entry.form_version}</span><span>Last updated <LocalDateTime value={entry.updated_at}/></span></div><PayloadGrid payload={entry.payload ?? {}} teamNames={teamNames}/></section></AppShell>;
}
