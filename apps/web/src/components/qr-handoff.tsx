"use client";

import jsQR from "jsqr";
import QRCode from "qrcode";
import { Camera, CameraOff, Download, Pause, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BLOCK_SIZE, EASY_SCAN_BLOCK_SIZE, FountainCollector, FountainEncoder, isFountainFrame } from "@wildcard/shared/src/fountain-qr";
import { decodeReportBatch, encodeReportBatch, parseQrReport } from "@wildcard/shared/src/qr-batch";
import { createClient } from "@/lib/supabase/client";
import { listQueuedScoutingEntries, listQrReceipts, markQrReceiptUploaded, onOfflineQueueChanged, saveQrReceipts, type QrReceipt, type QueuedScoutingEntry } from "@/lib/offline-scouting-queue";

type Team = { id: string; number: number; displayNumber?: string; name: string };
type Props = { organizationId: string | null; eventId: string | null; role: string | null; teams: Team[] };
const SPEEDS = [{ label: "Slow", fps: 2 }, { label: "Normal", fps: 4 }, { label: "Fast", fps: 7 }];
const canReceive = (role: string | null) => ["master", "admin", "developer", "strategist"].includes(role ?? "");
const canUpload = (role: string | null) => ["master", "admin", "developer"].includes(role ?? "");
const toNumber = (value: unknown) => typeof value === "number" ? value : 0;

function ShareQr({ teams }: { teams: Map<string, Team> }) {
  const [entries, setEntries] = useState<QueuedScoutingEntry[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [encoder, setEncoder] = useState<FountainEncoder | null>(null);
  const [count, setCount] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [easy, setEasy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const refresh = useCallback(async () => setEntries((await listQueuedScoutingEntries()).filter((entry) => entry.status === "submitted")), []);
  useEffect(() => { const first = window.setTimeout(() => void refresh(), 0); const off = onOfflineQueueChanged(() => void refresh()); return () => { window.clearTimeout(first); off(); }; }, [refresh]);
  useEffect(() => {
    if (!encoder || !canvas.current) return;
    let seq = 0;
    const target = canvas.current;
    const draw = () => void QRCode.toCanvas(target, encoder.frame(seq++), { errorCorrectionLevel: "M", margin: 3, width: Math.min(560, target.parentElement?.clientWidth ?? 420) }).catch(() => undefined);
    draw();
    if (paused) return;
    const timer = window.setInterval(draw, 1000 / SPEEDS[speed].fps);
    return () => window.clearInterval(timer);
  }, [encoder, paused, speed]);
  const chosen = entries.filter((entry) => !excluded.has(entry.id));
  function start(blockSize = easy ? EASY_SCAN_BLOCK_SIZE : DEFAULT_BLOCK_SIZE) {
    setError(null);
    try {
      const reports = chosen.map(({ queued_at: _queuedAt, ...entry }) => ({ entry, revision: 1 }));
      reports.forEach(parseQrReport);
      setEncoder(new FountainEncoder(encodeReportBatch(reports), blockSize));
      setCount(reports.length);
      setPaused(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "These reports could not be prepared."); }
  }
  if (encoder) return <section className="card"><div className="card-head"><div><h2>{count} report{count === 1 ? "" : "s"}, code {encoder.code}</h2><p className="muted">Keep showing this until the receiver shows code {encoder.code} and {count} saved. Missed frames are fine.</p></div></div>
    <div className="qr-stage"><canvas ref={canvas} aria-label={`Animated QR code for ${count} reports, transfer code ${encoder.code}`} role="img"/></div>
    <div className="offline-queue-actions qr-actions">{SPEEDS.map((option, index) => <button key={option.label} type="button" className={`button${speed === index ? "" : " secondary"}`} aria-pressed={speed === index} onClick={() => setSpeed(index)}>{option.label}</button>)}<button type="button" className="button secondary" onClick={() => setPaused(!paused)}>{paused ? <><Play size={15}/>Resume</> : <><Pause size={15}/>Pause</>}</button><button type="button" className="button secondary" onClick={() => { const next = !easy; setEasy(next); start(next ? EASY_SCAN_BLOCK_SIZE : DEFAULT_BLOCK_SIZE); }}>{easy ? "Use smaller code" : "Use easier code"}</button><button type="button" className="button secondary" onClick={() => setEncoder(null)}>Close</button></div>
    <p className="muted">Browsers cannot sign reports, so the receiver can use these but cannot upload them. This browser still uploads them when it reconnects, and uploading twice is safe.</p>
  </section>;
  return <section className="card"><div className="card-head"><div><h2>Share by QR</h2><p className="muted">{entries.length ? "Choose reports saved in this browser. No connection is needed." : "Nothing is waiting. Submitted reports that have not uploaded appear here."}</p></div>{entries.length > 1 && <div className="offline-queue-actions"><button type="button" className="button secondary" disabled={!excluded.size} onClick={() => setExcluded(new Set())}>Select all</button><button type="button" className="button secondary" disabled={excluded.size === entries.length} onClick={() => setExcluded(new Set(entries.map((entry) => entry.id)))}>Select none</button></div>}</div>
    <div className="qr-report-list">{entries.map((entry) => <label key={entry.id} className="option-toggle"><input type="checkbox" checked={!excluded.has(entry.id)} onChange={(event) => setExcluded((current) => { const next = new Set(current); if (event.target.checked) next.delete(entry.id); else next.add(entry.id); return next; })}/><span>{teams.get(entry.team_id)?.displayNumber ?? teams.get(entry.team_id)?.number ?? "Team"} {entry.entry_type === "match" ? "match report" : entry.entry_type === "pit" ? "pit report" : "pre-scout report"}</span></label>)}</div>
    {error && <p className="error" role="alert">{error}</p>}
    <button type="button" className="button qr-start" disabled={!chosen.length} onClick={() => start()}>Show QR for {chosen.length} report{chosen.length === 1 ? "" : "s"}</button>
  </section>;
}

function ScanQr({ organizationId, eventId, role, teams }: Props & { teams: Team[] }) {
  const teamIndex = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const video = useRef<HTMLVideoElement>(null);
  const collector = useRef(new FountainCollector());
  const [scanning, setScanning] = useState(false);
  const [live, setLive] = useState<{ code: string; solved: number; total: number } | null>(null);
  const [finished, setFinished] = useState<{ code: string; saved: number; alreadyHere: number; rejected: string[] }[]>([]);
  const [receipts, setReceipts] = useState<QrReceipt[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const refresh = useCallback(async () => setReceipts(await listQrReceipts()), []);
  useEffect(() => { const first = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(first); }, [refresh]);
  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null, stopped = false, busy = false, last = "", timer = 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const tick = async () => {
      const source = video.current;
      if (!stopped && source && context && source.videoWidth && !busy) {
        const scale = Math.min(1, 900 / Math.max(source.videoWidth, source.videoHeight));
        canvas.width = source.videoWidth * scale; canvas.height = source.videoHeight * scale;
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        const code = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
        if (code?.data && code.data !== last && isFountainFrame(code.data)) {
          last = code.data;
          try {
            const { decoder, alreadyFinished } = collector.current.accept(code.data);
            if (alreadyFinished) setMessage("Already saved. Point at another device.");
            if (decoder) {
              setLive({ code: decoder.code, solved: decoder.solved, total: decoder.k });
              if (decoder.data) {
                busy = true;
                try {
                  const { reports, rejected } = decodeReportBatch(decoder.data);
                  const accepted = reports.filter((report) => report.entry.organization_id === organizationId && report.entry.event_id === eventId);
                  const summary = await saveQrReceipts(accepted);
                  collector.current.markSaved(decoder.key);
                  const wrongEvent = reports.length - accepted.length;
                  setFinished((current) => [{ code: decoder.code, saved: summary.saved, alreadyHere: summary.alreadyHere, rejected: [...rejected.map((item) => item.reason), ...summary.conflicts, ...(wrongEvent ? [`${wrongEvent} from a different team or event than the active one.`] : [])] }, ...current]);
                  setLive(null); setMessage("Saved in this browser. Point at the next device.");
                  await refresh();
                } catch (reason) { collector.current.forget(decoder.key); setLive(null); setMessage(`${reason instanceof Error ? reason.message : "That transfer could not be saved."} Keep scanning to retry.`); }
                finally { busy = false; }
              }
            }
          } catch { /* A misread frame is routine with an animated code. The next one replaces it. */ }
        }
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), 90);
    };
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false }).then(async (media) => {
      if (stopped) { media.getTracks().forEach((track) => track.stop()); return; }
      stream = media;
      if (video.current) { video.current.srcObject = media; await video.current.play(); }
      void tick();
    }).catch(() => { setMessage("The camera could not start. Allow camera access for this site, which needs HTTPS, and try again."); setScanning(false); });
    if (!navigator.mediaDevices) { const fail = window.setTimeout(() => { setMessage("This browser cannot use the camera here. It needs HTTPS."); setScanning(false); }, 0); return () => window.clearTimeout(fail); }
    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()); };
  }, [scanning, organizationId, eventId, refresh]);
  async function upload() {
    if (uploading) return;
    setUploading(true); setMessage(null);
    let done = 0, failure: string | null = null;
    try {
      const { data } = await createClient().auth.getSession();
      if (!data.session || !organizationId) throw new Error("Sign in again before uploading. The reports stay saved here.");
      for (const receipt of receipts.filter((item) => item.proof && !item.uploaded_at)) {
        const response = await fetch("/api/mobile/relay", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, "X-HAL9000-Organization": organizationId }, body: JSON.stringify(receipt.proof), signal: AbortSignal.timeout(10_000) });
        if (!response.ok) { const body = await response.json().catch(() => null); failure = body?.error ?? "The server refused a report. It stays saved here."; continue; }
        await markQrReceiptUploaded(receipt.entry.id); done += 1;
      }
    } catch (reason) { failure = reason instanceof Error && reason.name !== "TimeoutError" && reason.name !== "TypeError" ? reason.message : "Could not reach the server. The reports stay saved here."; }
    await refresh();
    setMessage(failure ?? `Uploaded ${done} report${done === 1 ? "" : "s"}.`);
    setUploading(false);
  }
  function downloadBackup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipts, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `hal9000-qr-receipts-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  }
  const signedWaiting = receipts.filter((item) => item.proof && !item.uploaded_at).length;
  return <section className="card"><div className="card-head"><div><h2>Scan reports</h2><p className="muted">Point this camera at another device&apos;s animated QR. Reports are checked, then saved in this browser with no connection.</p></div><button type="button" className="button" onClick={() => setScanning(!scanning)}>{scanning ? <><CameraOff size={15}/>Stop camera</> : <><Camera size={15}/>Start camera</>}</button></div>
    {scanning && <div className="qr-stage"><video ref={video} muted playsInline aria-label="Camera view for scanning QR codes"/></div>}
    {live && <div className="qr-progress" aria-live="polite"><strong>Code {live.code}: {live.solved} of {live.total} pieces</strong><progress max={live.total} value={live.solved}/></div>}
    {message && !live && <p className="muted" role="status">{message}</p>}
    {finished.map((item, index) => <div key={`${item.code}:${index}`}><p className="trend">Code {item.code}: {item.saved} saved{item.alreadyHere ? `, ${item.alreadyHere} already here` : ""}</p>{item.rejected.length > 0 && <p className="error" role="alert">{item.rejected.length} not saved. {item.rejected[0]}</p>}</div>)}
    <div className="card-head qr-received-head"><h2>Received here ({receipts.length})</h2><div className="offline-queue-actions">{canUpload(role) && <button type="button" className="button secondary" disabled={uploading || !signedWaiting} onClick={() => void upload()}><RefreshCw size={15}/>{uploading ? "Uploading…" : `Upload ${signedWaiting} signed`}</button>}<button type="button" className="button secondary" disabled={!receipts.length} onClick={downloadBackup}><Download size={15}/>Download backup</button></div></div>
    {receipts.length ? <div className="table-scroll"><table><thead><tr><th>Team</th><th>Type</th><th>Auto scored</th><th>Auto ferried</th><th>Teleop scored</th><th>Teleop ferried</th><th>Fouls</th><th>Status</th></tr></thead><tbody>{receipts.map(({ entry, proof, uploaded_at }) => { const payload = entry.payload as { auto?: Record<string, unknown>; teleop?: Record<string, unknown>; fouls?: unknown; no_show?: unknown }; const team = teamIndex.get(entry.team_id); return <tr key={entry.id}><td><strong>{team?.displayNumber ?? team?.number ?? "Team"}</strong></td><td>{payload.no_show ? "No show" : entry.entry_type === "pre_scout" ? "Pre-scout" : entry.entry_type === "pit" ? "Pit" : "Match"}</td><td>{toNumber(payload.auto?.shoot)}</td><td>{toNumber(payload.auto?.ferry)}</td><td>{toNumber(payload.teleop?.shoot)}</td><td>{toNumber(payload.teleop?.ferry)}</td><td>{toNumber(payload.fouls)}</td><td>{uploaded_at ? "Uploaded" : proof ? "Waiting to upload" : "Unsigned, the scout's device uploads it"}</td></tr>; })}</tbody></table></div> : <p className="muted">Nothing received yet.</p>}
  </section>;
}

export function QrHandoff(props: Props) {
  const teams = useMemo(() => new Map(props.teams.map((team) => [team.id, team])), [props.teams]);
  return <div className="admin-stack"><ShareQr teams={teams}/>{canReceive(props.role) && (props.eventId ? <ScanQr {...props}/> : <section className="card"><p className="muted">Set an active event before scanning reports.</p></section>)}</div>;
}
