import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Store} from '../src/memory/store';
import {defaults} from '../src/shared/types';
import {ConversationClock,sessionIdleLimit} from '../src/companion/session';
import {memoryUpdateDue,memoryAutoInterval} from '../src/memory/batch';
test('session idle boundary is twelve hours and activity extends it',()=>{
 const clock=new ConversationClock(100);assert(!clock.expired(100+sessionIdleLimit-1));assert(clock.expired(100+sessionIdleLimit));clock.touch(100+sessionIdleLimit);assert(!clock.expired(200+sessionIdleLimit));
 assert(!memoryUpdateDue(100,100+memoryAutoInterval-1));assert(memoryUpdateDue(100,100+memoryAutoInterval));
});
test('whole session memory batch, manual editor, capacity and deletion lineage',async()=>{
 const store=new Store(mkdtempSync(path.join(tmpdir(),'whole-memory-')));await store.init(path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
 try{
  const first=store.add('user','我喜欢蓝色',defaults)!;for(let i=0;i<25;i++)store.add('assistant','回答'+i,defaults);
  assert.equal(store.memoryBatch(defaults.characterId),null);store.endSession(defaults.characterId);
  const second=store.add('user','我喜欢安静',defaults)!;store.endSession(defaults.characterId);
  const batch=store.memoryBatch(defaults.characterId)!;assert.equal(batch.sessions.length,2);assert.equal(batch.sessions[0].messages.length,26);
  store.completeMemoryUpdate(batch,JSON.stringify({sessions:batch.sessions.map((s:any)=>({session_id:s.session_id,summary:'完整会话'})),add:[{content:'喜欢蓝色',source_message:first.id,evidence:'我喜欢蓝色'},{content:'喜欢安静',source_message:second.id,evidence:'我喜欢安静'}],update:[],delete:[]}));
  assert.equal(store.facts(defaults.characterId).length,2);assert(store.memoryLastUpdate(defaults.characterId)>0);assert.equal(store.memoryBatch(defaults.characterId),null);
  assert.throws(()=>store.saveMemoryText('字'.repeat(6001),defaults.characterId));assert.equal(store.facts(defaults.characterId).length,2);
  store.saveMemoryText('喜欢蓝色\n\n希望每天读书',defaults.characterId);assert(store.facts(defaults.characterId).some(f=>f.content==='希望每天读书'&&f.confirmed));assert.equal(store.rows('SELECT * FROM summaries WHERE session_id=?',[second.session_id]).length,0);
  store.recoverSummaries();assert.equal(store.memoryBatch(defaults.characterId),null);
  const current=store.add('user','希望每天读书',defaults)!;const manual=store.memoryBatch(defaults.characterId,true)!;assert.equal(manual.sessions[0].session_id,current.session_id);
  store.saveMemoryText('喜欢蓝色',defaults.characterId);assert.throws(()=>store.completeMemoryUpdate(manual,JSON.stringify({sessions:[{session_id:current.session_id,summary:'新的会话'}],add:[],update:[],delete:[]})));
 }finally{store.close();}
});
