import { ZodError } from "zod";
import { createAdminClient } from "../supabase/admin";
import { authenticate, MobileError, type Actor, type MobileDatabase } from "./operations";

export const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new MobileError(415, "json_required", "Send application/json.");
  // Enforce the actual streamed size, not just a client-controlled Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new MobileError(400, "invalid_json", "A JSON request body is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 512000) { await reader.cancel(); throw new MobileError(413, "body_too_large", "This report exceeds the upload size limit."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new MobileError(400, "invalid_json", "A valid JSON request body is required."); }
}
export async function protectedOperation(request: Request, operation: (database: MobileDatabase, actor: Actor) => Promise<unknown>) {
  try {
    const database = createAdminClient();
    const actor = await authenticate(database, request.headers.get("authorization"), request.headers.get("X-HAL9000-Organization"));
    return response(await operation(database, actor));
  } catch (error) {
    if (error instanceof MobileError) return response({ error: error.message, code: error.code }, error.status);
    if (error instanceof ZodError) return response({ error: "The request does not match the scouting contract.", code: "invalid_input" }, 422);
    // Never return PostgREST details, secrets, tokens, or stack traces.
    return response({ error: "This operation is unavailable right now.", code: "server_unavailable" }, 503);
  }
}
