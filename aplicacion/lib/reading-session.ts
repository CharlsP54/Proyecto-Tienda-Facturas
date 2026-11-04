/** Un trabajo vigente: cancelar invalida también cualquier resultado que llegue tarde. */
export class ReadingSession {
 private generation=0;
 private controller:AbortController|null=null;
 begin(){this.cancel();const controller=new AbortController();this.controller=controller;const generation=this.generation;return {signal:controller.signal,isCurrent:()=>this.generation===generation&&!controller.signal.aborted,finish:()=>{if(this.generation===generation)this.controller=null;}};}
 cancel(){this.generation++;this.controller?.abort();this.controller=null;}
}
export async function timedFetch(input:RequestInfo|URL,init:RequestInit={},milliseconds=45000):Promise<Response>{
 const timeout=AbortSignal.timeout(milliseconds);try{return await fetch(input,{...init,signal:init.signal?AbortSignal.any([init.signal,timeout]):timeout});}
 catch(e){if(timeout.aborted)throw new Error('La conexión tardó demasiado. Conservamos tu borrador; vuelve a intentar cuando tengas conexión.');throw e;}
}
/** Historial acotado del borrador; nunca modifica una compra confirmada. */
export class DraftHistory<T>{
 private past:T[]=[];private future:T[]=[];
 private limit:number;constructor(limit=30){this.limit=limit;}
 reset(){this.past=[];this.future=[];}
 remember(value:T){this.past.push(structuredClone(value));if(this.past.length>this.limit)this.past.shift();this.future=[];}
 undo(current:T):T|null{const next=this.past.pop();if(next===undefined)return null;this.future.push(structuredClone(current));return next;}
 redo(current:T):T|null{const next=this.future.pop();if(next===undefined)return null;this.past.push(structuredClone(current));return next;}
 get canUndo(){return this.past.length>0;}get canRedo(){return this.future.length>0;}
}
