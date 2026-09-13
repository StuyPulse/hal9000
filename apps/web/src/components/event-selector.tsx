"use client";

import { useRouter } from "next/navigation";
import { AppSelect } from "@/components/app-select";

type EventOption = { event_key: string; name: string; status: string };
export function EventSelector({ events, value, suffix = "teams" }: { events: EventOption[]; value: string; suffix?: string }) {
  const router = useRouter();
  return <div className="event-select"><label htmlFor="event-selector">Event</label><AppSelect id="event-selector" value={value} onValueChange={(eventKey) => router.push(`/events/${eventKey}/${suffix}`)} options={events.map((candidate) => ({ value: candidate.event_key, label: `${candidate.name}${candidate.status === "active" ? " · active" : ""}` }))}/></div>;
}
