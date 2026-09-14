"use client";

import { ImagePlus, X } from "lucide-react";
import { useId, useState } from "react";
import { SearchableTeamSelect } from "@/components/searchable-team-select";
import { createClient } from "@/lib/supabase/client";

type Team = { id: string; number: number; name: string };
const MAX_PIT_PHOTO_BYTES = 10 * 1024 * 1024;

export function PitPhotoUpload({ eventId, teams, selectedTeamId, onSelectedTeamChange }: { eventId: string; teams: Team[]; selectedTeamId?: string; onSelectedTeamChange?: (teamId: string) => void }) {
  const inputId = useId();
  const [teamId, setTeamId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const sorted = [...teams].sort((a, b) => a.number - b.number);
  const activeTeamId = selectedTeamId ?? teamId;
  const selectTeam = (nextTeamId: string) => { setTeamId(nextTeamId); onSelectedTeamChange?.(nextTeamId); };

  function stageFiles(nextFiles: FileList | null, input: HTMLInputElement) {
    const incoming = Array.from(nextFiles ?? []);
    input.value = "";
    if (!incoming.length) return;
    const accepted = incoming.filter((file) => file.type.startsWith("image/") && file.size <= MAX_PIT_PHOTO_BYTES);
    const rejected = incoming.length - accepted.length;
    if (accepted.length) setFiles((current) => [...current, ...accepted]);
    setMessage(rejected ? `${rejected} photo${rejected === 1 ? " was" : "s were"} skipped. Photos must be images no larger than 10 MB.` : "");
  }

  async function submitPhotos() {
    if (!files.length) { setMessage("Add at least one photo before submitting."); return; }
    if (!activeTeamId) { setMessage("Choose a team before submitting photos."); return; }
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Your session has expired. Sign in again before uploading.");
      const { data: membership, error: membershipError } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).limit(1).maybeSingle();
      if (membershipError || !membership) throw new Error("Your organization membership could not be verified. Sign in again and retry.");

      const failed: File[] = [];
      for (const file of files) {
        const path = `${user.id}/${eventId}/${activeTeamId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const { error: uploadError } = await supabase.storage.from("pit-photos").upload(path, file, { contentType: file.type || undefined, cacheControl: "3600" });
        if (uploadError) { failed.push(file); continue; }
        const { error: recordError } = await supabase.from("pit_photos").insert({ organization_id: membership.organization_id, event_id: eventId, team_id: activeTeamId, storage_path: path, uploaded_by: user.id });
        if (recordError) {
          await supabase.storage.from("pit-photos").remove([path]);
          failed.push(file);
        }
      }

      const uploaded = files.length - failed.length;
      setFiles(failed);
      setMessage(failed.length ? `${uploaded ? `${uploaded} uploaded. ` : ""}${failed.length} photo${failed.length === 1 ? " still needs" : "s still need"} to be uploaded. Check your connection and try again.` : `${uploaded} pit photo${uploaded === 1 ? "" : "s"} uploaded and shown on the team page.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Photos could not be uploaded. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section id="pit-photo-upload" className="card section"><h2>Update pit photos</h2><p className="muted">Add photos first or choose the team first — they stay queued here until you submit them.</p><div className="form-grid"><div className="field"><label htmlFor="pit-photo-team">Team</label><SearchableTeamSelect id="pit-photo-team" value={activeTeamId} onValueChange={selectTeam} teams={sorted} emptyLabel="Choose a team…" disabled={busy}/></div><div className="field"><label>Photos</label><div className="photo-input-actions"><label className="button secondary" htmlFor={inputId}><ImagePlus size={18} aria-hidden="true"/>Add photos</label><input id={inputId} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,image/gif" multiple disabled={busy} onChange={(event) => stageFiles(event.target.files, event.currentTarget)}/></div>{files.length > 0 && <div className="pit-photo-queue" aria-live="polite"><strong>{files.length} photo{files.length === 1 ? "" : "s"} ready</strong><ul>{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><span title={file.name}>{file.name}</span><button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} disabled={busy} aria-label={`Remove ${file.name}`}><X size={15} aria-hidden="true"/></button></li>)}</ul></div>}</div></div><div className="pit-photo-submit"><button type="button" className="button" onClick={() => void submitPhotos()} disabled={busy || !files.length || !activeTeamId}>{busy ? "Uploading…" : "Submit photos"}</button>{files.length > 0 && !activeTeamId && <p className="muted">Choose a team to enable submission.</p>}</div>{message && <p aria-live="polite" className={message.includes("could not") || message.includes("skipped") || message.includes("still need") ? "error" : "trend"}>{message}</p>}</section>;
}
