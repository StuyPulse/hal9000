"use client";

import { useState } from "react";
import { AppSelect } from "@/components/app-select";
import { saveTeamRobotProfile } from "@/lib/team-robot-profile-actions";

const drivetrainOptions = [{ value: "", label: "Unknown" }, { value: "Swerve", label: "Swerve" }, { value: "Tank", label: "Tank" }];
const shooterOptions = ["", "Single Turret", "Single Fixed Shooter", "Double Wide Shooter", "Dumper", "No Shooter", "Triple Wide Shooter", "Dual Fixed Shooters", "Double Turret"].map((value) => ({ value, label: value || "Unknown" }));

export function TeamRobotProfile({ eventId, eventKey, teamId, teamNumber, drivetrainType, shooterType }: { eventId: string; eventKey: string; teamId: string; teamNumber: number; drivetrainType: string | null; shooterType: string | null }) {
  const [drivetrain, setDrivetrain] = useState(drivetrainType ?? "");
  const [shooter, setShooter] = useState(shooterType ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save(nextDrivetrain: string, nextShooter: string) {
    const previous = { drivetrain, shooter };
    setDrivetrain(nextDrivetrain); setShooter(nextShooter); setSaving(true); setMessage("");
    const result = await saveTeamRobotProfile({ eventId, eventKey, teamId, teamNumber, drivetrainType: nextDrivetrain as "" | "Swerve" | "Tank", shooterType: nextShooter as "" | "Single Turret" | "Single Fixed Shooter" | "Double Wide Shooter" | "Dumper" | "No Shooter" | "Triple Wide Shooter" | "Dual Fixed Shooters" | "Double Turret" });
    if (result.error) { setDrivetrain(previous.drivetrain); setShooter(previous.shooter); setMessage(result.error); }
    else setMessage("Robot profile saved.");
    setSaving(false);
  }

  return <section className="card section team-robot-profile"><div className="card-head"><div><h2>Robot profile</h2><p className="muted">Shared pit-scouting details for this event.</p></div></div><div className="form-grid"><div className="field"><label htmlFor="team-drivetrain">Drivetrain</label><AppSelect id="team-drivetrain" ariaLabel="Drivetrain" value={drivetrain} disabled={saving} options={drivetrainOptions} onValueChange={(value) => void save(value, shooter)}/></div><div className="field"><label htmlFor="team-shooter">Shooter</label><AppSelect id="team-shooter" ariaLabel="Shooter" value={shooter} disabled={saving} options={shooterOptions} onValueChange={(value) => void save(drivetrain, value)}/></div></div>{message && <p aria-live="polite" className={message.includes("Could not") || message.includes("not available") || message.includes("Sign in") ? "error" : "trend"}>{message}</p>}</section>;
}
