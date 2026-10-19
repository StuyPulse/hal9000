import {body,protectedOperation} from '@/lib/mobile/http';
import {listSafetyReports,resolveSafetyReport,submitSafetyReport} from '@/lib/mobile/safety-operations';
export async function GET(request:Request){return protectedOperation(request,(db,actor)=>listSafetyReports(db,actor,Number(new URL(request.url).searchParams.get('page')??'0')));}
export async function POST(request:Request){return protectedOperation(request,async(db,actor)=>submitSafetyReport(db,actor,await body(request)));}
export async function PATCH(request:Request){return protectedOperation(request,async(db,actor)=>resolveSafetyReport(db,actor,await body(request)));}
