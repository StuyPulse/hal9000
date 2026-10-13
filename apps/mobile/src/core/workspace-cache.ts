import {getValue,putValue} from './storage';
import {createWorkspaceCache} from './workspace-cache-model';
export const workspaceCache=createWorkspaceCache({get:getValue,put:putValue});
