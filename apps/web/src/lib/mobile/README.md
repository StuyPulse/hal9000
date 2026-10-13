# Native server API

These routes are local source only until the website is deployed. No endpoint
has been exercised against real accounts or production writes during development.
Device relay and atomic activation additionally require the unapplied migration
`20261013143440_mobile_device_keys_and_event_activation.sql`.

Every route except capabilities requires `Authorization: Bearer <access token>`.
Clients may send `X-HAL9000-Organization: <UUID>` to pin an operation to a selected
organization. The server validates the UUID and requires the authenticated user
to hold a current database membership in that exact organization. The header
does not grant a role or membership; absent-header clients retain first-membership
compatibility.
The server verifies the token with Auth `getUser(token)`, rejects anonymous users,
and loads the role/organization from `organization_members`. Service credentials
are accessed only through the existing server-only `createAdminClient` helper.
The proxy bypasses cookie-login redirects specifically for `/api/mobile/`; each
protected route performs its own authorization. JSON body limits are 512 KB.

| Method and path | Request | Response |
| --- | --- | --- |
| GET `/api/mobile/capabilities` | none | `apiVersion`, `configured`, `operations`, `limitations` |
| PATCH `/api/mobile/reports` | `{entry: NativeEntry, expectedUpdatedAt}` | `{entry}` |
| PATCH `/api/mobile/manual-report` | `{entryId,eventId,teamId,payload,expectedUpdatedAt}` | `{entry}` |
| DELETE `/api/mobile/reports` | `{entryId,eventId,expectedUpdatedAt}` | `{deleted,alreadyDeleted?,assignmentReopened?,warning?}` |
| GET `/api/mobile/tba?eventId=UUID` | event query | `{rankings,sortInfo,oprs,apiError}` |
| PATCH `/api/mobile/robot-profile` | `{eventId,teamId,drivetrain_type,shooter_type}` | `{profile}` |
| GET `/api/mobile/admin/members` | none | `{members:[{id,name,email,role}]}` |
| PATCH `/api/mobile/admin/members` | `{userId,role}` | `{role}` |
| POST `/api/mobile/admin/members` | `{email,role}` | `{invitationSent,roleAssigned,warning?}` |
| GET `/api/mobile/admin/email-access` | none | `{emails:[{email}]}` |
| POST `/api/mobile/admin/email-access` | `{email}` | `{authorized,alreadyAuthorized,invitationSent:false}` |
| POST `/api/mobile/admin/tba-import` | `{eventKey}` | `{eventId,teams,matches,message}` |
| POST `/api/mobile/admin/activation` | `{eventId}` | `{activeEventId}` |
| POST `/api/mobile/devices` | `{deviceId,publicKey,name}` | `{registered,deviceId,alreadyRegistered?}` |
| DELETE `/api/mobile/devices` | `{deviceId}` | `{revoked,deviceId}` |
| POST `/api/mobile/relay` | `SignedRelayProof` | `{entry,alreadyReceived}` |

Errors are JSON `{error,code}` with HTTP 401/403/404/409/422/503 as appropriate.
Never treat 404 from an undeployed route, missing migrations, or 503 as permission
to bypass these endpoints with a privileged client or blind overwrite.

Corrections preserve the UUID, author, organization, event, team, match,
assignment, form version, and original submission timestamp. Only payload and
last editor change. Owner/admin/developer can correct; any member can correct pit
reports, matching the actual website. Only owner/admin/developer can delete.
Global scouts are not silently granted additional server-action permissions.
Optimistic comparisons are enforced in the database update/delete statement.

Deletion and matching objective-assignment reopening now execute atomically in
the server-only `mobile_delete_report` RPC. Matching assignments are locked and
reopened only when no submitted report remains for that match/team/scout, even
when the deleted report had no explicit assignment ID. Missing RPC support fails
before deletion, with no sequential fallback. Generic corrections freeze canonical
`manual_match` and `report_source` metadata to prevent indirect trigger relinking.
Dedicated manual correction permits owner/admin/developer to correct the team,
stage, numeric label, and alliance on an already-manual submitted v4 report.
The server validates the event roster and derives a unique scheduled match;
arbitrary client match IDs are never accepted. The server-only transactional
`mobile_correct_manual_report` RPC rechecks permission and conflict state, locks
old/new objective assignment slots, updates the report, lets the original
completion trigger complete the new slot, and reopens the old slot only if no
submitted report remains. It returns the post-trigger result. Missing RPC fails
without a nonatomic fallback.

Pre-scout policy evolution: `20260915200500_allow_chezy_prescout_submissions.sql`
introduced an inactive-event exception narrowly for `2026cc`; later
`20261007211503_allow_active_event_prescout_submissions.sql` renamed that helper
and replaced its event-key condition with `event.status = 'active'`. Read-only
hosted `pg_get_functiondef` verification on 2026-10-13 confirmed the current
`private.can_submit_active_event_prescout` has membership, organization/event,
registered-team, and active-status checks; the Chezy helper no longer exists.
Current hosted INSERT policies permit ordinary authors with an explicit
pre-scout assignment OR that active-event predicate. Only admin/developer/global
scout author roles bypass assignment/active status. Strategist does not bypass.
Signed relay mirrors this verified current policy, not the superseded exception.

Signed relay uses Ed25519 public keys registered under the author's authenticated
account. Canonical JSON comes from `packages/shared/src/relay-contract.ts` and is
signed exactly as UTF-8. Public keys are 32-byte base64; signatures are 64-byte
base64. Private keys never leave the originating device. A checksum is not author
authentication. Revoked devices, nonmembers, incorrect author/event/team/match/
assignment identities, altered signatures, and divergent permanent IDs fail.
Replay of identical content acknowledges the existing row without overwriting.

Native TBA imports reuse the source's remap resolver and non-destructive match
merge, preserve active-event status, validate all remote payloads before writing,
and page through the organization team directory. Like the website, import is
multi-step rather than transactional; failure can leave partial imported setup,
so clients should offer retry and refresh, not claim rollback. It currently uses
full refresh instead of ETags. There is no Statbotics integration.

Invitations need a configured HTTPS `NEXT_PUBLIC_SITE_URL`; allowed domains/rows
are checked before sending. Email authorization uses the caller-scoped
`can_manage_email_access` RPC and RLS, not ordinary admin role alone.
Activation executes a security-invoker RPC in one transaction with an
organization advisory lock, preserving the previous active event on failure.

Tests: `node --import tsx --test apps/web/src/lib/mobile/*.test.ts`.
Typecheck: `npm run typecheck --workspace @wildcard/web`.
The standalone `verify-migration.mjs` executes the migration against an isolated
PGlite/PostgreSQL runtime with synthetic schema fixtures and checks SQL behavior.
Tests use fake clients and actual Node Ed25519 signing; they do not demonstrate
deployed routing, live Auth, migrations applied, or two-device runtime success.
