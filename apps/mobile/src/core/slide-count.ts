/** Points of horizontal travel per counted ball when sliding across a score tile. */
export const SLIDE_STEP=12;
/** Movement below this is a tap, not a slide. */
export const SLIDE_START=8;

/** How much a slide of dx points changes a count, never below zero. */
export function slideDelta(dx:number,value:number){
 if(Math.abs(dx)<SLIDE_START)return 0;
 return Math.max(-value,Math.trunc(dx/SLIDE_STEP));
}
