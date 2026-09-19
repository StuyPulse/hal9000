"use client";

import { useId, useMemo, useState } from "react";

export type MemberOption = { id: string; name: string };

type Props = {
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  members: MemberOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  ariaLabel: string;
  choiceLabel?: string;
};

export function SearchableMemberSelect({ name, value, onValueChange, members, placeholder = "Search a scout…", emptyLabel = "Clear all assignments", disabled = false, ariaLabel, choiceLabel = "scout choices" }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = members.find((member) => member.id === value);
  const results = useMemo(() => [...members].filter((member) => member.name.toLowerCase().includes(query.trim().toLowerCase())).sort((left, right) => left.name.localeCompare(right.name)), [members, query]);

  const close = () => { setOpen(false); setQuery(""); };
  const choose = (nextValue: string) => { onValueChange(nextValue); close(); };

  return <div className={`searchable-member-select${open ? " is-open" : ""}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}>
    <input type="hidden" name={name} value={value}/>
    <div className="searchable-member-input">
      <input value={open ? query : selected?.name ?? ""} disabled={disabled} role="combobox" aria-label={ariaLabel} aria-autocomplete="list" aria-expanded={open} aria-controls={listId} autoComplete="off" placeholder={placeholder} onFocus={() => { setQuery(""); setOpen(true); }} onChange={(event) => { setQuery(event.target.value); setOpen(true); if (value) onValueChange(""); }} onKeyDown={(event) => { if (event.key === "Escape") close(); if (event.key === "ArrowDown") setOpen(true); if (event.key === "Enter" && results[0]) { event.preventDefault(); choose(results[0].id); } }}/>
      <button type="button" disabled={disabled} aria-label={open ? `Close ${choiceLabel}` : `Show ${choiceLabel}`} aria-expanded={open} onMouseDown={(event) => event.preventDefault()} onClick={() => open ? close() : setOpen(true)}>⌄</button>
    </div>
    {open && <div id={listId} className="searchable-member-results" role="listbox" aria-label={ariaLabel}>
      <button type="button" role="option" aria-selected={!value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose("")}>{emptyLabel}</button>
      {results.length ? results.map((member) => <button key={member.id} type="button" role="option" aria-selected={member.id === value} className={member.id === value ? "selected" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(member.id)}>{member.name}</button>) : <p className="muted">No scouts match that search.</p>}
    </div>}
  </div>;
}
