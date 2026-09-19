-- Administrators can intentionally add multiple scouts to the same match/team
-- assignment. The UI labels this explicitly; existing submitted reports remain
-- protected by the application flow.
drop index public.scouting_assignments_one_pending_objective_per_team_idx;
