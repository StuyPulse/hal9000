# Roles and security

The database is the authorization authority. `organization_members.role` is the only source of permissions; editable Auth metadata is never consulted for authorization.

| Role | Database access |
| --- | --- |
| Admin / developer | Manage organization event setup, teams, matches, form versions, assignments, and corrections. |
| Scout | Read only events in their assignments, submit only their own assigned data, and review only their own submissions. |
| Global Scout | Read every event and assignment in the organization, scout any team, correct any scouting entry, and edit the shared picklist and its tiers. This role cannot manage users, events, assignments, or forms. |
| Strategist | Read event data and submissions, but cannot mutate raw scout entries. |
| Master | Reserved for the Phase 3 device relay workflow. |

Every public table has RLS. Internal policy helpers are `SECURITY DEFINER` only in a non-exposed `private` schema, have fixed empty search paths, and have execute access revoked from public roles. Browser code uses the publishable key only. The photo bucket is private and its select/upload/update/delete policies check the owning submission.

New Supabase Auth users are rejected by a database `BEFORE INSERT` trigger unless their email ends in `@stuypulse.com`, with one audited exception for `seb@sebastianw.tech`. This protects password signup, invitations, and first-time OAuth user creation. The UI repeats the rule for clear feedback, but the trigger is the authority.

## First-admin onboarding

Create the first user through `/auth/login`, then execute the following in a trusted Supabase SQL session, substituting the signed-in user UUID:

```sql
with new_organization as (
  insert into public.organizations (name) values ('StuyPulse') returning id
)
insert into public.organization_members (organization_id, user_id, role)
select id, 'USER_UUID_HERE'::uuid, 'admin'::public.organization_role
from new_organization;
```

This setup action intentionally cannot be performed with the browser's publishable key: granting yourself the first admin role from a public client would defeat the entire role model.
