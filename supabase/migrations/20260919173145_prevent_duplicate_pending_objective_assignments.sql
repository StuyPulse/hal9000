-- A submitted report is historical evidence and may coexist with another
-- submitted report. Pending objective work, however, must be owned by exactly
-- one scout for each match/team slot.
create unique index scouting_assignments_one_pending_objective_per_team_idx
on public.scouting_assignments (match_id, team_id)
where assignment_type = 'objective' and status = 'pending';
