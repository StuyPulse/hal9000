import type {LocalSubmission,NativeEntry,Viewer} from './types';

export function canEditReport(viewer:Viewer|null,entry:NativeEntry,local?:LocalSubmission):boolean {
 if(!viewer||entry.organization_id!==viewer.organizationId||local?.origin==='relay')return false;
 if(['admin','developer','global_scout'].includes(viewer.role)||entry.entry_type==='pit')return true;
 if(entry.scout_user_id!==viewer.userId)return false;
 return entry.status==='draft'||entry.status==='submitted';
}

export function seedServerEdit(viewer:Viewer,entry:NativeEntry):LocalSubmission {
 if(!canEditReport(viewer,entry))throw Error('Your role cannot edit this submitted report.');
 if(!entry.updated_at)throw Error('Refresh this report before editing; its server revision is missing.');
 return {entry:JSON.parse(JSON.stringify(entry)),revision:1,acknowledgedRevision:1,status:'synced',error:null,origin:'own',baseUpdatedAt:entry.updated_at,changedAt:new Date().toISOString()};
}
