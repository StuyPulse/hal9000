import {body,protectedOperation} from '@/lib/mobile/http';
import {changeSuspension,listSuspensions} from '@/lib/mobile/suspension-operations';
export async function GET(request:Request){return protectedOperation(request,(db,actor)=>listSuspensions(db,actor));}
export async function POST(request:Request){return protectedOperation(request,async(db,actor)=>changeSuspension(db,actor,await body(request)));}
