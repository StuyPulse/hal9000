"use client";

import { Search, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type SubmissionScoutOption = { id: string; name: string };

export function SubmissionScoutFilter({ scouts, value }: { scouts: SubmissionScoutOption[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = scouts.find((scout) => scout.id === value);
  const results = useMemo(() => scouts.filter((scout) => scout.name.toLowerCase().includes(query.trim().toLowerCase())), [query, scouts]);

  function choose(nextId = "") {
    const params = new URLSearchParams(searchParams.toString());
    if (nextId) params.set("scout", nextId);
    else params.delete("scout");
    const nextSearch = params.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname);
    setQuery("");
    setOpen(false);
  }

  return <div className="submission-scout-filter searchable-team-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setOpen(false); setQuery(""); } }}>
    <div className="searchable-team-input">
      <Search size={16} aria-hidden="true" className="submission-scout-search"/>
      <input
        id="submission-scout-filter"
        value={open ? query : selected?.name ?? ""}
        role="combobox"
        aria-label="Filter submissions by scout"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        placeholder="Find a scout…"
        autoComplete="off"
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setOpen(false); setQuery(""); }
          if (event.key === "Enter" && results[0]) { event.preventDefault(); choose(results[0].id); }
        }}
      />
      {selected ? <button type="button" aria-label="Clear scout filter" onMouseDown={(event) => event.preventDefault()} onClick={() => choose()}><X size={16} aria-hidden="true"/></button> : <button type="button" aria-label={open ? "Close scout choices" : "Show scout choices"} aria-expanded={open} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(""); setOpen((current) => !current); }}>⌄</button>}
    </div>
    {open && <div className="searchable-team-results" id={listId} role="listbox" aria-label="Scouts">
      <button type="button" role="option" aria-selected={!value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose()}>All scouts</button>
      {results.length ? results.map((scout) => <button key={scout.id} type="button" role="option" aria-selected={scout.id === value} className={scout.id === value ? "selected" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(scout.id)}><strong>{scout.name}</strong></button>) : <p className="muted">No scouts match that search.</p>}
    </div>}
  </div>;
}
