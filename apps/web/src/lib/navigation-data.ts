import { revalidateTag, unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

type SearchEvent = { key: string; name: string; status: string };
type SearchTeam = { number: number; name: string };
type EventRow = { event_key: string; name: string; status: string };
type EventTeamRow = { teams: { team_number: number; name: string } | { team_number: number; name: string }[] | null };

const organizationEventsTag = (organizationId: string) => `navigation-events:${organizationId}`;
const eventTeamsTag = (eventId: string) => `navigation-event-teams:${eventId}`;

function getCachedOrganizationEvents(organizationId: string) {
  return unstable_cache(async (): Promise<SearchEvent[]> => {
    const database = createAdminClient();
    const { data, error } = await database
      .from("events")
      .select("event_key,name,status")
      .eq("organization_id", organizationId)
      .order("starts_at", { ascending: false });
    if (error) throw new Error("Could not load the event search index.");
    return (data as EventRow[] ?? []).map((event) => ({ key: event.event_key, name: event.name, status: event.status }));
  }, ["navigation-events", organizationId], { revalidate: 300, tags: [organizationEventsTag(organizationId)] })();
}

function getCachedEventTeams(eventId: string) {
  return unstable_cache(async (): Promise<SearchTeam[]> => {
    const database = createAdminClient();
    const { data, error } = await database
      .from("event_teams")
      .select("teams(team_number,name)")
      .eq("event_id", eventId);
    if (error) throw new Error("Could not load the team search index.");
    return (data as EventTeamRow[] ?? []).flatMap((row) => {
      const teams = row.teams ? (Array.isArray(row.teams) ? row.teams : [row.teams]) : [];
      return teams.map((team) => ({ number: team.team_number, name: team.name }));
    });
  }, ["navigation-event-teams", eventId], { revalidate: 300, tags: [eventTeamsTag(eventId)] })();
}

export async function getNavigationSearchData(organizationId: string | null, activeEventId: string | null) {
  const [events, teams] = await Promise.all([
    organizationId ? getCachedOrganizationEvents(organizationId) : Promise.resolve([]),
    activeEventId ? getCachedEventTeams(activeEventId) : Promise.resolve([]),
  ]);
  return { events, teams };
}

export function revalidateOrganizationNavigation(organizationId: string) {
  revalidateTag(organizationEventsTag(organizationId), { expire: 0 });
}

export function revalidateEventTeamNavigation(eventId: string) {
  revalidateTag(eventTeamsTag(eventId), { expire: 0 });
}
