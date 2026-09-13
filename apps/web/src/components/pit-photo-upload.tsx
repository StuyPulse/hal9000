"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SearchableTeamSelect } from "@/components/searchable-team-select";

type Team = { id: string; number: number; name: string };

export function PitPhotoUpload({ eventId, teams, selectedTeamId, onSelectedTeamChange }: { eventId: string; teams: Team[]; selectedTeamId?: string; onSelectedTeamChange?: (teamId: string) => void }) {
  const [teamId, setTeamId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const sorted = [...teams].sort((a, b) => a.number - b.number);
  const activeTeamId = selectedTeamId ?? teamId;
  const selectTeam = (nextTeamId: string) => { setTeamId(nextTeamId); onSelectedTeamChange?.(nextTeamId); };

  async function upload(files: FileList | null) {
    if (!files?.length || !activeTeamId) return setMessage("Choose a team first.");
    setBusy(true);
    const supabase: any = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user?.id).limit(1).maybeSingle();
    if (!user || !membership) { setMessage("Sign in again before uploading."); setBusy(false); return; }
    const results = await Promise.all(Array.from(files).map(async (file) => {
      const path = `${user.id}/${eventId}/${activeTeamId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const { error } = await supabase.storage.from("pit-photos").upload(path, file);
      return error ? { error } : supabase.from("pit_photos").insert({ organization_id: membership.organization_id, event_id: eventId, team_id: activeTeamId, storage_path: path, uploaded_by: user.id });
    }));
    setMessage(results.every((result) => !result.error) ? `${results.length} pit photo${results.length === 1 ? "" : "s"} uploaded and shown on the team page.` : "One or more photos could not upload.");
    setBusy(false);
  }

  function choose(files: FileList | null, input: HTMLInputElement) { void upload(files); input.value = ""; }

  return <section id="pit-photo-upload" className="card section"><h2>Update pit photos</h2><p className="muted">Photos stay private to HAL9000 members and appear on the matching team page.</p><div className="form-grid"><div className="field"><label htmlFor="pit-photo-team">Team</label><SearchableTeamSelect id="pit-photo-team" value={activeTeamId} onValueChange={selectTeam} teams={sorted} emptyLabel="Choose a team…" disabled={busy}/></div><div className="field"><label>Photos</label><div className="photo-input-actions"><label className="button secondary" htmlFor="pit-photo-library">Choose from phone</label><input id="pit-photo-library" type="file" accept="image/*" multiple disabled={busy} onChange={(event) => choose(event.target.files, event.currentTarget)}/><label className="button secondary" htmlFor="pit-photo-camera">Take photo</label><input id="pit-photo-camera" type="file" accept="image/*" capture="environment" disabled={busy} onChange={(event) => choose(event.target.files, event.currentTarget)}/></div></div></div>{message && <p aria-live="polite" className={message.startsWith("One") ? "error" : "trend"}>{message}</p>}</section>;
}
