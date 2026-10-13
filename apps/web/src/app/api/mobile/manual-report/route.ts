import { body, protectedOperation } from "@/lib/mobile/http";
import { correctManualReport } from "@/lib/mobile/manual-report";

export async function PATCH(request: Request) { return protectedOperation(request, async (database, actor) => correctManualReport(database, actor, await body(request))); }
