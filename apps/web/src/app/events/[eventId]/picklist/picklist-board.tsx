"use client";

/* eslint-disable react-hooks/immutability -- Native color inputs update a mutable draft without rerendering the team board. */

import { ArrowDown, ArrowUp, Check, GripVertical, Layers3, Plus, RotateCcw, Settings2, Tag as TagIcon, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { LocalDateTime } from "@/components/local-date-time";
import { createClient } from "@/lib/supabase/client";
import type { ScoutStats } from "@/lib/scouting-stats";

type Category = { id: string; name: string; color: string; sort_order: number };
type PicklistTag = { id: string; name: string; color: string; sort_order: number };
type Team = { id: string; team_number: number; name: string; opr?: number; eventRank?: number | null; scouting?: ScoutStats | null };
type Ranking = { id: string; team_id: string; category_id: string | null; rank: number | null; note: string; selected: boolean; tag_ids: string[]; created_by: string; updated_by: string; updated_at: string };
type RankingChange = Pick<Ranking, "rank" | "category_id" | "note" | "selected" | "tag_ids">;
type Change = { id: string; team_id: string; actor_user_id: string | null; action: "baseline" | "created" | "updated" | "deleted"; before_state: Record<string, unknown> | null; after_state: Record<string, unknown> | null; created_at: string; teams?: { team_number: number; name: string } | null; profiles?: { display_name: string } | null };
type Revision = { id: string; createdAt: string; oldestAt: string; actorUserId: string | null; editor: string; changes: Change[] };
type HistoricalRankState = { rank: number; category_id: string | null };
type TierPosition = { categoryId: string | null; position: number; total: number };
type ChangePositions = { before: TierPosition; after: TierPosition };
const EDITING_SESSION_IDLE_MS = 5 * 60 * 1_000;
const UNSORTED_TIER_ID = "__unsorted__";
const unsortedTier: Category = { id: UNSORTED_TIER_ID, name: "Unsorted", color: "#64748b", sort_order: -1 };

function useMutableValue(initialValue: string) {
  const valueRef = useRef(initialValue);
  return useMemo(() => ({
    get current() { return valueRef.current; },
    set current(value: string) { valueRef.current = value; },
  }), []);
}

export function PicklistBoard({ organizationId, eventId, eventKey, userId, canEdit, categories: initialCategories, tags: initialTags, teams, rankings: initialRankings, changes }: { organizationId: string; eventId: string; eventKey: string; userId: string; canEdit: boolean; categories: Category[]; tags: PicklistTag[]; teams: Team[]; rankings: Ranking[]; changes: Change[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [tags, setTags] = useState(initialTags);
  const [rankings, setRankings] = useState(initialRankings);
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [newTierName, setNewTierName] = useState("");
  const newTierColor = useMutableValue("#64748b");
  const [newTagName, setNewTagName] = useState("");
  const newTagColor = useMutableValue("#60a5fa");
  const [managerOpen, setManagerOpen] = useState<"tiers" | "tags" | null>(null);
  const [activeTagIds, setActiveTagIds] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const pointerDragTeamId = useRef<string | null>(null);
  const autoScrollDirection = useRef(0);
  const autoScrollFrame = useRef<number | null>(null);
  useEffect(() => () => {
    if (autoScrollFrame.current !== null) window.cancelAnimationFrame(autoScrollFrame.current);
  }, []);
  const [restoringRevisionId, setRestoringRevisionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const orderedCategories = useMemo(() => [...categories].sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name)), [categories]);
  const orderedTags = useMemo(() => [...tags].sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name)), [tags]);
  const byTeam = useMemo(() => new Map(rankings.map((ranking) => [ranking.team_id, ranking])), [rankings]);
  const visibleTeamIds = useMemo(() => new Set(teams.filter((team) => !activeTagIds.length || (byTeam.get(team.id)?.tag_ids ?? []).some((tagId) => activeTagIds.includes(tagId))).map((team) => team.id)), [activeTagIds, byTeam, teams]);
  const revisions = useMemo<Revision[]>(() => {
    const sessions: Revision[] = [];
    for (const change of changes) {
      const current = sessions.at(-1);
      const idleFor = current ? new Date(current.oldestAt).getTime() - new Date(change.created_at).getTime() : Number.POSITIVE_INFINITY;
      if (current && current.actorUserId === change.actor_user_id && idleFor >= 0 && idleFor <= EDITING_SESSION_IDLE_MS) {
        current.changes.push(change);
        current.oldestAt = change.created_at;
      } else {
        sessions.push({ id: change.id, createdAt: change.created_at, oldestAt: change.created_at, actorUserId: change.actor_user_id, editor: change.profiles?.display_name ?? "Unknown member", changes: [change] });
      }
    }
    return sessions;
  }, [changes]);
  const changePositions = useMemo(() => {
    const defaults = new Map<string, HistoricalRankState>(teams.map((team, index) => [team.id, { rank: (index + 1) * 1024, category_id: null }]));
    const states = new Map(defaults);
    for (const ranking of rankings) states.set(ranking.team_id, { rank: ranking.rank ?? defaults.get(ranking.team_id)?.rank ?? Number.MAX_SAFE_INTEGER, category_id: ranking.category_id });
    const positionFor = (teamId: string): TierPosition => {
      const state = states.get(teamId) ?? defaults.get(teamId)!;
      const inTier = teams.filter((team) => (states.get(team.id) ?? defaults.get(team.id))?.category_id === state.category_id).sort((left, right) => ((states.get(left.id) ?? defaults.get(left.id))?.rank ?? Number.MAX_SAFE_INTEGER) - ((states.get(right.id) ?? defaults.get(right.id))?.rank ?? Number.MAX_SAFE_INTEGER) || left.team_number - right.team_number);
      return { categoryId: state.category_id, position: Math.max(0, inTier.findIndex((team) => team.id === teamId)) + 1, total: inTier.length };
    };
    const stateFrom = (snapshot: Record<string, unknown> | null, fallback: HistoricalRankState): HistoricalRankState => ({ rank: typeof snapshot?.rank === "number" ? snapshot.rank : fallback.rank, category_id: typeof snapshot?.category_id === "string" ? snapshot.category_id : snapshot?.category_id === null ? null : fallback.category_id });
    const positions = new Map<string, ChangePositions>();
    for (const change of changes) {
      const fallback: HistoricalRankState = defaults.get(change.team_id) ?? { rank: Number.MAX_SAFE_INTEGER, category_id: null };
      const after = change.action === "deleted" ? fallback : stateFrom(change.after_state, states.get(change.team_id) ?? fallback);
      states.set(change.team_id, after);
      const afterPosition = positionFor(change.team_id);
      const before = stateFrom(change.before_state, fallback);
      states.set(change.team_id, before);
      positions.set(change.id, { before: positionFor(change.team_id), after: afterPosition });
    }
    return positions;
  }, [changes, rankings, teams]);
  const tierCategories = [unsortedTier, ...orderedCategories];
  const databaseCategoryId = (tierId: string) => tierId === UNSORTED_TIER_ID ? null : tierId;
  const allTeamsInTier = (tierId: string) => {
    const categoryId = databaseCategoryId(tierId);
    return teams.filter((team) => (byTeam.get(team.id)?.category_id ?? null) === categoryId).sort((left, right) => (byTeam.get(left.id)?.rank ?? Number.MAX_SAFE_INTEGER) - (byTeam.get(right.id)?.rank ?? Number.MAX_SAFE_INTEGER) || (right.opr ?? 0) - (left.opr ?? 0) || left.team_number - right.team_number);
  };
  const teamsInTier = (tierId: string) => allTeamsInTier(tierId).filter((team) => visibleTeamIds.has(team.id));
  const overallRankByTeam = useMemo(() => new Map(tierCategories.flatMap((category) => allTeamsInTier(category.id)).map((team, index) => [team.id, index + 1])), [byTeam, teams, tierCategories]);

  const rankingPayload = (team: Team, changes: Partial<RankingChange>) => {
    const current = byTeam.get(team.id);
    const hasChange = (field: keyof RankingChange) => Object.prototype.hasOwnProperty.call(changes, field);
    return { organization_id: organizationId, event_id: eventId, team_id: team.id, created_by: current?.created_by ?? userId, updated_by: userId, rank: hasChange("rank") ? changes.rank : current?.rank ?? (teams.findIndex((item) => item.id === team.id) + 1) * 1024, category_id: hasChange("category_id") ? changes.category_id : current?.category_id ?? null, note: hasChange("note") ? changes.note : current?.note ?? "", selected: hasChange("selected") ? changes.selected : current?.selected ?? false, tag_ids: hasChange("tag_ids") ? changes.tag_ids : current?.tag_ids ?? [] };
  };

  async function persistTeams(next: { team: Team; changes: Partial<RankingChange> }[], successMessage: string): Promise<Ranking[] | null> {
    if (!canEdit || !next.length) return null;
    const ids = next.map((item) => item.team.id);
    setSavingIds((currentIds) => [...new Set([...currentIds, ...ids])]);
    const supabase: any = createClient();
    const { data, error } = await supabase.from("shared_picklist_rankings").upsert(next.map((item) => rankingPayload(item.team, item.changes)), { onConflict: "event_id,team_id" }).select("id,team_id,category_id,rank,note,selected,tag_ids,created_by,updated_by,updated_at");
    setSavingIds((currentIds) => currentIds.filter((id) => !ids.includes(id)));
    if (error) { setNotice("Could not save that change. Try again."); return null; }
    const savedRankings = (data ?? []) as Ranking[];
    setRankings((currentRankings) => { const saved = new Map(savedRankings.map((ranking) => [ranking.team_id, ranking])); return currentRankings.filter((ranking) => !saved.has(ranking.team_id)).concat(savedRankings); });
    if (successMessage) setNotice(successMessage);
    return savedRankings;
  }

  async function moveWithinTier(teamId: string, tierId: string, direction: -1 | 1) {
    const categoryId = databaseCategoryId(tierId); const tierTeams = allTeamsInTier(tierId); const index = tierTeams.findIndex((team) => team.id === teamId); const neighbor = index + direction;
    if (neighbor < 0 || neighbor >= tierTeams.length) return;
    [tierTeams[index], tierTeams[neighbor]] = [tierTeams[neighbor], tierTeams[index]];
    await persistTeams([tierTeams[index], tierTeams[neighbor]].map((team, position) => ({ team, changes: { category_id: categoryId, rank: byTeam.get(tierTeams[position === 0 ? neighbor : index].id)?.rank ?? (position + 1) * 1024 } })), "Order saved.");
  }

  async function moveToTier(teamId: string, tierId: string, beforeTeamId?: string) {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return;
    const categoryId = databaseCategoryId(tierId); const tierTeams = allTeamsInTier(tierId).filter((item) => item.id !== teamId);
    const target = beforeTeamId ? tierTeams.findIndex((item) => item.id === beforeTeamId) : tierTeams.length;
    const insertAt = target < 0 ? tierTeams.length : target;
    const beforeRank = insertAt > 0 ? byTeam.get(tierTeams[insertAt - 1].id)?.rank ?? insertAt * 1024 : undefined;
    const afterRank = tierTeams[insertAt] ? byTeam.get(tierTeams[insertAt].id)?.rank ?? (insertAt + 1) * 1024 : undefined;
    const rank = beforeRank === undefined ? (afterRank ?? 2048) - 1024 : afterRank === undefined ? beforeRank + 1024 : Math.floor((beforeRank + afterRank) / 2);
    if (afterRank !== undefined && rank === beforeRank) { tierTeams.splice(insertAt, 0, team); await persistTeams(tierTeams.map((item, index) => ({ team: item, changes: { category_id: categoryId, rank: (index + 1) * 1024 } })), `${team.team_number} moved.`); return; }
    await persistTeams([{ team, changes: { category_id: categoryId, rank } }], `${team.team_number} moved.`);
  }

  async function addTier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const name = newTierName.trim();
    if (!name || !canEdit) return;
    if (orderedCategories.some((category) => category.name.toLowerCase() === name.toLowerCase())) { setNotice("That tier already exists."); return; }
    const supabase: any = createClient(); const { data, error } = await supabase.from("picklist_categories").insert({ organization_id: organizationId, name, color: newTierColor.current, sort_order: orderedCategories.length, created_by: userId }).select("id,name,color,sort_order").single();
    if (error) { setNotice("Could not add that tier. Try again."); return; }
    setCategories((current) => [...current, data]); setNewTierName(""); setNotice(`${name} tier added.`);
  }

  async function moveTier(categoryId: string, direction: -1 | 1) {
    const index = orderedCategories.findIndex((category) => category.id === categoryId); const neighbor = index + direction;
    if (!canEdit || neighbor < 0 || neighbor >= orderedCategories.length) return;
    const next = [...orderedCategories]; [next[index], next[neighbor]] = [next[neighbor], next[index]];
    const supabase: any = createClient(); const { error } = await Promise.all(next.map((category, sortOrder) => supabase.from("picklist_categories").update({ sort_order: sortOrder }).eq("id", category.id))).then((results) => ({ error: results.find((result) => result.error)?.error }));
    if (error) { setNotice("Could not reorder tiers. Try again."); return; }
    setCategories(next.map((category, sortOrder) => ({ ...category, sort_order: sortOrder }))); setNotice("Tier order saved.");
  }

  async function removeTier(categoryId: string) {
    const index = orderedCategories.findIndex((category) => category.id === categoryId);
    if (!canEdit || orderedCategories.length <= 1 || index < 0) return;
    const category = orderedCategories[index]; const fallback = orderedCategories[index + 1] ?? orderedCategories[index - 1]; const affected = allTeamsInTier(categoryId);
    if (affected.length && !await persistTeams(affected.map((team, rank) => ({ team, changes: { category_id: fallback.id, rank: allTeamsInTier(fallback.id).length + rank + 1 } })), `${category.name} teams moved to ${fallback.name}.`)) return;
    const supabase: any = createClient(); const { error } = await supabase.from("picklist_categories").delete().eq("id", categoryId);
    if (error) { setNotice("Could not remove that tier. Try again."); return; }
    setCategories((current) => current.filter((item) => item.id !== categoryId)); setNotice(`${category.name} tier removed.`);
  }

  async function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const name = newTagName.trim();
    if (!name || !canEdit) return;
    if (orderedTags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) { setNotice("That tag already exists."); return; }
    const supabase: any = createClient(); const { data, error } = await supabase.from("picklist_tags").insert({ organization_id: organizationId, name, color: newTagColor.current.toUpperCase(), sort_order: orderedTags.length, created_by: userId }).select("id,name,color,sort_order").single();
    if (error) { setNotice("Could not add that tag. Try again."); return; }
    setTags((current) => [...current, data]); setNewTagName(""); setNotice(`${name} tag added.`);
  }

  async function removeTag(tag: PicklistTag) {
    if (!canEdit) return;
    const supabase: any = createClient(); const { error } = await supabase.from("picklist_tags").delete().eq("id", tag.id);
    if (error) { setNotice("Could not remove that tag. Try again."); return; }
    setTags((current) => current.filter((item) => item.id !== tag.id)); setActiveTagIds((current) => current.filter((id) => id !== tag.id)); setRankings((current) => current.map((ranking) => ({ ...ranking, tag_ids: ranking.tag_ids.filter((id) => id !== tag.id) }))); setNotice(`${tag.name} tag removed.`);
  }

  const toggleActiveTag = (tagId: string) => setActiveTagIds((current) => current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]);
  const stopAutoScroll = () => { autoScrollDirection.current = 0; if (autoScrollFrame.current !== null) { window.cancelAnimationFrame(autoScrollFrame.current); autoScrollFrame.current = null; } };
  const updateAutoScroll = (clientY: number) => {
    const edge = Math.min(120, Math.max(72, window.innerHeight * 0.14));
    const direction = clientY < edge ? -(1 - clientY / edge) : clientY > window.innerHeight - edge ? (1 - (window.innerHeight - clientY) / edge) : 0;
    autoScrollDirection.current = direction;
    if (!direction || autoScrollFrame.current !== null) return;
    const scroll = () => {
      const currentDirection = autoScrollDirection.current;
      if (!currentDirection) { autoScrollFrame.current = null; return; }
      window.scrollBy(0, currentDirection * 18);
      autoScrollFrame.current = window.requestAnimationFrame(scroll);
    };
    autoScrollFrame.current = window.requestAnimationFrame(scroll);
  };
  const startDrag = (event: DragEvent<HTMLElement>, teamId: string) => { if (!canEdit) return; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", teamId); setDraggingId(teamId); };
  const finishDrag = () => { pointerDragTeamId.current = null; stopAutoScroll(); setDraggingId(null); setDropTargetId(null); };
  const dropOn = (event: DragEvent<HTMLElement>, categoryId: string, beforeTeamId?: string) => { event.preventDefault(); event.stopPropagation(); const teamId = event.dataTransfer.getData("text/plain") || draggingId; if (teamId) void moveToTier(teamId, categoryId, beforeTeamId); finishDrag(); };
  const pointerDropTarget = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-picklist-team-id], [data-picklist-tier-id]");
    if (!element) return null;
    const row = element.matches("[data-picklist-team-id]") ? element : element.closest<HTMLElement>("[data-picklist-team-id]");
    const tier = element.closest<HTMLElement>("[data-picklist-tier-id]");
    const categoryId = tier?.dataset.picklistTierId;
    return categoryId ? { categoryId, beforeTeamId: row?.dataset.picklistTeamId } : null;
  };
  const beginPointerDrag = (event: ReactPointerEvent<HTMLSpanElement>, teamId: string) => {
    if (!canEdit || event.pointerType === "mouse") return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pointerDragTeamId.current = teamId; setDraggingId(teamId); updateAutoScroll(event.clientY);
  };
  const movePointerDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!pointerDragTeamId.current) return;
    event.preventDefault(); updateAutoScroll(event.clientY);
    const target = pointerDropTarget(event.clientX, event.clientY); setDropTargetId(target?.beforeTeamId ?? null);
  };
  const endPointerDrag = (event: ReactPointerEvent<HTMLSpanElement>, shouldDrop = true) => {
    const teamId = pointerDragTeamId.current; if (!teamId) return;
    const target = shouldDrop ? pointerDropTarget(event.clientX, event.clientY) : null;
    if (target && target.beforeTeamId !== teamId) void moveToTier(teamId, target.categoryId, target.beforeTeamId);
    finishDrag();
  };

  function defaultRankingState(team: Team): RankingChange {
    return { rank: (teams.findIndex((item) => item.id === team.id) + 1) * 1024, category_id: null, note: "", selected: false, tag_ids: [] };
  }

  function rankingState(ranking: Ranking): RankingChange {
    return { rank: ranking.rank, category_id: ranking.category_id, note: ranking.note, selected: ranking.selected, tag_ids: ranking.tag_ids };
  }

  function statesMatch(left: RankingChange, right: RankingChange) {
    return left.rank === right.rank && left.category_id === right.category_id && left.note === right.note && left.selected === right.selected && left.tag_ids.length === right.tag_ids.length && left.tag_ids.every((tagId, index) => tagId === right.tag_ids[index]);
  }

  async function restoreRevision(revision: Revision) {
    if (!canEdit) return;
    const revisionIndex = revisions.findIndex((item) => item.id === revision.id);
    if (revisionIndex < 0) return;

    // Work backward from the current board through only newer revisions. The
    // resulting map is the full board immediately after the selected revision.
    const snapshot = new Map(rankings.map((ranking) => [ranking.team_id, rankingState(ranking)]));
    for (const newerRevision of revisions.slice(0, revisionIndex)) {
      for (const change of newerRevision.changes) {
        const before = restoreRankingState(change.before_state);
        if (change.action === "created" && !before) snapshot.delete(change.team_id);
        else if (before) snapshot.set(change.team_id, { ...(snapshot.get(change.team_id) ?? {}), ...before } as RankingChange);
      }
    }

    const teamById = new Map(teams.map((team) => [team.id, team]));
    const affectedTeamIds = new Set([...rankings.map((ranking) => ranking.team_id), ...snapshot.keys()]);
    const restores = [...affectedTeamIds].flatMap((teamId) => {
      const team = teamById.get(teamId);
      if (!team) return [];
      // A ranking created after the selected version becomes an empty, unsorted
      // row. That is visually and behaviorally the same as no ranking, while
      // retaining an audit trail for this restore operation.
      const desired = snapshot.get(teamId) ?? defaultRankingState(team);
      const current = byTeam.get(teamId);
      return current && statesMatch(rankingState(current), desired) ? [] : [{ team, changes: desired }];
    });
    if (!restores.length) { setNotice("The picklist already matches this version."); return; }
    setRestoringRevisionId(revision.id);
    await persistTeams(restores, `Restored the picklist to the ${new Date(revision.createdAt).toLocaleString()} version.`);
    setRestoringRevisionId(null);
  }

  return <>
    <section className="card picklist-workspace" aria-label="Picklist navigation and filters">
      <div className="picklist-tier-manager">
        <div className="picklist-toolbar-group"><span className="picklist-manager-label">Tiers</span><div className="picklist-tier-controls">{orderedCategories.map((category) => <button className="picklist-tier-jump" key={category.id} type="button" style={{ "--tier": category.color } as CSSProperties} onClick={() => document.getElementById(`picklist-tier-${category.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{category.name}</button>)}{canEdit && <button type="button" className="picklist-manage-button" aria-label="Manage tiers" aria-expanded={managerOpen === "tiers"} onClick={() => setManagerOpen((open) => open === "tiers" ? null : "tiers")}><Settings2 size={15}/></button>}</div>{canEdit && managerOpen === "tiers" && <div className="picklist-manager-popover"><div className="picklist-manager-popover-list">{orderedCategories.map((category, index) => <div className="picklist-tier-control" style={{ "--tier": category.color } as CSSProperties} key={category.id}><span>{category.name}</span><div className="picklist-tier-actions"><button type="button" disabled={index === 0} aria-label={`Move ${category.name} tier up`} onClick={() => void moveTier(category.id, -1)}><ArrowUp size={14}/></button><button type="button" disabled={index === orderedCategories.length - 1} aria-label={`Move ${category.name} tier down`} onClick={() => void moveTier(category.id, 1)}><ArrowDown size={14}/></button><button type="button" disabled={orderedCategories.length <= 1} aria-label={`Remove ${category.name} tier`} onClick={() => void removeTier(category.id)}><Trash2 size={14}/></button></div></div>)}</div><form className="picklist-tier-form" onSubmit={addTier}><label className="sr-only" htmlFor="new-picklist-tier">New tier name</label><input id="new-picklist-tier" value={newTierName} onChange={(event) => setNewTierName(event.target.value)} maxLength={48} placeholder="New tier" /><label className="sr-only" htmlFor="new-picklist-tier-color">Tier color</label><input id="new-picklist-tier-color" type="color" defaultValue={newTierColor.current} onChange={(event) => { newTierColor.current = event.target.value; }} /><button type="submit" className="button secondary" disabled={!newTierName.trim()}><Plus size={15} aria-hidden="true"/> Add</button></form></div>}</div>
        <div className="picklist-toolbar-group"><span className="picklist-manager-label">Tags</span><div className="picklist-tag-controls">{orderedTags.map((tag) => <button className={`picklist-tag-filter${activeTagIds.includes(tag.id) ? " active" : ""}`} key={tag.id} type="button" style={{ "--tag": tag.color } as CSSProperties} aria-pressed={activeTagIds.includes(tag.id)} onClick={() => toggleActiveTag(tag.id)}><TagIcon size={13} aria-hidden="true"/>{tag.name}</button>)}{activeTagIds.length > 0 && <button className="picklist-clear-tags" type="button" onClick={() => setActiveTagIds([])}><X size={13} aria-hidden="true"/>Clear</button>}{canEdit && <button type="button" className="picklist-manage-button" aria-label="Manage tags" aria-expanded={managerOpen === "tags"} onClick={() => setManagerOpen((open) => open === "tags" ? null : "tags")}><Settings2 size={15}/></button>}</div>{canEdit && managerOpen === "tags" && <div className="picklist-manager-popover"><div className="picklist-manager-popover-list">{orderedTags.map((tag) => <span className="picklist-managed-tag" style={{ "--tag": tag.color } as CSSProperties} key={tag.id}><TagIcon size={13} aria-hidden="true"/>{tag.name}<button type="button" aria-label={`Remove ${tag.name} tag`} onClick={() => void removeTag(tag)}><Trash2 size={13}/></button></span>)}</div><form className="picklist-tag-form" onSubmit={addTag}><label className="sr-only" htmlFor="new-picklist-tag">New tag name</label><input id="new-picklist-tag" value={newTagName} onChange={(event) => setNewTagName(event.target.value)} maxLength={48} placeholder="New tag" /><label className="sr-only" htmlFor="new-picklist-tag-color">Tag color</label><input id="new-picklist-tag-color" type="color" defaultValue={newTagColor.current} onChange={(event) => { newTagColor.current = event.target.value; }} /><button type="submit" className="button secondary" disabled={!newTagName.trim()}><Plus size={15} aria-hidden="true"/> Add</button></form></div>}</div>
        {!canEdit && <span className="tag pending">View only</span>}
      </div>
    </section>

    <section className="picklist-tier-board" aria-label="Shared picklist tiers">{tierCategories.map((category) => { const allTierTeams = allTeamsInTier(category.id); const tierTeams = teamsInTier(category.id); return <section id={`picklist-tier-${category.id}`} data-picklist-tier-id={category.id} className="card picklist-tier" style={{ "--tier": category.color } as CSSProperties} key={category.id} onDragOver={(event) => { if (canEdit) { event.preventDefault(); updateAutoScroll(event.clientY); } }} onDrop={(event) => dropOn(event, category.id)}><div className="picklist-tier-head"><div><span className="picklist-tier-label">{category.name}</span><p className="muted">{activeTagIds.length ? `${tierTeams.length} of ${allTierTeams.length}` : tierTeams.length} teams</p></div></div><div className="picklist-tier-list">{tierTeams.map((team) => <TierTeamRow key={team.id} team={team} eventKey={eventKey} ranking={byTeam.get(team.id)} categories={tierCategories} tags={orderedTags} overallRank={overallRankByTeam.get(team.id) ?? 0} tierIndex={allTierTeams.findIndex((item) => item.id === team.id)} tierSize={allTierTeams.length} canEdit={canEdit} saving={savingIds.includes(team.id)} dragging={draggingId === team.id} dropTarget={dropTargetId === team.id} onDragStart={(event) => startDrag(event, team.id)} onDragEnd={finishDrag} onDragOver={(event) => { if (canEdit) { event.preventDefault(); updateAutoScroll(event.clientY); if (dropTargetId !== team.id) setDropTargetId(team.id); } }} onDrop={(event) => dropOn(event, category.id, team.id)} onPointerDown={(event) => beginPointerDrag(event, team.id)} onPointerMove={movePointerDrag} onPointerUp={endPointerDrag} onPointerCancel={(event) => endPointerDrag(event, false)} onTierChange={(categoryId) => void moveToTier(team.id, categoryId)} onMove={(direction) => void moveWithinTier(team.id, category.id, direction)} onNote={(note) => void persistTeams([{ team, changes: { note } }], `Note saved for Team ${team.team_number}.`)} onSelected={(selected) => void persistTeams([{ team, changes: { selected } }], selected ? `Team ${team.team_number} selected.` : `Team ${team.team_number} unselected.`)} onTags={(tagIds) => void persistTeams([{ team, changes: { tag_ids: tagIds } }], `Tags saved for Team ${team.team_number}.`)}/>)}</div>{!tierTeams.length && <p className="muted picklist-empty-tier">{activeTagIds.length ? "No teams match these tags." : "Drop a team here."}</p>}</section>; })}</section>

    <section className="card section picklist-history" role="region" aria-label="Picklist version history"><div className="card-head"><div><h2>History</h2><span className="muted">{revisions.length} editing sessions · {changes.length} recorded changes</span></div><button type="button" className="button secondary" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? "Hide" : "View"} full history</button></div>{historyOpen && <div className="picklist-activity">{revisions.length ? revisions.map((revision) => <RevisionCard key={revision.id} revision={revision} categories={orderedCategories} tags={orderedTags} positions={changePositions} canRestore={canEdit} restoring={restoringRevisionId === revision.id} onRestore={() => void restoreRevision(revision)}/>) : <p className="muted">No shared edits have been recorded yet.</p>}</div>}</section>
    {notice && createPortal(<p className="trend picklist-manager-notice" aria-live="polite">{notice}</p>, document.querySelector(".picklist-tier-manager") ?? document.body)}
  </>;
}

function TierTeamRow({ team, eventKey, ranking, categories, tags, overallRank, tierIndex, tierSize, canEdit, saving, dragging, dropTarget, onDragStart, onDragEnd, onDragOver, onDrop, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onTierChange, onMove, onNote, onSelected, onTags }: { team: Team; eventKey: string; ranking?: Ranking; categories: Category[]; tags: PicklistTag[]; overallRank: number; tierIndex: number; tierSize: number; canEdit: boolean; saving: boolean; dragging: boolean; dropTarget: boolean; onDragStart: (event: DragEvent<HTMLElement>) => void; onDragEnd: () => void; onDragOver: (event: DragEvent<HTMLElement>) => void; onDrop: (event: DragEvent<HTMLElement>) => void; onPointerDown: (event: ReactPointerEvent<HTMLSpanElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLSpanElement>) => void; onPointerUp: (event: ReactPointerEvent<HTMLSpanElement>) => void; onPointerCancel: (event: ReactPointerEvent<HTMLSpanElement>) => void; onTierChange: (categoryId: string) => void; onMove: (direction: -1 | 1) => void; onNote: (note: string) => void; onSelected: (selected: boolean) => void; onTags: (tagIds: string[]) => void }) {
  const [note, setNote] = useState(ranking?.note ?? ""); const [tagPickerOpen, setTagPickerOpen] = useState(false); const [tierPickerOpen, setTierPickerOpen] = useState(false); const tagPickerRef = useRef<HTMLDivElement>(null); const currentTier = ranking?.category_id ?? UNSORTED_TIER_ID; const selected = ranking?.selected ?? false; const tagIds = ranking?.tag_ids ?? []; const activeTags = tags.filter((tag) => tagIds.includes(tag.id));
  useEffect(() => {
    if (!tagPickerOpen && !tierPickerOpen) return;
    const closeWhenOutside = (event: PointerEvent) => { if (!tagPickerRef.current?.contains(event.target as Node)) { setTagPickerOpen(false); setTierPickerOpen(false); } };
    document.addEventListener("pointerdown", closeWhenOutside);
    return () => document.removeEventListener("pointerdown", closeWhenOutside);
  }, [tagPickerOpen, tierPickerOpen]);
  const teamIdentity = <div className="picklist-team-name">{canEdit && <span className="picklist-drag-source" draggable onDragStart={(event) => onDragStart(event as unknown as DragEvent<HTMLElement>)} onDragEnd={onDragEnd} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} aria-label={`Drag Team ${team.team_number} to reorder`}><GripVertical className="picklist-drag-handle" size={18} aria-hidden="true"/></span>}<span className="picklist-team-position">{overallRank}</span><Link className="picklist-team-summary-link" href={`/events/${eventKey}/teams/${team.team_number}`} aria-label={`Open Team ${team.team_number} summary`}><strong>{team.team_number}{team.eventRank ? <em className="picklist-event-rank">#{team.eventRank}</em> : null}</strong><small>{team.name}</small></Link></div>;
  const stats = team.scouting;
  const scoutingMetrics = stats?.matches ? <dl className="picklist-scouting-metrics" aria-label={`Scouting data for Team ${team.team_number}`}><div className="picklist-scouting-phase"><dt>Auto</dt><dd><span>Scored</span> Avg <b>{stats.autoAvgScored.toFixed(1)}</b> · Peak <b>{stats.autoMaxScored.toFixed(1)}</b></dd><dd><span>Ferried</span> Avg <b>{stats.autoAvgFerried.toFixed(1)}</b> · Peak <b>{stats.autoMaxFerried.toFixed(1)}</b></dd></div><div className="picklist-scouting-phase"><dt>Teleop</dt><dd><span>Scored</span> Avg <b>{stats.teleopAvgScored.toFixed(1)}</b> · Peak <b>{stats.teleopMaxScored.toFixed(1)}</b></dd><dd><span>Ferried</span> Avg <b>{stats.teleopAvgFerried.toFixed(1)}</b> · Peak <b>{stats.teleopMaxFerried.toFixed(1)}</b></dd></div><div className="picklist-scouting-breakage"><dt>Broken</dt><dd><b>{stats.brokenPercent.toFixed(0)}%</b></dd></div></dl> : <span className="picklist-scouting-empty">No qualification/playoff scout data</span>;
  const tagControl = canEdit ? <div className="picklist-row-controls" ref={tagPickerRef}><div className="picklist-tag-picker"><button type="button" className={tagIds.length ? "picklist-tag-picker-trigger has-tags" : "picklist-tag-picker-trigger"} disabled={saving} aria-label={`Manage tags for Team ${team.team_number}${activeTags.length ? `; tags: ${activeTags.map((tag) => tag.name).join(", ")}` : ""}`} aria-expanded={tagPickerOpen} aria-controls={`picklist-team-tags-${team.id}`} onClick={() => { setTagPickerOpen((open) => !open); setTierPickerOpen(false); }}><TagIcon size={15} aria-hidden="true"/>{activeTags.map((tag) => <span key={tag.id} className="picklist-tag-dot" style={{ "--tag": tag.color } as CSSProperties} aria-hidden="true"/>)}</button>{tagPickerOpen && <div id={`picklist-team-tags-${team.id}`} className="picklist-tag-picker-menu" aria-label={`Tags for Team ${team.team_number}`}>{tags.map((tag) => <button key={tag.id} type="button" disabled={saving} style={{ "--tag": tag.color } as CSSProperties} className={tagIds.includes(tag.id) ? "active" : ""} aria-pressed={tagIds.includes(tag.id)} onClick={() => onTags(tagIds.includes(tag.id) ? tagIds.filter((id) => id !== tag.id) : [...tagIds, tag.id])}>{tag.name}</button>)}</div>}</div><div className="picklist-tier-picker"><button type="button" className="picklist-tag-picker-trigger" disabled={saving} aria-label={`Move Team ${team.team_number} to another tier`} aria-expanded={tierPickerOpen} aria-controls={`picklist-team-tier-${team.id}`} onClick={() => { setTierPickerOpen((open) => !open); setTagPickerOpen(false); }}><Layers3 size={15} aria-hidden="true"/></button>{tierPickerOpen && <div id={`picklist-team-tier-${team.id}`} className="picklist-tier-picker-menu" aria-label={`Choose a tier for Team ${team.team_number}`}>{categories.map((category) => <button key={category.id} type="button" disabled={saving} style={{ "--tier": category.color } as CSSProperties} className={category.id === currentTier ? "active" : ""} aria-pressed={category.id === currentTier} onClick={() => { onTierChange(category.id); setTierPickerOpen(false); }}>{category.name}</button>)}</div>}</div></div> : <div className="picklist-team-tags read-only">{activeTags.map((tag) => <span key={tag.id} style={{ "--tag": tag.color } as CSSProperties}>{tag.name}</span>)}</div>;
  const hasNote = Boolean(note.trim());
  const noteControl = canEdit ? <label className={hasNote ? "picklist-note" : "picklist-note is-empty"}><span className="sr-only">Notes for Team {team.team_number}</span><textarea value={note} maxLength={2000} disabled={saving} placeholder="Notes" onChange={(event) => setNote(event.target.value)} onBlur={() => { if (note.trim() !== (ranking?.note ?? "")) onNote(note.trim()); }}/></label> : <p className="picklist-read-note">{ranking?.note || "—"}</p>;
  return <article data-picklist-team-id={team.id} onDragOver={onDragOver} onDrop={onDrop} className={`picklist-team-row${dragging ? " dragging" : ""}${dropTarget ? " drop-target" : ""}${selected ? " is-selected" : ""}${canEdit && !hasNote ? " has-empty-note" : ""}`}>{teamIdentity}{scoutingMetrics}{tagControl}{noteControl}{canEdit ? <><label className={selected ? "picklist-selected is-selected" : "picklist-selected"}><input type="checkbox" checked={selected} disabled={saving} onChange={(event) => onSelected(event.target.checked)} /><Check size={14} aria-hidden="true"/><span>Selected</span></label><div className="picklist-order-buttons"><button type="button" disabled={saving || tierIndex === 0} aria-label={`Move Team ${team.team_number} up`} onClick={() => onMove(-1)}><ArrowUp size={16}/></button><button type="button" disabled={saving || tierIndex === tierSize - 1} aria-label={`Move Team ${team.team_number} down`} onClick={() => onMove(1)}><ArrowDown size={16}/></button></div></> : <><span className={selected ? "picklist-selected is-selected" : "picklist-selected"}>{selected && <Check size={14} aria-hidden="true"/>}<span>Selected</span></span><span className="picklist-read-tier">{categories.find((category) => category.id === currentTier)?.name ?? "Unassigned"}</span></>}</article>;
}

function restoreRankingState(state: Change["before_state"]): Partial<RankingChange> | null {
  if (!state) return null; const restored: Partial<RankingChange> = {};
  if (typeof state.rank === "number") restored.rank = state.rank;
  if (typeof state.category_id === "string" || state.category_id === null) restored.category_id = state.category_id;
  if (typeof state.note === "string") restored.note = state.note;
  if (typeof state.selected === "boolean") restored.selected = state.selected;
  if (Array.isArray(state.tag_ids) && state.tag_ids.every((tagId) => typeof tagId === "string")) restored.tag_ids = state.tag_ids;
  return Object.keys(restored).length ? restored : null;
}

function RevisionCard({ revision, categories, tags, positions, canRestore, restoring, onRestore }: { revision: Revision; categories: Category[]; tags: PicklistTag[]; positions: Map<string, ChangePositions>; canRestore: boolean; restoring: boolean; onRestore: () => void }) {
  const teamCount = new Set(revision.changes.map((change) => change.team_id)).size;
  return <article className="picklist-revision"><div className="picklist-revision-head"><div><strong>{revision.changes.length} {revision.changes.length === 1 ? "edit" : "edits"} · {teamCount} {teamCount === 1 ? "team" : "teams"}</strong><span>{revision.editor} · <LocalDateTime value={revision.createdAt}/>{revision.oldestAt !== revision.createdAt && <> · began <LocalDateTime value={revision.oldestAt} format="time"/></>}</span></div>{canRestore && <button type="button" className="picklist-undo-button" disabled={restoring} onClick={onRestore}><RotateCcw size={13} aria-hidden="true"/>{restoring ? "Restoring…" : "Restore version"}</button>}</div><details className="picklist-revision-details"><summary>{revision.changes.length === 1 ? "View edit" : `View ${revision.changes.length} edits`}</summary><div>{revision.changes.map((change) => <ChangeRow key={change.id} change={change} categories={categories} tags={tags} positions={positions.get(change.id)}/>)}</div></details></article>;
}

function ChangeRow({ change, categories, tags, positions }: { change: Change; categories: Category[]; tags: PicklistTag[]; positions?: ChangePositions }) {
  const before = change.before_state ?? {}; const after = change.after_state ?? {}; const category = (id: unknown) => typeof id === "string" ? categories.find((item) => item.id === id)?.name ?? "Unsorted" : "Unsorted";
  const placement = (position: TierPosition) => `${category(position.categoryId)} #${position.position}`;
  const moved = positions && (before.rank !== after.rank || before.category_id !== after.category_id) ? before.category_id !== after.category_id ? `Moved from ${placement(positions.before)} to ${placement(positions.after)}` : positions.before.position !== positions.after.position ? `Order in ${category(positions.after.categoryId)}: #${positions.before.position} → #${positions.after.position}` : `Order updated in ${placement(positions.after)}` : null;
  const beforeTagIds = Array.isArray(before.tag_ids) ? before.tag_ids.filter((id): id is string => typeof id === "string") : [];
  const afterTagIds = Array.isArray(after.tag_ids) ? after.tag_ids.filter((id): id is string => typeof id === "string") : [];
  const addedTags = afterTagIds.filter((id) => !beforeTagIds.includes(id)).map((id) => tags.find((tag) => tag.id === id)?.name).filter((name): name is string => Boolean(name));
  const removedTags = beforeTagIds.filter((id) => !afterTagIds.includes(id)).map((id) => tags.find((tag) => tag.id === id)?.name).filter((name): name is string => Boolean(name));
  const tagChange = [...(addedTags.length ? [`Added tag${addedTags.length === 1 ? "" : "s"}: ${addedTags.join(", ")}`] : []), ...(removedTags.length ? [`Removed tag${removedTags.length === 1 ? "" : "s"}: ${removedTags.join(", ")}`] : [])].join(" · ");
  const details = change.action === "baseline" ? positions ? `Initial placement: ${placement(positions.after)}` : "Adopted as the initial shared ranking" : change.action === "created" ? positions ? `Added to ${placement(positions.after)}` : `Added to ${category(after.category_id)}` : [moved, before.note !== after.note && "Updated note", before.selected !== after.selected && (after.selected ? "Marked selected" : "Marked not selected"), tagChange].filter(Boolean).join(" · ") || "Updated shared ranking";
  return <div className="picklist-activity-row"><div><strong>{change.teams ? `${change.teams.team_number} · ${change.teams.name}` : "Team"}</strong><span>{details}</span></div></div>;
}
