import { body, protectedOperation } from "@/lib/mobile/http";
import { importEvent } from "@/lib/mobile/tba-import";

export async function POST(request: Request) { return protectedOperation(request, async (database, actor) => importEvent(database, actor, await body(request))); }
