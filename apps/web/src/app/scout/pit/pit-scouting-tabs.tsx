"use client";

import { useState } from "react";
import { PitPhotoUpload } from "@/components/pit-photo-upload";
import { ManualScouting } from "../manual/manual-scouting";

type Team = { id: string; number: number; name: string };
type Tab = "coverage" | "scouting" | "photos";

export function PitScoutingTabs({ eventId, teams, missing, photographed }: { eventId: string; teams: Team[]; missing: Team[]; photographed: number }) {
  const [activeTab, setActiveTab] = useState<Tab>("scouting");
  const [photoTeamId, setPhotoTeamId] = useState("");
  const showPhotoUpload = (teamId: string) => { setPhotoTeamId(teamId); setActiveTab("photos"); };
  const tabs: { id: Tab; label: string }[] = [{ id: "scouting", label: "Pit form" }, { id: "coverage", label: "Photo coverage" }, { id: "photos", label: "Upload photos" }];

  return <section className="pit-tabs-workspace">
    <div className="pit-tabs" role="tablist" aria-label="Pit scouting sections">{tabs.map((tab) => <button key={tab.id} id={`pit-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`pit-panel-${tab.id}`} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>{tab.label}{tab.id === "coverage" && missing.length > 0 && <span>{missing.length}</span>}</button>)}</div>
    <div id="pit-panel-scouting" role="tabpanel" aria-labelledby="pit-tab-scouting" hidden={activeTab !== "scouting"}><ManualScouting eventId={eventId} teams={teams} type="pit"/></div>
    <div id="pit-panel-coverage" role="tabpanel" aria-labelledby="pit-tab-coverage" hidden={activeTab !== "coverage"}><section className="card pit-photo-coverage"><div className="card-head"><div><h2>Pit-photo coverage</h2><p className="muted">{photographed} of {teams.length} teams have at least one pit photo.</p></div>{missing.length > 0 && <span className="tag pending">{missing.length} remaining</span>}</div>{missing.length ? <div className="pit-photo-missing"><p>Teams still needing a pit photo</p><div className="pit-photo-missing-list">{missing.map((team) => <button type="button" key={team.id} onClick={() => showPhotoUpload(team.id)}><strong>{team.number}</strong><small>{team.name}</small></button>)}</div></div> : <div className="pit-photo-complete" role="status"><span aria-hidden="true">✓</span><div><strong>Every team has a pit photo.</strong><p>Coverage complete — great work, PulseCrew.</p></div></div>}</section></div>
    <div id="pit-panel-photos" role="tabpanel" aria-labelledby="pit-tab-photos" hidden={activeTab !== "photos"}><PitPhotoUpload eventId={eventId} teams={teams} selectedTeamId={photoTeamId} onSelectedTeamChange={setPhotoTeamId}/></div>
  </section>;
}
