"use client";

import { useId, useMemo, useState } from "react";

export type TeamOption = { id: string; number: number; name: string };

type Props = {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  teams: TeamOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
};

export function SearchableTeamSelect({ id, value, onValueChange, teams, placeholder = "Search team number or name…", emptyLabel = "Choose a team…", disabled = false }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const sorted = useMemo(() => [...teams].sort((left, right) => left.number - right.number), [teams]);
  const selected = sorted.find((team) => team.id === value);
  const selectedLabel = selected ? `${selected.number} · ${selected.name}` : "";
  const results = sorted.filter((team) => `${team.number} ${team.name}`.toLowerCase().includes(query.toLowerCase().trim()));

  function openMenu() {
    setQuery("");
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    setQuery("");
  }

  function choose(team?: TeamOption) {
    onValueChange(team?.id ?? "");
    closeMenu();
  }

  return (
    <div className="searchable-team-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeMenu(); }}>
      <div className="searchable-team-input">
        <input
          id={id}
          value={open ? query : selectedLabel}
          disabled={disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={openMenu}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (value) onValueChange("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeMenu();
            if (event.key === "ArrowDown") openMenu();
            if (event.key === "Enter" && results[0]) {
              event.preventDefault();
              choose(results[0]);
            }
          }}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={open ? "Close team choices" : "Show team choices"}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => open ? closeMenu() : openMenu()}
        >
          ⌄
        </button>
      </div>
      {open && (
        <div className="searchable-team-results" id={listId} role="listbox">
          {emptyLabel && <button type="button" role="option" aria-selected={!value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose()}>{emptyLabel}</button>}
          {results.length ? results.map((team) => (
            <button key={team.id} type="button" role="option" aria-selected={team.id === value} className={team.id === value ? "selected" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(team)}>
              <strong>{team.number}</strong><span>{team.name}</span>
            </button>
          )) : <p className="muted">No teams match that search.</p>}
        </div>
      )}
    </div>
  );
}
