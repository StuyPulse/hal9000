"use client";

import { CalendarDays, Search, UsersRound } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

type Team = { number: number; name: string };
type Event = { key: string; name: string; status: string };

export function GlobalSearch({ eventKey, teams, events }: { eventKey: string | null; teams: Team[]; events: Event[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const term = query.trim().toLowerCase();
  const teamResults = useMemo(() => teams.filter((team) => `${team.number} ${team.name}`.toLowerCase().includes(term)).slice(0, 8), [teams, term]);
  const eventResults = useMemo(() => events.filter((event) => `${event.key} ${event.name}`.toLowerCase().includes(term)).slice(0, 6), [events, term]);
  const hasResults = teamResults.length || eventResults.length;

  function close() {
    setOpen(false);
    setQuery("");
  }

  return <div className="global-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}>
    <div className="global-search-input">
      <Search size={16} aria-hidden="true"/>
      <input aria-label="Search teams and events" value={query} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} placeholder="Search teams and events" autoComplete="off" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") close(); }}/>
    </div>
    {open && <div id={listId} className="global-search-results" role="listbox" aria-label="Search results">
      {teamResults.length > 0 && <div className="global-search-group"><span>Teams{eventKey ? " · active event" : ""}</span>{teamResults.map((team) => eventKey ? <Link key={team.number} href={`/events/${eventKey}/teams/${team.number}`} role="option" onClick={close}><UsersRound size={15} aria-hidden="true"/><strong>{team.number}</strong><small>{team.name}</small></Link> : null)}</div>}
      {eventResults.length > 0 && <div className="global-search-group"><span>Events</span>{eventResults.map((event) => <Link key={event.key} href={`/events/${event.key}/summary`} role="option" onClick={close}><CalendarDays size={15} aria-hidden="true"/><strong>{event.name}</strong><small>{event.key} · {event.status}</small></Link>)}</div>}
      {!hasResults && <p className="muted">{term ? "No teams or events match that search." : "Start typing to search teams and events."}</p>}
    </div>}
  </div>;
}
