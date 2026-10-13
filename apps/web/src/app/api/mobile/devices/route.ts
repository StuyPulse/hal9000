import { body, protectedOperation } from "@/lib/mobile/http";
import { registerDevice, revokeDevice } from "@/lib/mobile/device-operations";

export async function POST(request: Request) { return protectedOperation(request, async (database, actor) => registerDevice(database, actor, await body(request))); }
export async function DELETE(request: Request) { return protectedOperation(request, async (database, actor) => revokeDevice(database, actor, await body(request))); }
