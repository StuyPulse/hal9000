"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

export type AppSelectOption = { value: string; label: string; disabled?: boolean };

type Props = {
  options: AppSelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
};

export function AppSelect({ options, value, defaultValue = "", onValueChange, name, id, ariaLabel, disabled = false, className = "" }: Props) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selectedValue = value ?? internalValue;
  const selected = options.find((option) => option.value === selectedValue);

  function choose(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
    setOpen(false);
  }

  function moveSelection(direction: -1 | 1) {
    const available = options.filter((option) => !option.disabled);
    const currentIndex = available.findIndex((option) => option.value === selectedValue);
    const next = available[(currentIndex + direction + available.length) % available.length];
    if (next) choose(next.value);
  }

  return <div className={`app-select ${className}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    {name && <input type="hidden" name={name} value={selectedValue}/>} 
    <button id={id} type="button" className="app-select-trigger" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); return; } if (event.key === "ArrowDown") { event.preventDefault(); if (!open) setOpen(true); else moveSelection(1); } if (event.key === "ArrowUp") { event.preventDefault(); if (!open) setOpen(true); else moveSelection(-1); } }}>
      <span>{selected?.label ?? options.find((option) => option.value === "")?.label ?? "Select…"}</span><ChevronDown aria-hidden="true" size={16}/>
    </button>
    {open && <div id={listId} className="app-select-menu" role="listbox" aria-label={ariaLabel}>{options.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === selectedValue} disabled={option.disabled} className={option.value === selectedValue ? "selected" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option.value)}>{option.label}</button>)}</div>}
  </div>;
}
