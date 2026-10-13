import { body, protectedOperation } from "@/lib/mobile/http";
import { correctReport, deleteReport } from "@/lib/mobile/operations";

export async function PATCH(request: Request) {
  return protectedOperation(request, async (database, actor) => correctReport(database, actor, await body(request)));
}
export async function DELETE(request: Request) {
  return protectedOperation(request, async (database, actor) => deleteReport(database, actor, await body(request)));
}
