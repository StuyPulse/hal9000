import {compareMatches} from '../features/stats';
import type {Assignment,EventBundle,LocalSubmission} from './types';

/**
 * Assignments this phone still has to scout, in match order. A report counts
 * for an assignment when it names it, or when it covers the same robot in the
 * same match, since reports started from the schedule carry no assignment ID.
 */
export function openAssignments(bundle:Pick<EventBundle,'event'|'assignments'|'matches'>,records:LocalSubmission[],userId:string):Assignment[]{
 // Another scout's report claimed for editing here does not complete this account's assignment.
 const done=records.filter(r=>r.origin==='own'&&r.entry.scout_user_id===userId&&r.entry.event_id===bundle.event.id&&r.entry.entry_type==='match'&&r.entry.status==='submitted');
 const ids=new Set(done.map(r=>r.entry.assignment_id).filter(Boolean));
 const pairs=new Set(done.filter(r=>r.entry.match_id).map(r=>`${r.entry.match_id}:${r.entry.team_id}`));
 const match=new Map(bundle.matches.map(m=>[m.id,m]));
 return bundle.assignments
  .filter(a=>a.status!=='complete'&&!ids.has(a.id)&&!pairs.has(`${a.match_id}:${a.team_id}`))
  .sort((a,b)=>{const ma=match.get(a.match_id),mb=match.get(b.match_id);return ma&&mb?compareMatches(ma,mb):0});
}
