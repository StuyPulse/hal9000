import { body, protectedOperation } from "@/lib/mobile/http";
import { relayReport } from "@/lib/mobile/relay-operations";

export const runtime = "nodejs";
export async function POST(request: Request) { return protectedOperation(request, async (database, actor) => relayReport(database, actor, await body(request))); }
