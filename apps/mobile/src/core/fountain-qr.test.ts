import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {randomUUID} from 'node:crypto';
import {base45Decode,base45Encode,EASY_SCAN_BLOCK_SIZE,FountainCollector,FountainDecoder,FountainEncoder,parseFrame} from '@wildcard/shared/src/fountain-qr';
import {decodeReportBatch,encodeReportBatch} from '@wildcard/shared/src/qr-batch';

const uuid=()=>randomUUID();
const org=uuid(),event=uuid(),teams=Array.from({length:40},uuid),matches=Array.from({length:80},uuid),scout=uuid();
function report(i:number,signed=true){
 const entry={id:uuid(),organization_id:org,event_id:event,team_id:teams[i%40],match_id:matches[i%80],assignment_id:null,scout_user_id:scout,entry_type:'match',form_version:4,status:'submitted',submitted_at:'2026-11-02T15:00:00.000Z',payload:{no_show:false,starting_spot:'hub',starting_spot_confirmed:true,auto:{shoot:i%7*10,ferry:i%3*10},teleop:{shoot:i%11*10,ferry:i%5*10},no_show_reason:null,auto_fuel:(i%7+i%3)*10,teleop_fuel:(i%11+i%5)*10,fouls:i%3,defense:i%2===0,defense_level:i%2===0?5:null,defended_teams:[],robot_broke:false,breakage_issues:[],break_timestamp:null,break_tag:null,comments:`Match note ${i}: drove well, fed from the far side.`,report_source:'scheduled',manual_match:null}};
 const proof=signed?{envelope:{version:1,deviceId:scout,entry,createdAt:'2026-11-02T15:00:01.000Z'},signature:`${'A'.repeat(86)}==`}:undefined;
 return {entry,revision:1,...(proof?{proof}:{})};
}
/** Deterministic PRNG so loss patterns are reproducible. */
const prng=(seed:number)=>()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
function run(enc:FountainEncoder,loss:number,seed=1,limit=enc.k*4+60){
 const random=prng(seed);let decoder:FountainDecoder|null=null,shown=0;
 for(let seq=0;seq<limit;seq++){shown++;if(random()<loss)continue;const frame=parseFrame(enc.frame(seq));decoder??=new FountainDecoder(frame);decoder.accept(frame);if(decoder.done)break}
 return {decoder,shown};
}

test('base45 round-trips every byte value and rejects junk',()=>{
 for(const length of [0,1,2,3,255,256]){const bytes=Uint8Array.from({length},(_,i)=>(i*7)%256);assert.deepEqual(base45Decode(base45Encode(bytes)),bytes)}
 assert.throws(()=>base45Decode('a'));assert.throws(()=>base45Decode('A'));assert.throws(()=>base45Decode(':::'));
 assert.match(base45Encode(Uint8Array.from({length:256},(_,i)=>i)),/^[0-9A-Z $%*+\-./:]+$/);
});
test('no loss needs exactly one pass of source frames',()=>{
 const data=encodeReportBatch([report(1),report(2),report(3)]),enc=new FountainEncoder(data);
 const {decoder,shown}=run(enc,0);
 assert.equal(shown,enc.k);assert.deepEqual(decoder?.data,data);
});
test('recovers from heavy frame loss in any order with little overhead',()=>{
 const data=encodeReportBatch(Array.from({length:60},(_,i)=>report(i))),enc=new FountainEncoder(data);
 for(const loss of [.1,.3,.5,.7]){
  for(const seed of [1,2,3,4,5]){
   const {decoder,shown}=run(enc,loss,seed,enc.k*8+100);
   assert.deepEqual(decoder?.data,data,`loss ${loss} seed ${seed}`);
   // Random linear repair: received frames stay within a handful of k, whatever was lost.
   assert.ok((decoder?.frames??0)<=enc.k+12,`needed ${decoder?.frames} frames for k=${enc.k}`);
   assert.ok(shown<=Math.ceil(enc.k/(1-loss))*2+40);
  }
 }
 const seqs=Array.from({length:enc.k+20},(_,i)=>enc.k*3+i).reverse();let decoder:FountainDecoder|null=null;
 for(const seq of seqs){const f=parseFrame(enc.frame(seq));decoder??=new FountainDecoder(f);decoder.accept(f);if(decoder.done)break}
 assert.deepEqual(decoder?.data,data,'repair frames alone, scanning from a late start');
});
test('large batches stay fast enough to catch up during a break',()=>{
 const reports=Array.from({length:500},(_,i)=>report(i)),data=encodeReportBatch(reports),enc=new FountainEncoder(data);
 const started=Date.now(),{decoder}=run(enc,.2,9,enc.k*3);
 assert.deepEqual(decoder?.data,data);
 const decoded=decodeReportBatch(decoder!.data!);
 assert.equal(decoded.reports.length,500);assert.equal(decoded.rejected.length,0);
 assert.ok(Date.now()-started<20000,'encode and decode well within budget');
 // At 4 frames a second, 60 signed reports must fit inside one short break.
 const sixty=new FountainEncoder(encodeReportBatch(reports.slice(0,60)));
 assert.ok(sixty.k/4<60,`60 signed reports took ${sixty.k/4}s`);
 console.log(`frames: 60 signed reports=${sixty.k}, 500 signed reports=${enc.k}`);
});
test('misreads and foreign frames are rejected before they can corrupt anything',()=>{
 const enc=new FountainEncoder(encodeReportBatch([report(1)])),frame=enc.frame(0);
 const flipped=frame.slice(0,20)+(frame[20]==='0'?'1':'0')+frame.slice(21);
 assert.throws(()=>parseFrame(flipped),/misread|base45/);
 assert.throws(()=>parseFrame('HELLO'),/not a HAL9000/);
 const other=new FountainEncoder(encodeReportBatch([report(2)]));
 const decoder=new FountainDecoder(parseFrame(frame));
 assert.throws(()=>decoder.accept(parseFrame(other.frame(0))),/another transfer/);
});
test('repeats are harmless and interleaved phones keep separate progress',()=>{
 const a=encodeReportBatch(Array.from({length:20},(_,i)=>report(i))),b=encodeReportBatch(Array.from({length:20},(_,i)=>report(100+i)));
 const ea=new FountainEncoder(a),eb=new FountainEncoder(b),collector=new FountainCollector();
 const finished:Uint8Array[]=[];
 for(let seq=0;seq<Math.max(ea.k,eb.k)+5;seq++){
  for(const enc of [ea,eb]){
   for(let repeat=0;repeat<3;repeat++){
    const {decoder,alreadyFinished}=collector.accept(enc.frame(seq));
    if(alreadyFinished||!decoder?.done)continue;
    finished.push(decoder.data!);collector.markSaved(decoder.key);
   }
  }
 }
 assert.equal(finished.length,2);
 assert.equal(collector.accept(ea.frame(0)).alreadyFinished,true);
 collector.reset();assert.equal(collector.accept(ea.frame(0)).alreadyFinished,false);
});
test('same selection gives the same transfer, so a restarted phone resumes',()=>{
 const data=encodeReportBatch([report(1)]);
 assert.equal(new FountainEncoder(data).code,new FountainEncoder(data).code);
 assert.notEqual(parseFrame(new FountainEncoder(data).frame(0)).key,parseFrame(new FountainEncoder(data,EASY_SCAN_BLOCK_SIZE).frame(0)).key);
});
test('one bad report never blocks the rest, and duplicates inside a batch collapse',()=>{
 const good=report(1),bad=report(2) as ReturnType<typeof report>;(bad.entry as {team_id:string}).team_id='not-a-uuid';
 const draft=report(3);(draft.entry as {status:string}).status='draft';
 const tampered=report(4);(tampered.entry.payload as {comments:string}).comments='different';tampered.proof={...tampered.proof!,envelope:{...tampered.proof!.envelope,entry:report(5).entry}};
 const decoded=decodeReportBatch(encodeReportBatch([good,good,bad,draft,tampered] as never));
 assert.deepEqual(decoded.reports.map(r=>r.entry.id),[good.entry.id]);
 assert.equal(decoded.rejected.length,3);
 assert.throws(()=>decodeReportBatch(Uint8Array.from([1,2,3,4])),/could not be read/);
});
test('real QR images: rendered at scanning scale and read back with lost frames',()=>{
 const data=encodeReportBatch(Array.from({length:12},(_,i)=>report(i))),enc=new FountainEncoder(data);
 const random=prng(42);let decoder:FountainDecoder|null=null,version=0;
 for(let seq=0;seq<enc.k*4&&!decoder?.done;seq++){
  const text=enc.frame(seq);
  if(random()<.3)continue;
  const qr=QRCode.create(text,{errorCorrectionLevel:'M'});
  version=qr.version;
  const size=qr.modules.size,scale=4,quiet=4,width=(size+quiet*2)*scale,pixels=new Uint8ClampedArray(width*width*4).fill(255);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){if(!qr.modules.get(y,x))continue;for(let py=0;py<scale;py++)for(let px=0;px<scale;px++){const o=(((y+quiet)*scale+py)*width+((x+quiet)*scale+px))*4;pixels[o]=pixels[o+1]=pixels[o+2]=0}}
  const read=jsQR(pixels,width,width);
  assert.equal(read?.data,text,'QR image reads back exactly');
  const frame=parseFrame(read!.data);decoder??=new FountainDecoder(frame);decoder.accept(frame);
 }
 assert.deepEqual(decoder?.data,data);
 assert.ok(version<=16,`QR version ${version} is too dense for a phone screen`);
 console.log(`QR version at ECC M: ${version}`);
});
