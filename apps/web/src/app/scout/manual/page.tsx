import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { PitPhotoUpload } from "@/components/pit-photo-upload";
import { getActiveEvent } from "@/lib/active-event";
import { createClient } from "@/lib/supabase/server";

export default async function ManualPage() {
  const event = await getActiveEvent();
  const supabase = await createClient();
  const { data } = event ? await supabase.from("event_teams").select("team_id,teams(id,team_number,name)").eq("event_id", event.id) : { data: [] };
  const teams = (data ?? []).map((row: any) => ({ id: row.team_id, number: row.teams?.team_number, name: row.teams?.name }));

  return <AppShell active="Manual scouting">
    <PageHeader eyebrow={event?.name ?? "No active event"} title="Scouting forms." />
    {event ? <div className="scouting-page-stack">
      <section className="form-launcher">
        <Link href="/scout/match" className="form-launch"><span>1</span><strong>Match scouting</strong><small>Choose scheduled or manual match scouting</small></Link>
        <Link href="/scout/pre-scout" className="form-launch"><span>2</span><strong>Pre scouting</strong><small>Plan before the event</small></Link>
        <Link href="/scout/pit" className="form-launch"><span>3</span><strong>Pit scouting</strong><small>Robot details and photos</small></Link>
        <Link href="/scout/global" className="form-launch"><span>4</span><strong>Global scouting</strong><small>Shared event Google Doc</small></Link>
      </section>
      <PitPhotoUpload eventId={event.id} teams={teams} />
    </div> : <section className="card"><p className="muted">An admin must set an active event before scouting can begin.</p></section>}
  </AppShell>;
}
