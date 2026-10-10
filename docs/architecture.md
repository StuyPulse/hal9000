# Architecture

HAL9000 has one durable submission format shared across all planned clients.

```
Phase 1 web client ──┐
                    ├── Supabase Auth / Postgres / Storage / Realtime
Phase 2 PWA client ─┤
                    └── shared Zod schemas and TypeScript types
Phase 3 Expo app ───┘
```

Phase 1 is online-first. The browser validates form payloads with Zod, creates a UUID before submission, and inserts one `match_submissions` record. The same UUID will be retained by Phase 2's IndexedDB queue and Phase 3's SQLite/QR relay. Cloud submission handling is therefore idempotent by primary key rather than a check-then-insert race.

`apps/web` contains the Next.js App Router application. `packages/shared` contains game-agnostic types and form-schema validation. Game-specific controls such as FUEL, HUB, and tower rung live exclusively in `form_definitions.schema_json`; no season field belongs in a database column or core TypeScript interface.

The web app uses `@supabase/ssr` to keep Auth sessions in cookies. The Proxy refreshes and validates the token with `getClaims`; route data is independently constrained by PostgreSQL RLS.

TBA imports must happen in a trusted server context using `TBA_AUTH_KEY`, respect ETags, and upsert events, teams, event links, and matches. TBA is the only external competition data source.

Both admin imports and automatic active-event sync read `/matches` and `/matches/practice`, with separate ETags. Offseason B-team labels resolve through the event's `remap_teams` back to their numeric demo-team records, preserving team IDs and keeping the B robot separate from its parent team. A manual match is adopted only when its round and both alliance lineups identify one official match; its UUID, reports, and assignments remain attached. Ambiguous manual matches remain unchanged. Re-importing an active event preserves its status.

The Supabase Cron job calls `https://hal9000.stuypulse.com/api/live-event/sync` directly, using the trigger secret from Vault. A redirect from a different host drops the Authorization header and prevents automatic sync.
