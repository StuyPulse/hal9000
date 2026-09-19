"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchableTeamSelect, type TeamOption } from "@/components/searchable-team-select";

export function SubmissionTeamFilter({ teams, value, markedTeamIds = [], markedTeamLabel }: { teams: TeamOption[]; value: string; markedTeamIds?: string[]; markedTeamLabel?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function choose(nextId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextId) params.set("team", nextId);
    else params.delete("team");
    const nextSearch = params.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname);
  }

  return <SearchableTeamSelect id="submission-team-filter" value={value} onValueChange={choose} teams={teams} placeholder="Find a team…" emptyLabel="All teams" markedTeamIds={markedTeamIds} markedTeamLabel={markedTeamLabel}/>;
}
