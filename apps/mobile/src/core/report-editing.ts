import type {LocalSubmission,NativeEntry,Viewer} from './types';

export function canEditReport(viewer:Viewer|null,entry:NativeEntry,local?:LocalSubmission):boolean {
 if(!viewer||entry.organization_id!==viewer.organizationId||local?.origin==='relay')return false;
 if(['admin','developer'].includes(viewer.role)||entry.entry_type==='pit')return true;
 if(entry.scout_user_id!==viewer.userId)return false;
 return entry.status==='draft'||entry.status==='submitted';
}

/** Revisions continue from any copy this phone already had, so a master never
 * mistakes a later server-based edit for an older one it has already received. */
export function seedServerEdit(viewer:Viewer,entry:NativeEntry,previous?:LocalSubmission|null):LocalSubmission {
 if(!canEditReport(viewer,entry))throw Error('Your role cannot edit this submitted report.');
 if(!entry.updated_at)throw Error('Refresh this report before editing; its server revision is missing.');
 const revision=previous&&previous.entry.id===entry.id?previous.revision+1:1;
 return {entry:JSON.parse(JSON.stringify(entry)),revision,acknowledgedRevision:revision,status:'synced',error:null,origin:'own',baseUpdatedAt:entry.updated_at,changedAt:new Date().toISOString()};
}
