import {sha256} from '@noble/hashes/sha2.js';

/**
 * Animated QR transfer with fountain coding. The sender first shows every block once,
 * then an endless stream of random XOR combinations. The receiver can start late, miss
 * frames and see them in any order: any set of roughly k distinct frames rebuilds the data.
 *
 * A frame is `H9F1:` + base45 of a binary header and block. Base45 fits the QR alphanumeric
 * mode, which holds about a third more data than base64 in byte mode at the same QR size.
 */
export const FRAME_PREFIX='H9F1:';
export const DEFAULT_BLOCK_SIZE=240;
export const EASY_SCAN_BLOCK_SIZE=110;
export const MAX_TRANSFER_BYTES=4*1024*1024;
const ID_BYTES=8,HEADER_BYTES=ID_BYTES+4+2+4,CRC_BYTES=4;
const BASE45='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const BASE45_VALUES=new Map([...BASE45].map((c,i)=>[c,i]));

export function base45Encode(bytes:Uint8Array):string{
 let out='';
 for(let i=0;i<bytes.length;i+=2){
  if(i+1<bytes.length){let n=bytes[i]*256+bytes[i+1];const a=n%45;n=(n-a)/45;const b=n%45;n=(n-b)/45;out+=BASE45[a]+BASE45[b]+BASE45[n];}
  else{const n=bytes[i];out+=BASE45[n%45]+BASE45[(n-n%45)/45];}
 }
 return out;
}
export function base45Decode(text:string):Uint8Array{
 if(text.length%3===1)throw Error('Invalid base45 length.');
 const out=new Uint8Array(Math.floor(text.length/3)*2+(text.length%3===2?1:0));
 let o=0;
 const value=(c:string)=>{const v=BASE45_VALUES.get(c);if(v===undefined)throw Error('Invalid base45 character.');return v};
 for(let i=0;i<text.length;i+=3){
  if(i+2<text.length){const n=value(text[i])+value(text[i+1])*45+value(text[i+2])*2025;if(n>65535)throw Error('Invalid base45 value.');out[o++]=n>>8;out[o++]=n&255;}
  else{const n=value(text[i])+value(text[i+1])*45;if(n>255)throw Error('Invalid base45 value.');out[o++]=n;}
 }
 return out;
}

const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(bytes:Uint8Array,end=bytes.length){let c=0xffffffff;for(let i=0;i<end;i++)c=CRC_TABLE[(c^bytes[i])&255]^(c>>>8);return (c^0xffffffff)>>>0}

/** The same block set for the same id and sequence number on every device. */
function repairCoefficients(id:Uint8Array,seq:number,k:number):Uint8Array{
 const seed=((id[0]<<24)|(id[1]<<16)|(id[2]<<8)|id[3])^Math.imul(seq,0x9e3779b1);
 let state=seed>>>0;
 const next=()=>{state=(state+0x6d2b79f5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return (t^(t>>>14))>>>0};
 const coefficients=new Uint8Array(Math.ceil(k/8));
 let word=0,bits=0;
 for(let i=0;i<k;i++){if(!bits){word=next();bits=32}if(word&1)coefficients[i>>3]|=1<<(i&7);word>>>=1;bits--}
 if(coefficients.every(b=>b===0))coefficients[0]=1;
 return coefficients;
}

export function transferId(data:Uint8Array){return sha256(data).slice(0,ID_BYTES)}
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
/** Short code shown on both devices so people can confirm they have the same transfer. */
export const transferCode=(id:Uint8Array)=>hex(id.slice(0,2)).toUpperCase();

export class FountainEncoder{
 readonly id:Uint8Array;readonly k:number;readonly code:string;
 private blocks:Uint8Array[]=[];
 constructor(private data:Uint8Array,readonly blockSize=DEFAULT_BLOCK_SIZE){
  if(!data.length)throw Error('Nothing to share.');
  if(data.length>MAX_TRANSFER_BYTES)throw Error('This selection is too large for one QR transfer. Select fewer reports.');
  if(blockSize<16||blockSize>1000)throw Error('Invalid QR block size.');
  this.id=transferId(data);this.code=transferCode(this.id);
  this.k=Math.ceil(data.length/blockSize);
  for(let i=0;i<this.k;i++){const block=new Uint8Array(blockSize);block.set(data.subarray(i*blockSize,Math.min(data.length,(i+1)*blockSize)));this.blocks.push(block)}
 }
 frame(seq:number):string{
  const body=new Uint8Array(HEADER_BYTES+this.blockSize+CRC_BYTES),view=new DataView(body.buffer);
  body.set(this.id,0);view.setUint32(ID_BYTES,this.data.length);view.setUint16(ID_BYTES+4,this.blockSize);view.setUint32(ID_BYTES+6,seq);
  const target=body.subarray(HEADER_BYTES,HEADER_BYTES+this.blockSize);
  if(seq<this.k)target.set(this.blocks[seq]);
  else{const c=repairCoefficients(this.id,seq,this.k);for(let i=0;i<this.k;i++)if(c[i>>3]&(1<<(i&7))){const b=this.blocks[i];for(let j=0;j<this.blockSize;j++)target[j]^=b[j]}}
  view.setUint32(body.length-CRC_BYTES,crc32(body,body.length-CRC_BYTES));
  return FRAME_PREFIX+base45Encode(body);
 }
}

export type ParsedFrame={id:Uint8Array;key:string;length:number;blockSize:number;seq:number;block:Uint8Array};
export const isFountainFrame=(text:string)=>text.startsWith(FRAME_PREFIX);
export function parseFrame(text:string):ParsedFrame{
 if(!isFountainFrame(text))throw Error('This is not a HAL9000 QR frame.');
 const body=base45Decode(text.slice(FRAME_PREFIX.length));
 if(body.length<HEADER_BYTES+CRC_BYTES+1)throw Error('This QR frame is too short.');
 const view=new DataView(body.buffer,body.byteOffset,body.byteLength);
 if(view.getUint32(body.length-CRC_BYTES)!==crc32(body,body.length-CRC_BYTES))throw Error('This QR frame was misread.');
 const id=body.slice(0,ID_BYTES),length=view.getUint32(ID_BYTES),blockSize=view.getUint16(ID_BYTES+4),seq=view.getUint32(ID_BYTES+6),block=body.slice(HEADER_BYTES,body.length-CRC_BYTES);
 if(block.length!==blockSize||!length||length>MAX_TRANSFER_BYTES)throw Error('This QR frame has an invalid size.');
 return {id,key:`${hex(id)}:${blockSize}`,length,blockSize,seq,block};
}

export type DecodeStep={duplicate:boolean;useful:boolean;solved:number;total:number;done:boolean};
/** GF(2) elimination: each new frame is reduced at once, so progress is exact. */
export class FountainDecoder{
 readonly id:Uint8Array;readonly key:string;readonly code:string;readonly k:number;readonly length:number;readonly blockSize:number;
 private seen=new Set<number>();
 private pivots=new Map<number,{c:Uint8Array;d:Uint8Array}>();
 private result:Uint8Array|null=null;
 frames=0;
 constructor(first:ParsedFrame){this.id=first.id;this.key=first.key;this.code=transferCode(first.id);this.length=first.length;this.blockSize=first.blockSize;this.k=Math.ceil(first.length/first.blockSize)}
 get solved(){return this.result?this.k:this.pivots.size}
 get done(){return this.result!==null}
 get data(){return this.result}
 accept(frame:ParsedFrame):DecodeStep{
  if(frame.key!==this.key||frame.length!==this.length)throw Error('This frame belongs to another transfer.');
  const status=(duplicate:boolean,useful:boolean):DecodeStep=>({duplicate,useful,solved:this.solved,total:this.k,done:this.done});
  if(this.result||this.seen.has(frame.seq))return status(true,false);
  this.seen.add(frame.seq);this.frames++;
  const c=frame.seq<this.k?(()=>{const v=new Uint8Array(Math.ceil(this.k/8));v[frame.seq>>3]=1<<(frame.seq&7);return v})():repairCoefficients(this.id,frame.seq,this.k);
  const d=frame.block.slice();
  for(let i=0;i<this.k;i++){
   if(!(c[i>>3]&(1<<(i&7))))continue;
   const pivot=this.pivots.get(i);
   if(!pivot){this.pivots.set(i,{c,d});if(this.pivots.size===this.k)this.finish();return status(false,true)}
   for(let j=i>>3;j<c.length;j++)c[j]^=pivot.c[j];
   for(let j=0;j<d.length;j++)d[j]^=pivot.d[j];
  }
  return status(false,false);
 }
 private finish(){
  for(let i=this.k-1;i>=0;i--){
   const row=this.pivots.get(i)!;
   for(let m=i+1;m<this.k;m++){if(row.c[m>>3]&(1<<(m&7))){const other=this.pivots.get(m)!;for(let j=0;j<row.d.length;j++)row.d[j]^=other.d[j]}}
  }
  const out=new Uint8Array(this.length);
  for(let i=0;i<this.k;i++){const row=this.pivots.get(i)!.d;out.set(row.subarray(0,Math.min(this.blockSize,this.length-i*this.blockSize)),i*this.blockSize)}
  if(hex(transferId(out))!==hex(this.id)){this.pivots.clear();this.seen.clear();this.frames=0;throw Error('This QR transfer failed its integrity check. Keep scanning to retry.')}
  this.result=out;this.pivots.clear();
 }
}

/**
 * Tracks concurrent transfers by id. A receiver can drift between scouts' phones and return
 * to one without losing progress, and a finished transfer stays recognised so replays do nothing.
 */
export class FountainCollector{
 private active=new Map<string,FountainDecoder>();
 private finished=new Set<string>();
 constructor(private maxActive=6){}
 accept(text:string):{decoder:FountainDecoder|null;step:DecodeStep|null;alreadyFinished:boolean}{
  const frame=parseFrame(text);
  if(this.finished.has(frame.key))return {decoder:null,step:null,alreadyFinished:true};
  let decoder=this.active.get(frame.key);
  if(!decoder){
   decoder=new FountainDecoder(frame);
   if(this.active.size>=this.maxActive){const oldest=this.active.keys().next().value;if(oldest)this.active.delete(oldest)}
   this.active.set(frame.key,decoder);
  }
  return {decoder,step:decoder.accept(frame),alreadyFinished:false};
 }
 /** Call only after the data is durably saved, so a failed save can be scanned again. */
 markSaved(key:string){this.active.delete(key);this.finished.add(key)}
 forget(key:string){this.active.delete(key)}
 reset(){this.active.clear();this.finished.clear()}
}
