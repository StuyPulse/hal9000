export type PhotoSelection = { id: string; eventId: string; localUri: string; createdAt: string };
type PhotoDestination={event_id:string;organization_id:string;uploaded_by:string;team_id:string};

/** Staging cleanup may fail after a successful save. Retry the same photo, not a new UUID. */
export async function queuePhotoSelection<T extends PhotoDestination>(destination:PhotoDestination,actions:{read:()=>Promise<T|null>;stage:()=>Promise<T>;write:(photo:T)=>Promise<void>}) {
  const existing=await actions.read();
  if(existing){
    if(existing.event_id!==destination.event_id||existing.organization_id!==destination.organization_id||existing.uploaded_by!==destination.uploaded_by)throw Error('This photo belongs to another workspace.');
    if(existing.team_id!==destination.team_id)throw Error('This photo is already queued for its original team. Remove the staged selection rather than uploading it again.');
    return;
  }
  await actions.write(await actions.stage());
}

/** Delete the owned file first. A failed unlink retains the row so removal can be retried. */
export async function discardPhotoSelection(id: string, actions: {
  read: () => Promise<PhotoSelection | null>;
  discardFile: (photo: PhotoSelection) => void;
  removeRow: () => Promise<void>;
}) {
  const photo = await actions.read();
  if (photo) {
    if (photo.id !== id) throw Error('The selected photo changed. Reopen this screen.');
    actions.discardFile(photo);
  }
  await actions.removeRow();
}

/** Never unlink an original library image or another workspace's file. */
export function isOwnedSelectionFile(actualUri: string, expectedUri: string) {
  return actualUri === expectedUri && actualUri.startsWith('file://');
}

export function validSelectionLocation(scope: string, id: string) {
  const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  return new RegExp(`^(practice|live):${uuid}:${uuid}$`,'i').test(scope) && new RegExp(`^${uuid}$`,'i').test(id);
}
