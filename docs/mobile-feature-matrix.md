# HAL9000 mobile feature matrix

Source of truth: the website in `apps/web/src`, `packages/shared`, and `supabase/migrations` as of branch `codex/native-mobile` (cut from `bf8a511`). Everything below was read from those files, not from the plan prose in `AGENTS.md` or `docs/*.md`. Paths are relative to the repo root; `L` numbers are line numbers in the file at the time of writing.

Status vocabulary for the "Native" column is feasibility, not progress:

| Tag | Meaning |
| --- | --- |
| **Direct** | Existing RLS lets an authenticated user JWT with the publishable key do it. No server work. |
| **Direct (role)** | Direct, but only for the roles RLS allows. Other roles see it read-only or hidden. |
| **Server gap** | The website does it through a Next server action using the service-role key. There is no RLS path for the same user, so native cannot do it without a new RPC/Edge Function. |
| **Web-only** | Needs a secret (TBA key, Auth admin API) or is administration better left on the web. |

Implementation progress is tracked separately in the table at the end of this document.

---

## 1. Top blockers and decisions

These change what native can honestly ship. Detail is in sections 2-4.

1. **Editing, deleting and relaying submitted reports has no RLS path for ordinary scouts.** On `scouting_entries`, an author can update only while `status = 'draft'`, and no author delete policy exists. The website bypasses this with service-role server actions (`apps/web/src/app/scout/match/[matchId]/actions.ts`, `scout/manual/actions.ts`, `lib/admin/submissions.ts`). Native editing of submitted reports, delete-and-reopen-assignment, and Master upload on behalf of another scout all need server support or must be shipped as read-only/pending.
2. **The two most important `scouting_entries` policies are not in the repo.** `members and admins insert scouting entries` and `authors and admins update scouting entries` are dropped and recreated by `20260912064730_add_prescout_assignments.sql` and `20260912064221_fold_global_scout_policies.sql`, but nothing in `supabase/migrations` ever creates them. The hosted database was changed out-of-band. The behaviour in this document is inferred from the recreated definitions. It must be verified against the hosted project before any claim about direct upload is made.
3. **`form_definitions` is vestigial.** Nothing reads it for scouting. The match form (`rebuilt-match-form.tsx`) and the pit/pre-scout form (`scout/manual/manual-scouting.tsx`) are hard-coded. `AGENTS.md`'s promise that "admins edit forms between events without a redeploy" is not true of the current source. Native must implement v4 match and v2 pit/pre-scout forms natively. See conflict C2.
4. **The shared package is badly stale.** `packages/shared/src/database.types.ts` has 11 tables and none of `scouting_entries`, `pit_photos`, `shared_picklist_rankings`, `picklist_*`, `match_report_sources`, `event_global_documents`, `strategy_drawings`, `prescout_assignments`, `authorized_emails`, and omits many columns on `events`, `matches`, `event_teams`, `organization_role` (`global_scout`). `packages/shared/src/index.ts` still models `match_submissions` and a counter/select/rating form with no relation to v4. Typed contracts for native must be written fresh (or the shared types regenerated, which is a change to hosted-schema-derived code the human has not asked for).
5. **Auth: allowlist cannot be pre-checked from a device.** The website checks `@stuypulse.com` or `authorized_emails` (service role) before `signInWithPassword`/`signUp`. `authorized_emails` is readable only by the three email-access managers. On native, sign-in of existing accounts works directly; new-account creation is enforced by the `auth.users` BEFORE INSERT trigger and surfaces as an error (code `22023`). Google OAuth on native needs a redirect URL (custom scheme / universal link) added to the Supabase Auth allow list, which is hosted configuration the human must do.
6. **TBA rank / OPR / W-L-T need the TBA key, which is server-only.** The website fetches them in server components via `lib/tba-event-stats.ts`. Neither the key nor an API proxy is available to a device. What the database does hold (per-match scores, `tba_score_breakdown`, `status`) is enough to compute W-L-T, official fuel averages, and climb statistics locally. Rank and OPR are not derivable. See section 6.
7. **Live schedule refresh does not need the device.** `POST /api/live-event/sync` authenticates with the cookie session and cannot be called with a bearer JWT. It does not need to be: a pg_cron job (`wildcard-pulse-live-event-sync`, referenced by `20261010142716_repair_tba_schedule_sync.sql`, created out-of-band) calls the same sync once a minute. Native should read `matches` and subscribe via Realtime, but note that no migration adds `matches` or `events` to the `supabase_realtime` publication (see risk R9).

---

## 2. Stale plan-vs-source conflicts

| # | Plan / doc says | Current source says | Where | Consequence for native |
| --- | --- | --- | --- | --- |
| C1 | Submissions live in `match_submissions` (`AGENTS.md` Phase 1 data model, `docs/data-model.md:12-17`, `docs/architecture.md:13`); QR payload has `submissionId`, `match`, `team`, `revision`. | All current reports are `scouting_entries` (`entry_type` in `match`, `pit`, `pre_scout`). `match_submissions` is legacy: `assignment_id NOT NULL`, `UNIQUE(assignment_id)`, a `revision` column, and statuses draft/submitted. The only code that writes it is the dead `scout/match/[matchId]/scout-form.tsx` (no importers). Admin code still counts `match_submissions` when protecting deletes/clears. | `20260826071949_active_event_and_scouting_entries.sql`; `20260906041940_align_scouting_forms_and_global_documents.sql` deleted all old match entries | Use `scouting_entries` only. Do not write `match_submissions`. Read it nowhere except to mirror the web's "protected" checks in admin if admin is ever built. |
| C2 | Forms are versioned JSON in `form_definitions.schema_json`, editable without redeploy; mobile renders them dynamically. | Match form v4 and pit/pre-scout v2 are TSX constants. `form_definitions` is written by the admin "Form builder" (`lib/admin/members-forms.ts:9-11`) and read only to list it (`app/admin/forms/page.tsx`). It holds a `DEFAULT_2026_FORM` of counter/select/rating fields that no scout screen uses. | grep of `form_definitions` in `apps/web/src` | Implement the three native forms as typed components mirroring the web. Treat `form_version` 4 / 2 as constants. If dynamic forms are wanted later that is a new feature on both platforms, not parity. |
| C3 | Match form fields: `auto_fuel`, `auto_mobility`, `teleop_fuel`, `collection`, `defense` (rating), `notes`. | v4 payload is `auto{shoot,ferry}`, `teleop{shoot,ferry}`, `starting_spot`, `no_show`, `fouls`, `defense`, `defense_level` 1-10, `defended_teams[]`, `robot_broke`, `breakage_issues[]`, `comments`, `manual_match`, `report_source` (section 4.1). `auto_fuel`/`teleop_fuel` are retained as compatibility totals equal to shoot+ferry. | `rebuilt-match-form.tsx:141-152` | Don't use `packages/shared` `DEFAULT_2026_FORM`. Per `docs/mobile-design/CLAUDE-ADVICE.md`, collection/climb fields in the design demo were already identified as wrong. |
| C4 | Pit/pre-scout are "future" generic forms. | Pit has 16 string fields incl. drivetrain dimensions, weight, hopper capacity, traversal CSV, offseason, SVG auto-path drawing. Pre-scout has `average_pieces` + 7 free-text fields. `form_version` 2. All payload values are strings. | `scout/manual/manual-scouting.tsx:15-23,35-75,106` | Section 4.2-4.3. The drawing needs a native canvas that emits the same SVG. |
| C5 | Photos: private `scouting-photos` bucket, `submission_photos` table keyed to a submission, signed URLs. | Live photos use bucket `pit-photos` and table `pit_photos(organization_id,event_id,team_id,storage_path,uploaded_by)`. They are keyed to a team and event, not a report. `scouting-photos`/`submission_photos` are legacy and unused by current code. | `20260826072914_add_pit_photo_storage.sql`; `20260826102449_add_pit_photo_records.sql`; `components/pit-photo-upload.tsx:73-75`; `team page L64-67` | Section 5 (photos). Photos are not part of a report's identity or relay. |
| C6 | Auth: `@stuypulse.com` domain only. | Domain OR a row in `public.authorized_emails` (managed in-app by three named users via `/admin/email-access`). Hard-coded list of three managers lives in `private.email_access_managers`. Enforced at user creation by trigger `enforce_stuypulse_email_before_user_creation`; also pre-checked server-side on every web sign-in/up/reset. | `20261011164140_dashboard_email_access.sql`; `lib/auth/*` | Section 5 (auth). Native cannot replicate the pre-check; it must tolerate trigger errors. |
| C7 | Roles: admin, scout, strategist, master, developer. | Adds `global_scout` (`20260912063957_add_global_scout_role.sql`). A single `organization_members` row per user is assumed (`viewer-context.ts:22-27` uses `.limit(1).maybeSingle()`). The role editor UI lists scout, global_scout, strategist, master, admin; it omits `developer`. | `lib/viewer-context.ts`; `components/admin-forms.tsx MemberRoleEditor` | Section 3. Native must model six roles and single-org membership. |
| C8 | "Strategists can read event data but cannot alter raw submissions." "A scout can view only events/assignments they belong to." | Strategist cannot update match entries (true) but **can** edit pit reports (any member can, `20260919174523`). Any member can read every `scouting_entries` row in the org (SELECT policy is `is_organization_member`), including other scouts' drafts. Events visible to a scout are only the active event plus any with assignments. | `20260826071949`; `20260829144313_allow_members_to_read_active_event.sql` | Section 3. Do not rely on local role checks for secrecy; RLS is open for reads. |
| C9 | Picklist: "personal/tiered" (initial design); first migration's `picklist_rankings`. | One shared board per event: `shared_picklist_rankings` + `picklist_categories` (tiers) + `picklist_tags` + `picklist_change_log`. Personal `picklist_rankings` was dropped. Tiers were forced to ELITE/GOOD/MID/MEH/SNS/DNP on first migration but the UI still lets editors add/remove/reorder tiers. | `20260906064907_make_picklist_universal.sql`; `...065443_remove_legacy_personal_picklists.sql`; `...072259_standardize_picklist_tiers.sql`; `...180751_add_picklist_tags.sql` | Section 4.8. The `picklist_categories.name` uniqueness is per org, not per event. |
| C10 | "Edit" permissions: strategists/admins/scouts per role table. | Web edit rules differ per type and differ from RLS. See table in 4.9. Notably: web lets owner or admin/developer edit match & pre-scout; any member edit pit; but RLS also lets `global_scout` update any entry and the web action does not. | `scout/*/actions.ts`; `20260912064221`; `20260919174523` | Mirror the web rule, but expect a global_scout to succeed directly where the web refuses. Decide which to follow. |
| C11 | `AGENTS.md` mobile section: local `revision` column, QR payload `revision`. | `scouting_entries` has no `revision` column. `updated_at` is trigger-maintained. A "correction" is an in-place update. | `20260826071949` | `revision` exists only locally. See R2. |
| C12 | Web is "online-first" Phase 1 with offline later. | Web already ships an IndexedDB outbox (`lib/offline-scouting-queue.ts`), service worker (`public/sw.js`), schedule cache, and `/scout/offline` page. Idempotency: client UUID + `upsert onConflict id` + read-back. | `lib/offline-scouting-queue.ts`; `components/offline-support.tsx` | Native outbox should be at least this good. Section 6. |

---

## 3. Roles and gates

### 3.1 Who each role is, in practice

`organization_members.role`, one org (StuyPulse). New accounts are auto-inserted as `scout` by `handle_new_user` using `private.wildcard_configuration`.

| Capability | scout | global_scout | strategist | master | admin | developer | Web gate | RLS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Read active event schedule/teams | yes | yes | yes | yes | yes | yes | any member | `can_access_event`: active event + member, or admin/strategist/developer/global_scout any event, or assigned scout |
| Read other (non-active) events | only with an assignment there | yes | yes | no | yes | yes | n/a | same |
| Read all `scouting_entries` | yes (org-wide, incl. drafts) | yes | yes | yes | yes | yes | any member | `members read scouting entries` |
| See own assignments | yes | all assignments | all | own only | all | all | own (dashboard) | `assignments visible...` |
| Create match entry | own, any team | own or any (admin branch has no `scout_user_id` check) | own | own | own or any | own or any | any member | see 4.9 |
| Create pre-scout entry | own: assigned team OR (active event AND team in event) | any | own as member | own as member | any | any | any member of active event | see 4.9 |
| Create pit entry | own | any | own | own | any | any | any member | member |
| Update pit entry | any member | any | any | any | any | any | any member | `members update pit scouting entries` |
| Update submitted match/pre entry | no | any | no | no | any | any | owner or admin/developer | author only while draft; admin/developer/global_scout always |
| Delete any entry | no | no | no | no | yes | yes | owner or admin/developer (service role) | admin/developer only |
| Upload photos | yes | yes | yes | yes | yes | yes | any member | `pit_photos` insert: own + member; storage: own prefix |
| Read photos | yes | yes | yes | yes | yes | yes | any member | storage select: any org member (not per-event) |
| Open picklist | yes unless restricted | same | same | same | same | same | `can_view_picklist` RPC | `private.can_view_picklist` (member AND no row in `picklist_view_restrictions`) |
| Edit picklist/tiers/tags | no | **yes** | **yes** | **yes** | **yes** | **yes** | `canEdit` roles | strategist, master, admin, developer, global_scout |
| Choose per-match report source (timeline) | no | no | no | no | **yes** | no (UI says admin only; RLS is admin only) | `role === "admin"` | `match_report_sources` write = admin |
| Set shared global document | no | no | **yes** | no | yes | yes | admin/strategist/developer | same |
| Edit robot profile (drivetrain/shooter) | any member (service role) | same | same | same | same | same | any member | `event_teams` write = admin/developer only |
| Draw/save strategy drawing | own | own | own | own | own | own | any member | `strategy_drawings` own rows |
| Admin: events, matches, assignments, rosters, users | no | no | no | no | yes | yes | `admin/developer` | `can_manage_event` / `has_organization_role(admin,developer)` |
| Email access manager | only three hard-coded user IDs, regardless of role | | | | | | `rpc can_manage_email_access` | `private.email_access_managers` |

### 3.2 Role resolution on native

Mirror `getViewerContext` (`lib/viewer-context.ts:16-46`):

1. `auth.getUser()` / session `sub`.
2. `organization_members` where `user_id = sub`, `limit 1` -> `{organization_id, role}`.
3. `events` where `organization_id = org` and `status = 'active'` -> active event (`id,event_key,name,status`). The partial unique index `events_one_active_per_organization` guarantees at most one.
4. Account with no membership: show the "almost ready" state (`dashboard/page.tsx:24`), not an error.

Never trust role from JWT claims or user metadata (AGENTS.md; also `roles-and-security.md`).

---

## 4. Data contracts

### 4.1 Match report `entry_type = 'match'`, `form_version = 4`

Row (as written by `rebuilt-match-form.tsx:154-158`):

```
id              uuid, client-generated (see 6.1)
organization_id uuid
event_id        uuid
team_id         uuid                     team being scouted
match_id        uuid | null              null for manual reports
assignment_id   uuid | null              set when opened from an assignment card
scout_user_id   uuid                     must equal auth.uid() for non-privileged roles
entry_type      'match'
form_version    4
payload         jsonb (below)
status          'draft' | 'submitted'
submitted_at    timestamptz | null       REQUIRED when status='submitted' (CHECK)
```

Payload (exact keys, `rebuilt-match-form.tsx:141-152`):

| Key | Type | Semantics |
| --- | --- | --- |
| `no_show` | boolean | Robot didn't play. When true: scoring zeroed, `starting_spot` null, fouls 0, defense false, `robot_broke` false, `breakage_issues` []. Comments remain editable. |
| `no_show_reason` | `"No show"` \| null | Set only when `no_show`. |
| `starting_spot` | string \| null | One of `depot`, `depot-bump`, `hub`, `outpost-bump`, `outpost`, `depot-trench`, `outpost-trench`. DB CHECK also allows legacy `line-1`, `line-2`. |
| `starting_spot_confirmed` | boolean | `!no_show && spot != null`. |
| `auto` | `{shoot:int>=0, ferry:int>=0}` | **Scored** = fuel scored into the HUB; **Ferried** = fuel moved to a partner/zone, not scored. Both are first-class; stats keep them separate. |
| `teleop` | `{shoot, ferry}` | Same. |
| `auto_fuel` | int | Compatibility total = `auto.shoot + auto.ferry` (0 if no_show). Stats read `auto.shoot ?? auto_fuel`; do not treat as "scored". |
| `teleop_fuel` | int | Same for teleop. |
| `fouls` | int>=0 | Counter, step 1. |
| `defense` | boolean | "Played defense". |
| `defense_level` | int 1-10 \| null | Slider default 5; null when `defense` false. |
| `defended_teams` | uuid[] (team ids) | Up to 3. Scheduled match: candidates are the **opposing alliance** (`scout/match/[matchId]/page.tsx:29`). Manual: all event teams except the scouted team, or the opposing alliance when the manual report resolves to a scheduled slot (`scout/match/manual/page.tsx:69-76`). [] when not `defense`. |
| `robot_broke` | boolean | |
| `breakage_issues` | `{timestamp:string\|null, issue:string\|null}[]` | Repeatable. `issue` is one of `Intake broke`, `Shooter broke`, `Drive issue`, `Electrical`, `Other`; "Other" is stored as the free text (or the literal `"Other"` if blank). `timestamp` is `M:SS` (match clock), minute 1 digit, seconds 00-59, optional. Entries with neither field are dropped. DB CHECK: must be an array. |
| `break_timestamp`, `break_tag` | string \| null | Legacy mirrors of `breakage_issues[0]`. Keep writing them (the Slack notifier, older readers). |
| `comments` | string | Free text; always present (may be ""). |
| `report_source` | `"manual"` \| `"scheduled"` | `"manual"` if opened as manual or the loaded payload already had `manual_match`. |
| `manual_match` | `{stage, label, alliance}` \| null | `stage` is the display label (`Qualification`, `Practice`, `Quarterfinal`, `Semifinal`, `Final`, `Other / exception`). `label` is the match number text or null; required (non-empty) for any stage but "Other". `alliance` is `red`/`blue`. Absent for scheduled reports. Preserved if an existing manual report is edited from the scheduled view. |

DB CHECKs that can reject a native write (`20260906041940`, `20260914024556`): payload must not contain key `shifts` or `climb`; `starting_spot` must be in the list above; `breakage_issues` must be an array; `status='submitted'` requires `submitted_at`.

Side effects fired server-side on submit (do not duplicate on device):
- `complete_matching_scout_assignments` trigger marks the matching `scouting_assignments` row (same match, team, scout) complete. **Native must not update assignment status itself** (the legacy `scout-form.tsx` did; current form does not).
- `auto_link_submitted_manual_match_report` links `match_id` when stage + numeric label identify exactly one scheduled match. Local copies can go stale on `match_id`; reconcile on pull.
- `queue_slack_breakage_notification` posts to Slack via `pg_net` when `robot_broke` becomes submitted. See R6.

UI structure to mirror (`rebuilt-match-form.tsx`): manual details (manual only) -> no-show toggle + field-mirror toggle -> starting-position field map (7 spots, rotated for blue, optional mirror) -> scoring table (Autonomous/Teleop x Scored/Ferried; MiniCounter steps of **10**, plus direct numeric entry) -> fouls (step 1) -> defense (toggle, level slider, up to 3 teams) -> breakage (repeatable issues) -> comments -> Save draft / Submit. Manual edit also allows changing the team (`manualTeams` picker) which re-derives scheduled linkage.

### 4.2 Pit report `entry_type = 'pit'`, `form_version = 2`

All values are strings (`Payload = Record<string,string>`, `manual-scouting.tsx:13,81-83`). Bounds from `PitFields` (L35-75):

| Key | Input | Notes |
| --- | --- | --- |
| `driver_experience` | select `0`,`1`,`2`,`3`,`4+` (years) | |
| `operator_experience` | select `none` (No operator), `0`-`3`, `4+` | |
| `contact_info` | text | Include role (student/mentor/coach). |
| `drivetrain_length`, `drivetrain_width` | number 0-55 in, step 0.5 | Stored as strings. |
| `dimensions` | derived string | `"{L} in × {W} in ({2(L+W)} in perimeter)"`; recomputed on every dimension change. |
| `robot_weight` | int 0-135 lb | |
| `hopper_capacity` | int 0-500, step 10 | |
| `teleop_active_hub`, `teleop_inactive_hub` | text | Strategy per HUB state. |
| `offseason` | text | Drive-team plans. |
| `scoring_area` | text | Preferred scoring area. |
| `traversal` | CSV of `bump`,`trench` | e.g. `"bump,trench"`; empty = none. |
| `comments` | text | |
| `auto_routines_drawing` | SVG string | viewBox `0 0 1380 674`; <=12 strokes, <=600 points/stroke, min point spacing 5; 4 pens (#ef4444 red, #2563eb blue, #22c55e green, #111827 black); width 7; per-stroke linear gradient from opacity 0.4 to 1 along the stroke; strokes of <2 points dropped (`components/auto-path-drawer.tsx`). Rendered on submissions via data-URI `<img>`. |
| `auto_routines_notes` | text | |

Perimeter > 110 in shows a warning but is not blocking. Pit forms are team-keyed; the form resets to a new blank report with a new UUID after each submit (L94-99).

Team picker highlights teams with a submitted pit report (`markedTeamIds`).

### 4.3 Pre-scout report `entry_type = 'pre_scout'`, `form_version = 2`

String payload. Fields (`manual-scouting.tsx:15-23,126`): `average_pieces` (digits only, <=3; DB CHECK `^[0-9]{1,3}$`), `autos`, `active_shift`, `inactive_shift`, `traversal` (free text here, **not** CSV), `with_them`, `against_them`, `notes`.

`scout_user_id` is the author. `team_id` selects the target.

### 4.4 Tables native will touch

Columns listed are the ones used by current code. All tables have RLS; reads below are under the signed-in user.

| Table | Used for | Key columns | Read policy | Write policy (native-relevant) | Realtime |
| --- | --- | --- | --- | --- | --- |
| `organizations` | org name | id,name | member | admin/developer update | no |
| `organization_members` | role resolution; admin user list | organization_id,user_id,role | teammates | admin/developer all; trigger blocks removing last admin | no |
| `profiles` | scout names | id,display_name,first_name,last_name | teammates (`shares_organization`) | self | no |
| `events` | event list, active event, remaps | id,organization_id,name,event_key,starts_at,ends_at,status,is_manual,tba_team_remaps,tba_last_synced_at,tba_last_live_synced_at | `can_access_event` | admin/developer all | **not in publication** |
| `teams` | team directory | id,organization_id,team_number,name | via event_teams or admin/strategist/developer | admin/developer | no |
| `event_teams` | roster + robot profile | event_id,team_id,is_manual,drivetrain_type,shooter_type | `can_access_event` | admin/developer only | yes |
| `matches` | schedule + official scores | id,event_id,tba_match_key,match_number,match_type,red_teams[],blue_teams[],scheduled_at,actual_at,status,red_score,blue_score,tba_score_breakdown | `can_access_event` | admin/developer | **not in publication** |
| `scouting_assignments` | my queue; admin board | id,match_id,team_id,scout_user_id,assignment_type,status,created_at,completed_at | own / managers / strategist / global_scout | admin/developer; own update to complete only if a `match_submissions` row exists (legacy; not used) | no |
| `prescout_assignments` | coordination metadata | event_id,team_id,scout_user_id | own / managers / global_scout | admin/developer insert+delete | no |
| `scouting_entries` | all reports | see 4.1-4.3 plus `created_at,updated_at,last_edited_by` | any org member | see 4.9 | yes |
| `match_report_sources` | admin's chosen report per match/team | event_id,team_id,match_key,selected_entry_id | member | admin only | yes |
| `pit_photos` | photo records | id,organization_id,event_id,team_id,storage_path (unique),uploaded_by,created_at | member | insert: own + member. **No update/delete policy.** | yes |
| `shared_picklist_rankings` | the board | id,organization_id,event_id,team_id,category_id,rank,note,selected,tag_ids[],created_by,updated_by,updated_at; `UNIQUE(event_id,team_id)` | `can_view_picklist` | insert/update/delete: strategist, master, admin, developer, global_scout; `updated_by` must equal uid; `tag_ids` validated | yes |
| `picklist_categories` | tiers | id,organization_id,name,color,sort_order,created_by | `can_view_picklist` | same editor set; delete also by creator | yes |
| `picklist_tags` | tags | id,organization_id,name,color,sort_order,created_by | `can_view_picklist` | same editor set | yes |
| `picklist_change_log` | history | id,event_id,team_id,actor_user_id,action,before_state,after_state,created_at | `can_view_picklist` | trigger only | yes |
| `picklist_view_restrictions` | per-user block | organization_id,user_id | admin/developer | admin/developer | no |
| `event_global_documents` | shared Google doc link | event_id,organization_id,document_url,updated_by | `can_access_event` | admin/strategist/developer | yes |
| `strategy_drawings` | personal match-strategy strokes | event_id,user_id,strokes[] | own | own, `UNIQUE(event_id,user_id)` | no |
| `form_definitions` | vestigial | organization_id,name,version,schema_json,is_active,form_type | member | admin/developer insert | no |
| `scout_assignment_rosters`, `scout_assignment_roster_members` | assignment generation | | admin/developer | admin/developer | no |
| `authorized_emails` | allowlist | email,created_by | email-access managers | managers insert | no |
| `assignment_clear_snapshots` | undo for "clear assignments" | | **revoked from authenticated** | server only | no |
| `breakage_slack_notifications` | Slack outbox | | **revoked from authenticated** | trigger only | no |

RPCs callable by `authenticated`: `can_view_picklist(target_organization)`, `can_manage_email_access()`. Not callable: `reconcile_manual_match_reports`, `verify_live_sync_trigger` (service role only).

Storage: bucket `pit-photos` (private, 10 MB limit, mime: jpeg, png, webp, heic, heif, avif, gif). Policies: select for any org member; insert only to path prefix `{auth.uid()}/`; update own prefix. **No delete policy.** Legacy bucket `scouting-photos` is unused.

### 4.5 Identity labelling rules native must reproduce

- **Match label** (`lib/match-label.ts:70-90`): derive from `tba_match_key` suffix: `_qmN` Qualification N, `_pmN` Practice N, `_qfSmM` "Quarterfinal S · Match M", `_sfSmM` Semifinal, `_fSmM` "Final M", `_efSmM` Tiebreaker M; fall back to `match_type` + `match_number` ("Playoff Match N"). Manual local matches use key `manual_{uuid}`.
- **Ordering** (`compareMatchesChronologically`): round order practice 0, qualification 1, qf 2, sf 3, f 4, ef 5; then set, then match number.
- **Team display number** (`lib/tba-team-identity.ts`): `events.tba_team_remaps` maps `frc{real}` -> alias key (`frc254B`); display `254B`, but ids and links use the permanent `teams.team_number`. Search must match both. `eventTeamNumberFromInput`: purely numeric -> permanent number; digits+letters -> look up alias.
- **Manual match key** for stats/sources (`scouting-stats.ts:68-80`, mirrored in `validate_match_report_source`): `scheduled:{match_id}` > `manual:{stage lower}:{label lower}` > `report:{entry_id}`. The server trigger and client must agree character-for-character; `match_report_sources.match_key` stores it.

### 4.6 Derived statistics (strategist screens)

`lib/scouting-stats.ts` is pure and portable; native should copy its logic verbatim and keep its tests (`scouting-stats.test.ts`, `timeline-ferry.test.ts`, `manual-match-result.test.ts`, `tba-matches.test.ts`).

1. Only `status='submitted'` match entries.
2. Competitive filter (`isCompetitiveMatchEntry`): linked match -> type qualification/playoff; manual -> stage in qualification/quarterfinal/semifinal/final/playoff. Practice excluded except on the strategy page when a team has not yet played a qualification (`practiceMatchEntries`).
3. `selectedMatchReportEntries` applies admin-chosen sources (`match_report_sources`); default is combine.
4. Group reports per match key and average within a match (so heavily scouted matches don't outweigh others); `broken` is OR across reports.
5. Metrics: per-match autoScored/Ferried, teleopScored/Ferried, fouls, defense (`defense_level`, 0 if none), broken; team stats = max/avg across matches; `brokenPercent`, `totalFuel = avg(auto scored)+avg(teleop scored)`, `peakFuel = max(auto+teleop scored)`. **Ferried never counts toward fuel totals.**
6. Official fuel (`official-fuel-stats.ts`): alliance `hubScore.totalCount/autoCount/teleopCount` from `tba_score_breakdown[red|blue]`, averaged over played matches the team was in.
7. Climb (`tba-event-stats.ts:217-236`): per played match, slot index `i` in the alliance array -> `autoTowerRobot{i}` / `endGameTowerRobot{i}`; most common value and non-`None` percentage.
8. Heat colouring (`summary-table.tsx:28-30`): red-yellow-green by min/median/max per column; reversed for `% broken`.

---

## 5. Feature inventory

Columns: **Web** = route and primary source; **Data** = tables; **Gate** = role gate; **Native** = feasibility tag; **Screen** = recommended native screen. A "Delta" note appears where behaviour is subtle.

### 5.1 Auth, session and shell

| ID | Feature | Web | Data | Gate | Native | Screen / notes |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Email + password sign in | `/auth/login` `login/actions.ts:23-30` | auth | public | Direct | Sign-in. Do not copy the pre-check; show generic failure like the web ("We couldn't sign you in with those details."). |
| A2 | Sign up with first/last name | `login/actions.ts:32-41` | auth, `profiles` | allowlist trigger | Direct (error-tolerant) | Pass `data:{first_name,last_name,display_name}` in `signUp` options; handle `identities.length===0` (account exists, `existingAccountMessage` looks it up with the Auth admin API, which native cannot; show the generic "check your email or sign in" copy). Needs confirm-email deep link redirect. |
| A3 | Google OAuth | `login-form.tsx:19-24`, `auth/callback/route.ts` | auth | public | Direct + **hosted config** | PKCE with native redirect URI; redirect URI must be added to the Supabase Auth allow list. Web additionally signs out unauthorised Google users post-exchange (`callback L17-21`). Native can only rely on the creation trigger. |
| A4 | Password reset | `login/actions.ts:43-51`; `/auth/reset-password` | auth | public | Direct + **hosted config** | Reset link must open the app (deep link) and call `updateUser({password})`. |
| A5 | Sign out; clear private caches | `sign-out-button.tsx` | | | Direct | Settings. Must also purge local outbox rows? No: scope local rows by user/org per `apps/mobile/AGENTS.md`; sign-out must not delete unsent reports, but they must be invisible to a different account. |
| A6 | Viewer context + active event chip | `lib/viewer-context.ts`; `app-shell.tsx` | members, events | all | Direct | App shell header. Admin/developer chip links to event chooser. |
| A7 | Global search (teams + events) | `components/global-search.tsx`, `lib/navigation-data.ts` | event_teams, events (service role cache) | all | Direct (re-implement) | The web index uses a service-role cache over **all** org events. Under RLS a scout sees only active/assigned events. Search only what RLS returns. |
| A8 | Unauthorised/inactive account states | `dashboard/page.tsx:24` | | | Direct | "Almost ready" screen for no membership; "No active event" screens (`scout/*/page.tsx`). |
| A9 | Privacy/terms | `/privacy`, `/terms` | | | Direct | Settings -> About; open web URLs. |

### 5.2 Scout workflow

| ID | Feature | Web | Data | Gate | Native | Screen / notes |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | My assignments (home) | `/dashboard` `dashboard/page.tsx:9-26` | `scouting_assignments` joined to `matches!inner`, `teams`; `scouting_entries` count | member | Direct | **Today/Assignments**. Query: `scout_user_id = me`, `matches.event_id = active`, `status != 'complete'`, newest created first. Shows label + display number + team name + assignment type + status. Counter "Submissions received" = count of `scouting_entries` with `status='submitted'` in the active event (all entry types). Admin-only "Sync status: Online" tile is cosmetic. |
| S2 | Scheduled match scout picker | `/scout/match` `match-scout-picker.tsx` | matches, event_teams | member | Direct | **Schedule -> Match detail -> choose robot (red/blue lists)**. Search matches by label, number, participant team numbers/names. **Ordering delta:** unplayed first; a played match drops to the bottom only 5 minutes after the client first sees it as `played` (`playedMatchDelayMs`, observed-at tracking; initial load treats already-played as past). |
| S3 | Scheduled match form v4 | `/scout/match/[matchId]?team=&assignment=` `page.tsx`, `rebuilt-match-form.tsx` | scouting_entries | member | Direct (create); see 4.9 for edit | **Match entry**. Allowed team must be on the match roster; `assignment` param is honoured only if the assignment belongs to me for this match. Alliance colour drives field-map rotation and "opposing teams" list. |
| S4 | Manual match picker + form | `/scout/match#manual`, `/scout/match/manual` `manual-match-picker.tsx`, `manual/page.tsx` | event_teams, matches | member | Direct | Manual report: stage, match #, alliance, team. Required: team, alliance, and match number unless stage is Other. The server page tries to link to a scheduled match when stage maps to a type (`qualification`/`practice`/playoff) and the numeric label + team uniquely match **one** scheduled match; if matched, `match_id` is set client-side and defended-team candidates become the opposing alliance. Otherwise `match_id` null; DB trigger may link later (official keys `_qm`/`_pm`/`_qf..m1`/`_sf..m1`/`_f1m`). |
| S5 | Draft save / resume | `rebuilt-match-form.tsx:122-188` | scouting_entries | | Direct | Draft is a server row (visible to other members). The id is reused per `assignment_id` or `match:team` key via `localStorage` (L104-113) so a retried/reopened form updates the same row. After a successful submit (or edit) the web hard-navigates to refresh server components. Resume only works on the same browser profile; there is no "my drafts" list. |
| S6 | Offline outbox + retry | `lib/offline-scouting-queue.ts`, `components/offline-support.tsx`, `/scout/offline` `offline-queue-panel.tsx` | scouting_entries | | Direct | **Outbox**. Web behaviour to match or exceed: save locally on any transient failure; 8 s upload timeout; transient classification by message regex; read-back by id on error to detect a write whose response was lost; after any success `last-successful-sync` timestamp; auto-sync on `online`; download of queued JSON in the panel. |
| S7 | Pit scouting form | `/scout/pit` `pit-scouting-tabs.tsx`, `manual-scouting.tsx` | scouting_entries, event_teams | member | Direct (create, edit) | **Pit form** (section 4.2). Team picker marks teams that already have a submitted pit report. |
| S8 | Pit photos + coverage | same, `components/pit-photo-upload.tsx` | pit_photos, storage | member | Direct | **Photos & coverage**. Photo constraints: source <=25 MB, **compress** to max edge 1920 px WebP q0.82 (skip if not smaller, skip GIF), final <=10 MB, `image/*` only. Path `{uid}/{eventId}/{teamId}/{uuid}-{sanitised-name}`; record insert then, on failure, remove the object (the removal fails silently: no storage delete policy; see R8). Coverage = teams with >=1 `pit_photos` row; tap a missing team to jump to upload. |
| S9 | Pre-scout form | `/scout/pre-scout` `pre-scout/page.tsx` | scouting_entries | member (see RLS) | Direct (create) | **Pre-scout** (4.3). **Delta:** RLS restricts plain scouts to teams that are assigned to them OR in the active event; admin/developer/global_scout any. Web page uses a service-role client to list **all** event teams even for restricted users. The team marked "submitted" indicator is computed from all members' reports. |
| S10 | Global scouting document | `/scout/global` `global-document.tsx`, `global/actions.ts` | event_global_documents | read: member; write: admin/strategist/developer | Direct (role) | **Global doc**. Opens/embeds the Google link. URL validation: `https`, host `docs.google.com`, path `/(document|spreadsheets|presentation)/(u/N/)?d/{id}`; DB CHECK matches. Embed uses the same URL with `/edit|/view` -> `/preview`, no query/hash. On native use `WebView` for display or "Open in browser"; Google may refuse embedding. |
| S11 | Forms hub | `/scout/manual` `scout/manual/page.tsx` | | member | Direct | Entry points: Match / Pre / Pit / Global + photo upload. |
| S12 | Own submissions list/detail | `/submissions`, `/submissions/[entryId]` | scouting_entries, profiles, matches, teams | member read all | Direct (read) | **Submissions**. Filters: event (admin/dev sees all; others see what RLS allows), scope Everyone/Just me, type tab (match/pit/pre), team, scout, match. Row: label + display number + team name + type + author + time + status tag + Edit/Delete when allowed. Detail uses `PayloadGrid` and `MatchReportSummary` field order/labels (`components/scouting-payload.tsx:5-60`). Pit "pit report submitted" markers use submitted entries across all authors. |
| S13 | Edit a report | `?edit=` routes | scouting_entries | see 4.9 | **Server gap** for plain scouts on submitted match/pre; Direct for pit and for admin/dev/global_scout | Native may allow editing only when the local copy is still unsynced or server `status='draft'`; otherwise hide Edit or route via a server endpoint. |
| S14 | Delete a report | `components/delete-submission-form.tsx`, `lib/admin/submissions.ts:8-66` | scouting_entries, scouting_assignments | owner or admin/developer | **Server gap** (owner); Direct (admin/dev, but see below) | Web also **reopens the assignment** (status->pending, completed_at null) iff no other submitted match entry by that scout for the match+team remains. Admin/dev can do both steps directly; owners cannot. |
| S15 | Leaderboard | `/leaderboard` `leaderboard-board.tsx` | scouting_entries + profiles | member | Direct | Present in code but **not in the sidebar**; reachable only by URL. Treat as optional. |
| S16 | Realtime refresh | `components/live-refresh.tsx` | | | Direct | Replace with Realtime on `scouting_entries`, `pit_photos`, `shared_picklist_rankings`, `picklist_*`, `event_global_documents`, `match_report_sources`, `event_teams` (all in publication). `matches` is **not**; poll or pull on foreground. Debounce 350 ms / 750 ms as web does. |

### 5.3 Strategist workflow

| ID | Feature | Web | Data | Gate | Native | Screen / notes |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Match schedule | `/events/[eventKey]/matches` `matches-board.tsx` | matches, event_teams | member | Direct | **Schedule**. Filters round/team/status; row: time (`scheduled_at`), label, red/blue display numbers, final score or status; links to Reports (`/submissions?match=`) and Scout. Manual-event ordering: type order then number; official events keep DB order (`scheduled_at`). |
| T2 | Team directory | `/events/[eventKey]/teams` | event_teams, teams | member | Direct | **Teams** list; sort by permanent `team_number`; display alias. Admin-only "Add team". |
| T3 | Team detail | `/events/[eventKey]/teams/[teamNumber]` | scouting_entries, match_report_sources, pit_photos, matches, event_teams, storage, TBA | member | Direct (+ TBA gap) | **Team profile**: hero photo carousel (signed URLs, 3600 s), snapshot tiles (Scouted matches, Auto scouting avg/peak scored + avg ferried, Teleop, TBA rank + record, OPR), robot profile, match timeline, research (pit + pre-scout lists). `teamNumber` in URL may be alias or permanent. TBA rank/OPR/record: see section 6. |
| T4 | Match timeline | `team-match-timeline.tsx` | matches, scouting_entries | member | Direct | Per-team scheduled + manual matches: outcome (win/loss/tie/pending; `-1` scores are "not played"), score, coverage Scouted/Missing, selectable metrics (max 4), scope toggle (all/competitive/practice), per-match report list, **admin-only** report-source picker. Chart metrics: totalFuel, autoFuel, teleopFuel, ferried, autoFerried, teleopFerried, fouls, defense, broken. TBA link `https://www.thebluealliance.com/match/{key}` for non-`manual_` keys. |
| T5 | Robot profile (drivetrain/shooter) | `team-robot-profile.tsx`, `lib/team-robot-profile-actions.ts` | event_teams | any member (service role) | **Server gap** for non-admin | Select lists: Drivetrain Unknown/Swerve/Tank; Shooter Unknown, Single Turret, Single Fixed Shooter, Double Wide Shooter, Dumper, No Shooter, Triple Wide Shooter, Dual Fixed Shooters, Double Turret. RLS lets only admin/developer. Read for all. |
| T6 | Event summary | `/events/[eventKey]/summary` `summary-table.tsx`, `pre-scout-table.tsx` | event_teams, scouting_entries, matches, TBA | member | Direct (+ TBA gap) | **Summary**. Five column groups (Summary, Performance, Auton, Teleop, Reliability); text filter; sort key + direction (default `opr` desc on server, then local default rank asc); heat colouring; mobile cards. Plus **Pre-scout sheet**: latest submitted pre-scout payload per team (autos, active/inactive HUB, traversal, average fuel, with/against). |
| T7 | Compare two teams | `/events/[eventKey]/compare` `compare-metrics.tsx` | same + `pit_photos` | member | Direct (+ TBA gap) | **Compare**. Pick A/B by number (alias OK). Five tabs; photo (newest) each; graph on non-summary tabs (`components/stats-graph.tsx`). |
| T8 | Match strategy | `/events/[eventKey]/strategy` `match-strategy-panel.tsx` | matches, event_teams, scouting_entries, match_report_sources, strategy_drawings | member | Direct | **Strategy**. Pick match (same played-delay ordering), optional manual lineup (6 numbers, aliases resolved via `resolveTeamLineup`, duplicates rejected), alliance totals (**scored** only: avg and peak), field drawing canvas with 6 colours, undo/clear/flip view, **personal** save (`upsert onConflict event_id,user_id`). Stats basis: competitive if the team has a played qualification, else practice. |
| T9 | Picklist | `/events/[eventKey]/picklist` `picklist-board.tsx` | shared_picklist_rankings, categories, tags, change_log, scouting_entries, matches, TBA | view: `can_view_picklist`; edit: strategist/master/admin/developer/global_scout | Direct (role) | **Picklist**. Tiers (reorder, add, delete -> move teams to neighbour), tags (add, delete, filter, assign), per-team note (<=2000 chars), selected flag, move up/down across tiers, drag, tier picker. Persist = `upsert onConflict (event_id,team_id)`; rank spacing 1024 with midpoint insert and renumber on collision; initial rank by OPR order. Full history (paged 1000), sessions grouped by actor within 5 minutes, "restore version" computes the board backwards from the log and upserts the diffs. |
| T10 | Admin report-source selection | `team-match-timeline.tsx:65-73` | match_report_sources | **admin only** | Direct (role) | `upsert onConflict (event_id,team_id,match_key)`; `selected_entry_id` null = combined. DB trigger validates the selection belongs to team/match. |
| T11 | Live official data | `components/live-event-sync.tsx` (30 s) | matches, events | member | Pull only | Poll or Realtime; do not call `/api/live-event/sync`. |

### 5.4 Administration (web-first)

| ID | Feature | Web | Gate | Native | Notes |
| --- | --- | --- | --- | --- | --- |
| M1 | Event list, set active, delete | `/events` `lib/admin/events-matches.ts:347-363`, `deleteEvent` | admin/developer | Direct (role) | `setActiveEvent` is two updates (deactivate then activate) under the unique partial index; no transaction. Delete is blocked when entries/photos/legacy submissions exist (web checks client-side). |
| M2 | Import event from TBA | `lib/admin/tba-import.ts` | admin/developer | **Web-only** | Needs `TBA_AUTH_KEY`. |
| M3 | Create manual event; add/remove manual team | `events-matches.ts:198-260` | admin/developer | Direct (role) | Creates `manual_{32 hex}` event key; teams created on demand as "Team N". Removal blocked by matches/reports/photos. |
| M4 | Manual/local match CRUD + scores | `matches-board.tsx`, `events-matches.ts:60-164,263-321` | admin/developer | Direct (role) | Local matches on official events are `manual_{uuid}` and never overwritten by TBA; team changes blocked once reports exist; TBA later "adopts" a unique same-round/same-teams manual match by renaming its key (`tba-matches.ts:333-365`). Scores for manual matches only (`saveManualMatchResult`). |
| M5 | Scout rosters + generate objective assignments | `lib/admin/assignments.ts:14-117` | admin/developer | Direct (role) but non-atomic | Round-robin one scout per (match, team) over the roster, skipping existing objective assignments, upsert on `(match_id,scout_user_id,team_id,assignment_type)`. Recommend web-only for first release. |
| M6 | Per-slot assign / remove; prescout assignment | `assignments.ts:198-317` | admin/developer | Direct (role) | Refuses reassign/remove when complete or a submitted report exists (checks `match_submissions` **and** `scouting_entries`). |
| M7 | Clear + undo assignments | `assignments.ts:127-196` | admin/developer | **Server gap** | `assignment_clear_snapshots` is revoked from authenticated. Web-only. |
| M8 | Users & roles, invites | `/admin/users`, `members-forms.ts` | admin/developer | role change **Direct (role)**; list emails + invite **Web-only** | Email addresses come from the Auth admin API (`auth.admin.listUsers`). Invite uses `inviteUserByEmail`. Role change is a plain update; trigger prevents removing the last `admin`. |
| M9 | Form builder | `/admin/forms` | admin/developer | Web-only | Inert (C2). |
| M10 | Email access allowlist | `/admin/email-access` | the three managers | Direct (role) | `rpc('can_manage_email_access')` then `insert into authorized_emails`. `@stuypulse.com` addresses are short-circuited; duplicate (`23505`) is success. No invitation is sent. |
| M11 | Sync page | `/admin/sync` | | redirect to `/events` | |

### 5.5 Not user features, but part of the contract

| Item | Notes |
| --- | --- |
| `/demo` | Static workspace preview for no-membership users. |
| `/teams/[teamId]` | Legacy page reading `match_submissions`; superseded by the event team page. Do not port. |
| `/scout/assignments` | Redirects to `/dashboard`. |
| PWA manifest + `sw.js` | Web only. |

---

### 4.9 Create/edit/delete rules, web vs RLS (reference)

Web insert path for a signed-in user is client-side `upsert` into `scouting_entries` with their JWT (`offline-scouting-queue.ts:131-157`). Policy bodies below are those recreated in `20260912064730` (see blocker 2).

| Operation | Plain scout (own) | global_scout | strategist / master | admin / developer |
| --- | --- | --- | --- | --- |
| INSERT match/pit | allowed if `scout_user_id=uid` and member | any | own | any `scout_user_id` |
| INSERT pre_scout | own AND (assigned to team for that event OR `can_submit_active_event_prescout`: active event and team on its roster) | any | same as scout | any |
| UPDATE own, while `draft` | yes | yes | yes | yes |
| UPDATE own, once `submitted` | **no** | yes (any entry) | no | yes (any entry) |
| UPDATE pit (any author) | yes | yes | yes | yes |
| DELETE | no | no | no | yes |

Consequences:
- A first upload of a draft or submitted report works. A **repeat** upsert of a row that is already `submitted` raises an RLS error for non-privileged users because `ON CONFLICT DO UPDATE` runs the UPDATE policy. The web masks this by reading the row back (`entryWasStored`). Native should either insert with `ignoreDuplicates` (conflict -> do nothing) and read back, or read first; it must not treat the RLS error as a failed upload.
- Updating a row from `draft` -> `submitted` is allowed (author, draft). Editing after submit is not (plain scouts).
- Web edit actions (`updateMatchScoutingEntry`, `updateManualScoutingEntry`) always send `status: "submitted"` **without** `submitted_at`. If the target row is still a draft with `submitted_at` null, the `submitted_at` CHECK should reject it. The edit link is shown for drafts on the submissions page, so this looks like a real website bug. Do not port it; when promoting a draft always set `submitted_at`.

---

## 6. Relay, sync and schema risks

Numbered for reference in discussions.

**R1 - No server-side revision or "apply once" token.** `scouting_entries` has no `revision`, no `updated_at` precondition, and no unique key besides `id`. Upload is last-writer-wins by id. `AGENTS.md`'s "acknowledge exactly the revision uploaded" can only be local: store a monotonic local revision plus a content hash and clear only the snapshot whose hash was sent. After upload, a read-back of `id,updated_at,status` is the only confirmation the server holds the row. It cannot confirm *which* payload.

**R2 - Edit-after-submit cannot sync for plain scouts.** If a scout corrects a submitted report on device (or a queued edit follows a successful submit), the UPDATE is rejected by RLS. Must be modelled as a distinct local state ("blocked: needs privileged edit") rather than "failed, will retry forever". Options: (a) disallow post-submit edits for non-privileged roles; (b) request an RPC such as `update_own_scouting_entry(entry_id, payload)` that checks `scout_user_id = auth.uid()`; (c) call a web endpoint (not possible with cookie-auth routes). The decision belongs to the human; do not add a service key.

**R3 - Master relay is not authorised by RLS.** `master` has no special insert privilege. For role `master` the policy collapses to the ordinary scout branch (`scout_user_id` must equal `auth.uid()`), so a Master device can **not** insert a report on behalf of another scout. Only `admin`, `developer` and `global_scout` pass the first branch (which has no `scout_user_id` check). A QR checksum proves integrity only (as `docs/mobile-collaboration.md` already says). Either (a) restrict "upload relayed reports" to those three roles, (b) have the *original scout's device* upload when it regains signal and use QR purely as a peer backup the Master holds, or (c) add a server-side "accept relayed report" RPC that verifies a signature minted by the scout device. (c) needs a signing key distribution design. None of this exists today; **do not claim relay delivery**.

**R4 - Spoofable authorship for the privileged branch.** Because the admin/global_scout insert branch doesn't constrain `scout_user_id`, any such account can create entries attributed to anyone, and the `complete_matching_scout_assignments` trigger will complete that scout's assignment. Native shouldn't offer this deliberately; if relay (R3a) is built it will use this path.

**R5 - Duplicates are normal.** No uniqueness on (event, match, team, scout). The web reuses an id per assignment or `match:team` in `localStorage`; a second device, a cleared browser, or a manual report for a scheduled match yields extra rows. Statistics average per match key, but the assignment trigger and the "submitted" counters count rows. Native: keep one id per (user, assignment) or (user, match, team, entry_type) slot in local DB; surface "you already submitted this" before creating a second.

**R6 - Server triggers can fail a write.** `queue_slack_breakage_notification` runs `net.http_post` and reads a Vault secret in the same transaction as a submit. A prior defect in that function (`20261010134950_fix_breakage_notification_headers.sql`: "made the breakage trigger roll back otherwise valid scout submissions") dropped robot-broke submissions. Classify unexpected server errors on `robot_broke` submissions as *retryable and preserved*, never discard local data on a non-2xx.

**R7 - `match_id` can be rewritten server-side.** `auto_link_submitted_manual_match_report` and `reconcile_manual_match_reports` set `match_id` after the fact, and TBA import renames a manual match key in place. Local caches keyed on `(match_id,team_id)` must re-key from the server row; local `manual_match` must remain the source of the human label. Assignment completion is also server-driven, so do not complete assignments locally.

**R8 - Photos are not idempotent and cannot be deleted.** The web's path includes a fresh `crypto.randomUUID()` per attempt, so a retry after a lost response produces a second object and second `pit_photos` row. There is no `pit_photos` update/delete policy and no storage delete policy, so cleanup after a failed record insert silently fails (orphan object). Native should generate a photo UUID once per capture, use it as the path leaf, `upload(upsert: true)` (update policy exists for own prefix), and insert the record with `onConflict storage_path ignoreDuplicates`. Storage RLS reads are org-wide (not per-event).

**R9 - Realtime coverage is incomplete in the repo.** `supabase_realtime` is extended for `scouting_entries`, `pit_photos`, `picklist_*`, `shared_picklist_rankings`, `picklist_change_log`, `event_global_documents`, `event_teams`, `match_report_sources`, `match_submissions`, `team_notes` (dropped). `matches` and `events` are subscribed to by the web (`LiveRefresh tables=["matches"...]`) but no migration adds them; either they were enabled in the dashboard (drift) or the subscriptions never fire. Don't rely on them; pull on foreground, on connectivity regain and on a timer.

**R10 - Missing/rotating definitions.** `scouting_entries` policies are repo-incomplete (blocker 2). `pg_cron` job `wildcard-pulse-live-event-sync` and Vault secrets `wildcard_live_sync_trigger`, `slack_breakage_notification_secret` are likewise created outside migrations. Treat `supabase/migrations` as non-authoritative for these.

**R11 - Cross-org / cross-event integrity on insert.** The insert policy checks `organization_id` membership but not that `event_id`, `match_id`, `team_id`, or `assignment_id` belong to that org/event, and there is no FK check that `team_id` is on the event roster. Native must validate locally (team is in the event; match belongs to the event; team is on the match roster for scheduled reports) because the server will accept inconsistent rows and downstream stats will silently drop or misattribute them.

**R12 - Draft visibility.** Any member can read any other member's draft (select policy has no status filter), and drafts are excluded from stats by `status='submitted'`. Don't put sensitive data in drafts on the assumption they're private.

**R13 - Single-org assumption.** All membership queries use `.limit(1)`; local DB must scope by `(user_id, organization_id)` but the app need not support switching orgs.

**R14 - Role of `status` values.** The DB enum allows `corrected` and `invalid` but no code reads or writes them. Stats and lists filter on exactly `submitted`/`draft`. Native must not introduce them.

**R15 - Starting spot vocabulary drift.** DB allows 9 values (incl. legacy `line-1`, `line-2`); the form emits 7. Legacy rows render as "Line 1". Keep the list in one constant; the field-map positions are percentages in `rebuilt-match-form.tsx:31-39` with separate "alliance" and "mirror" layouts, and the blue-alliance view rotates the art only, not button coordinates.

**R16 - Time zone and clock.** `scheduled_at` is the TBA *predicted* time else official time; `submitted_at` is the **device** clock (`new Date().toISOString()`). Offline devices with a wrong clock write wrong `submitted_at`. Consider recording a monotonic local created-at separately and never trusting device time for ordering.

**R17 - Web quirks that must not be copied.** (a) `submitted_at` missing on edit (see 4.9). (b) `scout-form.tsx` legacy writes. (c) Match `defended_teams` stores team *ids*, and `breakage_issues[].issue` stores the human string (not an enum) so analytics are label-sensitive. (d) `Counter` aria-labels say "foul" for any counter. (e) `AutoPathDrawer` does not reload an existing drawing into its stroke state; editing a pit report and touching the canvas replaces the previous drawing. Preserve the previous SVG unless the scout actually draws.

---

## 7. Recommended native information architecture

Role-aware bottom navigation (iOS tab bar / Android navigation bar). Five slots maximum, per the design consultation (`docs/mobile-design/CLAUDE-ADVICE.md`).

| Tab | Contents | Roles |
| --- | --- | --- |
| **Today** | Active event banner, next assignment (primary action), my pending assignments, outbox status chip, global-document shortcut | all |
| **Schedule** | Match list -> match detail -> pick robot -> Match entry; Manual match entry; filters | all |
| **Scout** | Pit scouting (+photos & coverage), Pre-scouting, Global document | all (pre-scout restricted by RLS) |
| **Teams** | Directory (+ search) -> Team profile (photos, timeline, research, robot profile) -> Compare; Summary table; pre-scout sheet | all |
| **More** | Submissions (mine/everyone), Outbox, Picklist (if `can_view_picklist`), Match strategy, Leaderboard (optional), Settings, role-gated Admin (web link-outs), Sign out | all; items by role |

Non-tab screens: sign-in/sign-up/reset, almost-ready (no membership), no-active-event, match entry stack (pre -> auto -> teleop -> details -> review), report detail, outbox detail with per-item state, photo capture/review, strategy drawing canvas, picklist history, device status (online, last sync, queue length, app/form versions).

Role-based visibility suggestions:

| Item | Show for |
| --- | --- |
| Picklist (edit controls) | strategist, master, admin, developer, global_scout (others read-only; hide if `can_view_picklist` false) |
| Report-source picker | admin |
| Global document editor | admin, strategist, developer |
| Robot profile editor | admin, developer (read-only for others until server support exists) |
| Admin section | admin, developer: events, active event, manual matches/scores, assignments (read), roles; link out to web for TBA import, invites, rosters, clear/undo |
| Email access | the three managers (probe via `can_manage_email_access`) |

Offline-readiness package to download per event (for "Offline ready"): `events` row (+ `tba_team_remaps`), `event_teams`+`teams`, `matches`, my `scouting_assignments`, `prescout_assignments` (own), `organization_members`+`profiles` (names), `picklist_categories`/`picklist_tags`/`shared_picklist_rankings` (read), submitted `scouting_entries` for stats (could be large: page by 1000 as the web does), `match_report_sources`, `event_global_documents`, signed URLs are short-lived (3600 s) so cache images, not URLs.

---

## 8. Test fixtures to port

These web tests encode real behaviour and are portable (pure TS):

| Test | Locks down |
| --- | --- |
| `lib/scouting-stats.test.ts` | per-match averaging, competitive filter, selected sources |
| `lib/timeline-ferry.test.ts` | unscouted = null, not zero |
| `lib/tba-matches.test.ts` | official key adoption of manual matches, played-status preservation |
| `lib/tba-team-identity.test.ts` | alias resolution, duplicate alias rejection |
| `lib/manual-match-result.test.ts` | blank score is not zero |
| `lib/manual-match-safety.test.ts` | alliance move counts as change |
| `lib/auth/allowed-email.test.ts` | domain/exception logic (not usable on device) |

---

## 9. Implementation status

Last updated 2026-10-13. Sections 1–8 preserve the initial website audit and its historical feasibility/gap assessment; the current implementation below supersedes obsolete “no native server support” statements, without implying that new endpoints are deployed.

**Code** means source exists, not feature-complete parity. **Logic** identifies pure/local automated coverage, not authenticated device tests. **iOS evidence** lists only observed local-practice behavior; “not tested” is intentional. Latest checkpoints: native typecheck and **83 native tests passed**; **40 mobile server tests passed**, plus isolated PostgreSQL/PGlite migration tests. iOS/Android/web Expo exports passed before the still-in-flight focused Schedule repair. Exports do not prove Android runtime or production behavior.

| ID | Code | Logic | iOS evidence / remaining boundary |
| --- | --- | --- | --- |
| A1 email/password sign in | yes | auth/input models | Screen exists; no real authenticated sign-in tested. |
| A2 named sign up | yes | name/password validation | First/last/display-name metadata included; real signup/confirmation untested. |
| A3 Google OAuth | yes | strict PKCE callback parsing | Needs installed native build and hosted redirect configuration; untested live. |
| A4 password reset | yes | recovery-event/user/expiry guards | Request/recovery screens exist; no reset email or live recovery tested. |
| A5 sign out | yes | account-scope guards | Preserves scoped local work; real account-switch/sign-out runtime untested. |
| A6 viewer + event | yes | namespaces/bindings | Practice event observed; live membership/event download untested. |
| A7 global search | yes | search model | Query 694 showed 1 team, 3 matches and 2 reports in practice; searches downloaded/accessible data, not all private org events. |
| A8 missing membership/event states | partial | — | Clear unavailable/error states exist; no-membership onboarding not live-tested. |
| A9 privacy/terms | partial | — | Privacy link exists; terms entry remains absent. |
| S1 assignments home | yes | queue/count foundations | Practice home observed; authenticated assignments untested. |
| S2 scheduled picker | yes; repair in flight | schedule model | Focused Schedule opened; team-list bug found and assigned to Claude, not yet reverified at this checkpoint. |
| S3 match v4 | yes | normalization/revision tests | Root verified +1/+10/direct correction, 7 scored/1 ferried, review, local submit and SQLite reopen with permanent ID. |
| S4 manual match | yes | identity/reuse validation | Separate manual identities preserve UUIDs; native manual-flow runtime untested. |
| S5 drafts | yes, local-first + cloud backup | queue/revision/manual identity | Local SQLite persistence observed; 1.5s debounced cloud draft upload and backed-up deletion need authenticated testing. |
| S6 outbox/retry | yes | exact-revision acknowledgments/failure guards | Saved local report reopened; real upload/reconnect/conflict behavior untested. |
| S7 pit form | yes | bounds/derived fields/SVG/payload | Claude verified native drawing, autosave, review and local submission in practice. |
| S8 pit photos/coverage | yes | limited | Permission, physical camera, private upload and reconnect flows untested. |
| S9 pre-scout | yes | validation/coordination | Assignment labels coordinate rather than incorrectly deny active-event scouts; runtime/live permission checks pending. |
| S10 global document | yes | URL checks | Opens supported Google URLs; live editing/opening not tested. |
| S11 forms hub | yes | — | More/native routes exist; not a claim that custom builder definitions drive specialized capture. |
| S12 submissions | partial | report summaries/models | Local detail observed; downloaded cloud history exists, but full website Everyone/type/author/filter parity is not verified. |
| S13 report corrections | yes, native + server | permission/CAS/identity tests | Own submitted corrections supported by bearer endpoint; any-member pit editing retained. No live role-by-role correction tested. |
| S14 delete/manual identity | yes, native + server | atomic deletion/CAS/manual identity tests | Owner/admin/developer deletion and assignment reopening implemented; manual identity uses dedicated endpoint. Migration/deployment and live destructive tests pending. |
| S15 leaderboard | yes | website metric/grouping tests | Native practice screen displayed 2 reports. |
| S16 realtime refresh | yes | limited | Debounced event-table channels, foreground/connectivity refresh and poll fallback exist; live subscriptions untested. |
| T1 schedule | yes; repair in flight | schedule/official outcomes | Same focused team-list issue as S2; played-delay/order parity needs confirmation. |
| T2 team directory | partial | search/team identity | Teams reachable through search/summary/strategy; full dedicated website directory parity not asserted. |
| T3 team profile | yes | stats/official feed/outcomes | Native source includes photos, research, timeline and official rank/record/OPR; full profile runtime/live feed untested. |
| T4 match timeline | yes | keys/source/outcomes | Source selection and report grouping covered; interactive timeline runtime untested. |
| T5 robot profile | yes, any member | server permission/validation | Non-admin writes use authenticated server endpoint; live deployment/test pending. |
| T6 summary/pre-scout sheet | yes | stats/official rank/OPR | Claude observed summary in practice; official values shown only from a successful downloaded feed, never invented. |
| T7 compare | yes | stats/official calculations | 2–4 team comparison and Official tab exist; native interactive comparison untested. |
| T8 strategy/drawing | yes | strokes/revision-safe drawing queue | Source includes offline personal drawing queue; strategy gesture/save runtime not independently established by pit-drawing evidence. |
| T9 picklist | yes | moves/ranks/tier deletion/history restore | Shared edits, tiers, tags and restore need online connection; live role and UI flows untested. |
| T10 report-source picker | yes, admin-only | source grouping/validation | Combined/null or selected report supported; live RLS/write/readback untested. |
| T11 official data | yes, server proxy + refresh | official stats/server auth | TBA read proxy supplies rank/record/OPR; unavailable production mobile API means live native feed not established. |
| M1 event management | yes | setup models/activation SQL | Native chooser/activation/delete exist; atomic activation migration unapplied, live management untested. |
| M2 TBA import | yes, server | authenticated import tests | Secret stays server-side; deployment and real import untested. |
| M3 manual events/teams | yes | validation/protection models | Root added synthetic Team 9999 in local practice; real event/roster writes untested. |
| M4 manual matches/scores | yes | match/alias/score validation | Native create/edit/delete/results exist; real destructive and score flows untested. |
| M5 rosters/generation | yes, native + server | rotation/slot protection | Preview and server generation exist; actual multi-scout assignments untested. |
| M6 slot/pre-scout assignments | yes | assignment guards | Complete/submitted protection and prescout coordination exist; role-by-role writes untested. |
| M7 clear/undo | yes, server | snapshot/CAS/partial-clear tests | Scoped snapshot/undo implemented; no live assignment deletion performed. |
| M8 members/roles/invites | yes, server | permission/input/binding tests | Native tools implemented; no real role changes or invitations sent. |
| M9 form builder | yes, builder only | schema/input validation | Native editing/preview exists; these generic definitions are NOT consumed by specialized match/pit/pre-scout capture, matching the website limitation. |
| M10 email access | yes | manager authorization/bindings | Dedicated manager gate and allowlist tool; live manager account and mutations untested. |
| M11 sync entry points | yes | queue models | Settings/Outbox provide sync and capability notices; no separate parity claim for the website redirect-only page. |

**Relay:** Settings registers/revokes native signing devices; submitted QR carries an Ed25519 author proof when configured. Scanner preserves proof and received snapshots. Unsigned receipts remain backups and are excluded from automatic upload. Canonical signatures/tampering/frame handling are automated-tested; root observed QR rendering, not a physical two-device scan/cloud-delivery loop. Registration/relay require the new server routes and unapplied device-key migration.

**Production:** read-only capability probing returned **307 → login page 200**, not the required JSON capability response. Mobile endpoints are therefore **not established available** on production. No hosted migration/deployment/Auth redirect changes or production records were changed by this implementation checkpoint.

**Cross-platform / security:** no Android SDK was found at `~/Library/Android/sdk`; no Android runtime testing occurred. Camera, two-device signed QR, real auth/accounts, airplane-mode cold launch/reconnect, dark mode/large-font/screen-reader coverage and final Schedule repair remain gates. Live npm audit reported **36 findings (23 high, 13 moderate)**. An offline audit returning zero is not valid evidence that dependencies are secure. See `docs/mobile-verification/native-qa.md` for checkpoint evidence and outstanding runtime checks.

---

## 10. Open questions for the human / Codex

1. **Deployment/configuration authority:** approve applying the prepared mobile migration and deploying the bearer-auth routes before live native correction/deletion, signed relay, TBA and privileged setup can be verified. Existing production redirects do not establish endpoint readiness.
2. **Auth and test accounts:** authorize/register `hal9000://auth/callback` and `hal9000://auth/recovery` as appropriate, supply approved test accounts/roles, and determine who may perform disposable live tests (including delete/reopen, invites and allowlist changes). No real credentials should be shared with Claude or committed.
3. **Distribution/device access:** choose the initial TestFlight/internal Android distribution path and provide Android SDK/device access for runtime tests. Installed native builds and physical cameras/two devices are needed for OAuth and complete signed-relay verification.
4. **Generic custom forms — product decision:** should admin-created definitions actually become selectable capture forms on BOTH web and native? The current specialized v4/v2 forms do not consume them, and the website likewise does not. Wiring them is a deliberate cross-platform feature, not a completed builder-parity claim.

Previously unanswered implementation choices are now resolved in source: own submitted corrections/deletion use authenticated server support; Master relay uses registered author signatures; TBA rank/OPR use the server proxy; hosted RLS was checked read-only (active-event prescout is permitted); prescout assignments coordinate without denying otherwise authorized scouts; mobile-specific shared contracts avoid inventing obsolete table types; leaderboard is included. These are implementation decisions, not proof of production deployment or successful authenticated workflows.

## 11. Takeover checkpoint (2026-10-13)

| Evidence | Result | Kind |
|---|---|---|
| `npm run mobile:test` | 85 / 85 pass | code + unit |
| `node --import tsx --test apps/web/src/lib/mobile/*.test.ts` | 40 / 40 pass | code + unit (fake clients) |
| `mobile:typecheck`, web `typecheck` | clean | code |
| `expo export` iOS and Android | succeed | build only, not runtime proof |
| Migration `20261013143440` reread | reviewed; PGlite harness only | code |
| Hosted Supabase state / migration history | **not inspected**: no CLI, token or connector in this environment | blocked |
| `https://hal9000.stuypulse.com/api/mobile/capabilities` | **not deployed, not verified** | blocked |
| Android runtime, camera/photo, dark mode, large text, real-account roles, two-device QR | **not run** | pending |
