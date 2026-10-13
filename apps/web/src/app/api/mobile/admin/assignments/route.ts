import {body,protectedOperation} from '@/lib/mobile/http';
import {assignmentOperation} from '@/lib/mobile/assignment-operations';
export async function POST(request:Request){return protectedOperation(request,async(database,actor)=>assignmentOperation(database,actor,await body(request)));}
