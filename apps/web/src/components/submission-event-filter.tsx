"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppSelect } from "@/components/app-select";

type EventOption = { id: string; name: string; status: string };

export function SubmissionEventFilter({ events, activeEventId, selectedEventId }: { events: EventOption[]; activeEventId: string; selectedEventId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedByUrl = searchParams.has("event");

  useEffect(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!selectedByUrl || navigation?.type !== "reload") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("event");
    const query = params.toString();
    router.replace(`/submissions${query ? `?${query}` : ""}`);
  }, [router, searchParams, selectedByUrl]);

  function choose(eventId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (eventId === activeEventId) params.delete("event");
    else params.set("event", eventId);
    const query = params.toString();
    router.push(`/submissions${query ? `?${query}` : ""}`);
  }

  return <div className="submission-event-filter"><label htmlFor="submission-event">Event</label><AppSelect id="submission-event" ariaLabel="Submission event" value={selectedEventId} onValueChange={choose} options={events.map((event) => ({ value: event.id, label: `${event.name}${event.id === activeEventId ? " · active" : ""}` }))}/></div>;
}
