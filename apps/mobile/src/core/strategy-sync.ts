import * as Crypto from 'expo-crypto';
import { requireClient } from './client';
import { getValue, listValues, putValue, removeValue } from './storage';
import { createDrawingQueue, uploadDrawingWith, type DrawingClient, type OverlayRow, type QueuedDrawing } from './strategy-queue';
import type { EventBundle } from './types';

const queues = new Map<string, ReturnType<typeof createDrawingQueue>>();

const uploadDrawing = async (drawing: QueuedDrawing) => {
  const client = requireClient();
  // Never upload a queued drawing as someone else: the account must still be the one that made it.
  const { data } = await client.auth.getUser();
  if (!data.user || data.user.id !== drawing.user_id) throw new Error('Signed in as a different account; this drawing stays queued for its owner.');
  return uploadDrawingWith(client as unknown as DrawingClient, drawing);
};

/** One queue (and one write chain) per local scope; demo scopes never reach `flush`. */
export function drawingQueue(scope: string) {
  let queue = queues.get(scope);
  if (!queue) {
    queue = createDrawingQueue({
      get: (key) => getValue<QueuedDrawing>(scope, 'strategy', key),
      put: (key, value) => putValue(scope, 'strategy', key, value),
      remove: (key) => removeValue(scope, 'strategy', key),
      list: () => listValues<QueuedDrawing>(scope, 'strategy'),
    }, uploadDrawing, () => Crypto.randomUUID());
    queues.set(scope, queue);
  }
  return queue;
}

/** Keep a not-yet-uploaded drawing visible when a freshly downloaded bundle replaces the cached one. */
export async function overlayPendingDrawings(bundle: EventBundle): Promise<EventBundle> {
  const rows = await drawingQueue(bundle.scope).overlay(bundle.strategyDrawings as OverlayRow[] | undefined, bundle.event.id);
  return rows === bundle.strategyDrawings ? bundle : { ...bundle, strategyDrawings: rows as EventBundle['strategyDrawings'] };
}
