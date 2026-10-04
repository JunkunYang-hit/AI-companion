import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {defaults} from '../src/shared/types';
import {sensitive,redact,sanitizeUrl} from '../src/privacy/content';
import {ProactivePolicy} from '../src/companion/policy';
import {Budget,costOf} from '../src/costs/budget';
import {officialPrices,applyOfficialPrices} from '../src/costs/pricing';
import {sse,stream} from '../src/providers/stream';
import {safeEntry,inspectZip} from '../src/characters/package';
import {validateSnapshot,ContextBridge} from '../src/context/bridge';
import {Store} from '../src/memory/store';
import {zipSync,strToU8} from 'fflate';
test('sensitive content is filtered and URLs lose secrets',()=>{
  assert(sensitive('密码: secret'));assert(sensitive('身份证号：12345678901234567X'));
  assert(!redact('password: secret').includes('secret'));
  assert.equal(sanitizeUrl('https://x.test/read?p=2&token=secret#secret'),'https://x.test/read?p=2');assert.equal(sanitizeUrl('javascript:alert(1)'),null);
});
test('proactive rules, nonresponse cooldown, shared learning budget and throttling',()=>{
  const p=new ProactivePolicy(),now=200*3600_000,s={...defaults,backgroundAI:true};const flags={hidden:false,fullscreen:false,busy:false,key:true,learning:true,review:true};
  assert(p.allow(s,flags,'review',now));assert(!p.allow({...s,dnd:true},flags,'review',now));assert(!p.allow(s,{...flags,fullscreen:true},'review',now));assert(!p.allow(s,{...flags,busy:true},'review',now));
  p.mark('review',now);assert(!p.allow(s,flags,'idle',now+30*60_000));p.mark('break',now+25*60_000);assert(!p.allow(s,flags,'review',now+46*60_000));
  assert(p.allow(s,flags,'review',now+70*60_000));assert(p.click(now));assert(!p.click(now+100));
});
test('budget reservations prevent concurrent and unknown price overspend',()=>{
  const b=new Budget(),s={...defaults};const release=b.reserve(s,false,[],100);assert.throws(()=>b.reserve(s,false,[],100));release();
  assert.throws(()=>b.reserve({...s,dailyBudget:1},false,[],100));assert.equal(costOf({input:10,output:10,cached:null,source:'provider'},s),null);
});
test('study consent allows review without enabling idle chatter, and custom frequency respects its limits',()=>{
  const now=200*3600_000,flags={hidden:false,fullscreen:false,busy:false,key:true,learning:true,review:true};const p=new ProactivePolicy();
  assert(p.allow(defaults,flags,'review',now));assert(!p.allow(defaults,flags,'idle',now));assert(!p.allow(defaults,{...flags,learning:false},'review',now));assert(!p.allow({...defaults,dnd:true},flags,'review',now));
  const custom={...defaults,mode:'custom' as const,backgroundAI:true,proactiveHourlyLimit:4,proactiveInterval:35};p.mark('review',now);assert(!p.allow(custom,{...flags,learning:false},'idle',now+30*60_000));assert(p.allow(custom,{...flags,learning:false},'idle',now+36*60_000));assert(!new ProactivePolicy().allow({...custom,proactiveHourlyLimit:0},flags,'review',now));
});
test('SSE parser tolerates fragmented UTF8/CRLF and multiline data',async()=>{
  const raw=new TextEncoder().encode('event: message\r\ndata: {"text":"你好"}\r\n\r\ndata: [DONE]\n\n');
  const body=new ReadableStream<Uint8Array>({start(c){for(const b of raw)c.enqueue(new Uint8Array([b]));c.close();}});
  const events=[];for await(const e of sse(body,new AbortController().signal))events.push(e);assert.equal(events[0].data,'{"text":"你好"}');assert.equal(events[1].data,'[DONE]');
});
test('mock cancellation and offline errors are explicit',async()=>{
  const c=new AbortController();c.abort();await assert.rejects(async()=>{for await(const _ of stream({provider:'mock',baseUrl:'',model:'',key:'',maxTokens:300},[{role:'user',content:'hello'}],c.signal)){}});
  await assert.rejects(async()=>{for await(const _ of stream({provider:'mock',baseUrl:'',model:'',key:'',maxTokens:300},[{role:'user',content:'[断网]'}],new AbortController().signal)){}});
});
test('ZIP rejects traversal and does not accept script paths',()=>{
  assert(!safeEntry('../evil'));assert(!safeEntry('C:/evil'));assert(!safeEntry('a\\evil'));
  assert.throws(()=>inspectZip(zipSync({'../evil':strToU8('x')})));
});
test('context contracts do not invent missing subtitle or playback data',()=>{
  const c=validateSnapshot({source_type:'bilibili',source_id:'BVtest',title:'标题',sanitized_url:'https://www.bilibili.com/video/BVtest?token=secret',is_foreground:false});
  assert.equal(c.content_excerpt,null);assert.equal(c.position,null);assert.equal(c.confidence,'unavailable');assert(!c.sanitized_url!.includes('secret'));
});
test('SQLite delete cascades through derived facts and summary; failed summaries retain originals',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'companion-store-'));const store=new Store(dir);await store.init(path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  const m=store.add('user','喜欢简短回复',defaults)!;store.endSession(defaults.characterId);const job=store.nextSummary();
  store.db.run('INSERT INTO summaries VALUES (?,?,?,?)',[m.session_id,m.character_id,'derived text',Date.now()]);
  store.db.run('INSERT INTO facts VALUES (?,?,?,?,?,?,?,?,?)',['fact','shared','preference','derived fact',m.session_id,m.id,1,Date.now(),null]);
  store.forget(m.id,m.character_id);assert.equal(store.summaries(m.character_id).length,0);assert.equal(store.facts(m.character_id).length,0);
  store.completeSummary(job,JSON.stringify({summary:'stale summary',facts:[]}));assert.equal(store.summaries(m.character_id).length,0);
  const old=store.add('user','a new message',defaults)!;store.db.run('UPDATE messages SET created_at=? WHERE id=?',[Date.now()-9*86400_000,old.id]);store.endSession(defaults.characterId);
  assert.throws(()=>store.completeSummary(store.nextSummary(),'invalid JSON'));assert(store.history(defaults.characterId).some(v=>v.id===old.id));
  const count=store.history(defaults.characterId).length;assert.equal(store.add('user','password: secret',defaults),null);assert.equal(store.history(defaults.characterId).length,count);store.close();
});
test('usage persists exact returned tokens and retains unknown prices',async()=>{
  const store=new Store(mkdtempSync(path.join(tmpdir(),'companion-usage-')));await store.init(path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  store.recordUsage(defaults,'chat',{input:10,output:20,cached:5,source:'provider'},'done');
  const r=store.usageRecords()[0];assert.equal(r.input,10);assert.equal(r.output,20);assert.equal(r.cost,null);store.close();
});
test('loopback rejects wrong origin, wrong token and revoked permission',async()=>{
  const bridge=new ContextBridge();let allowed=true,received=0;await bridge.start(()=>allowed,()=>received++);
  const url=`http://127.0.0.1:${bridge.port}/context`,payload={source_type:'web',source_id:'a',title:'A',sanitized_url:'https://example.com/',is_foreground:true};
  try {
    const send=(origin:string,token:string)=>fetch(url,{method:'POST',headers:{Origin:origin,'X-Companion-Token':token,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    assert.equal((await send('https://evil.example',bridge.token)).status,403);
    assert.equal((await send('chrome-extension://'+'a'.repeat(32),'bad')).status,403);
    assert.equal((await send('chrome-extension://'+'a'.repeat(32),bridge.token)).status,204);assert.equal(received,1);
    allowed=false;assert.equal((await send('chrome-extension://'+'a'.repeat(32),bridge.token)).status,403);
  } finally {bridge.close();}
});
test('automatic memories require user evidence, protect edits, and retain deletion lineage across updates',async()=>{
  const store=new Store(mkdtempSync(path.join(tmpdir(),'companion-auto-memory-')));await store.init(path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  const original=store.add('user','我喜欢先看简单例子',defaults)!;store.endSession(defaults.characterId);const first=store.nextSummary();
  store.completeSummary(first,JSON.stringify({summary:'偏好简单例子',facts:[{content:'喜欢先看简单例子',category:'preference',source_message:original.id,evidence:'喜欢先看简单例子'},{content:'喜欢游戏',source_message:original.id,evidence:'不存在的原话'}]}));
  assert.equal(store.facts(defaults.characterId).length,1);const fact=store.facts(defaults.characterId)[0];
  const change=store.add('user','现在我喜欢先看公式',defaults)!;store.endSession(defaults.characterId);
  store.completeSummary(store.nextSummary(),JSON.stringify({summary:'偏好公式',facts:[{content:'喜欢先看公式',replace_id:fact.id,source_message:change.id,evidence:'喜欢先看公式'}]}));
  assert.equal(store.facts(defaults.characterId)[0].content,'喜欢先看公式');
  store.forget(original.id,defaults.characterId);assert.equal(store.facts(defaults.characterId).length,0);assert.equal(store.summaries(defaults.characterId).length,0);
  const edited=store.add('user','我喜欢短回答',defaults)!;store.endSession(defaults.characterId);store.completeSummary(store.nextSummary(),JSON.stringify({summary:'短回答',facts:[{content:'喜欢短回答',source_message:edited.id,evidence:'喜欢短回答'}]}));
  const protectedFact=store.facts(defaults.characterId)[0];store.saveFact('由用户编辑的偏好',defaults.characterId,protectedFact.id);
  const later=store.add('user','我喜欢详细回答',defaults)!;store.endSession(defaults.characterId);store.completeSummary(store.nextSummary(),JSON.stringify({summary:'详细回答',facts:[{content:'喜欢详细回答',replace_id:protectedFact.id,source_message:later.id,evidence:'喜欢详细回答'}]}));assert.equal(store.facts(defaults.characterId)[0].content,'由用户编辑的偏好');store.close();
});
test('long sessions are summarized in batches without dropping messages',async()=>{
  const store=new Store(mkdtempSync(path.join(tmpdir(),'companion-batch-')));await store.init(path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  for(let i=0;i<15;i++)store.add('user','普通消息'+i,defaults);store.endSession(defaults.characterId);const job=store.nextSummary();store.completeSummary(job,JSON.stringify({summary:'第一批摘要',facts:[]}));assert(store.nextSummary());assert.equal(store.summaryMessages(job.session_id).length,3);store.completeSummary(store.nextSummary(),JSON.stringify({summary:'完整摘要',facts:[]}));assert.equal(store.nextSummary(),undefined);assert.equal(store.history(defaults.characterId).length,15);store.close();
});
test('pruning does not erase an old session while some summary batches remain',async()=>{
  const store=new Store(mkdtempSync(path.join(tmpdir(),'companion-prune-')));await store.init(path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  for(let i=0;i<15;i++)store.add('user','旧消息'+i,defaults);store.db.run('UPDATE messages SET created_at=?',[Date.now()-9*86400_000]);store.endSession(defaults.characterId);store.completeSummary(store.nextSummary(),JSON.stringify({summary:'部分摘要',facts:[]}));store.prune();assert.equal(store.history(defaults.characterId).length,15);store.completeSummary(store.nextSummary(),JSON.stringify({summary:'完成摘要',facts:[]}));assert.equal(store.history(defaults.characterId).length,0);store.close();
});
test('official CNY quotes are bounded by endpoint/model/date and cached input is priced separately',()=>{
  const s={...defaults,model:'deepseek-flash'};Object.assign(s,officialPrices(s,Date.UTC(2026,9,1)));assert.equal(costOf({input:1000000,output:0,cached:500000,source:'provider'},s),1.02);
  assert.equal(officialPrices({...s,baseUrl:'https://untrusted.test'},Date.UTC(2026,9,1)),null);assert.equal(officialPrices({...s,model:'unknown'},Date.UTC(2026,9,1)),null);assert.equal(officialPrices(s,Date.UTC(2026,10,2)),null);
  const manual={...s,inputPrice:7,priceSource:'manual'};applyOfficialPrices(manual);assert.equal(manual.inputPrice,7);
});
