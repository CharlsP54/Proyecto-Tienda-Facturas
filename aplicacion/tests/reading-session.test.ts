import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadingSession,DraftHistory} from '../lib/reading-session.ts';
test('cancelar invalida un resultado tardío y terminar el trabajo anterior no termina el nuevo',()=>{
 const session=new ReadingSession(),first=session.begin();assert.equal(first.isCurrent(),true);session.cancel();assert.equal(first.signal.aborted,true);assert.equal(first.isCurrent(),false);const next=session.begin();first.finish();assert.equal(next.isCurrent(),true);next.finish();
});
test('deshacer y rehacer conservan copias, acotan memoria y descartan la rama futura al editar',()=>{
 const history=new DraftHistory<{value:string}>(2);const original={value:'original'};history.remember(original);original.value='cambio fuera';history.remember({value:'segundo'});history.remember({value:'tercero'});
 assert.deepEqual(history.undo({value:'actual'}),{value:'tercero'});assert.deepEqual(history.undo({value:'tercero'}),{value:'segundo'});assert.equal(history.undo({value:'segundo'}),null);assert.deepEqual(history.redo({value:'segundo'}),{value:'tercero'});history.remember({value:'nuevo'});assert.equal(history.canRedo,false);history.reset();assert.equal(history.canUndo,false);
});
