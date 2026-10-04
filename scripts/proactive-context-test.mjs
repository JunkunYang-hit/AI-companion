import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const env={...process.env,COMPANION_TEST_DATA:await mkdtemp(path.join(tmpdir(),'proactive-context-'))};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:process.env.COMPANION_EXECUTABLE?[]:['.'],executablePath:process.env.COMPANION_EXECUTABLE,env});
const proposal='想和我聊聊你最近看的那本书吗？【主动话题】';
try{
 const first=await app.firstWindow();await first.waitForFunction(()=>window.companion);await first.evaluate(()=>window.companion.action('open','chat'));const panel=app.windows().find(p=>p.url().includes('view=panel'));await panel.waitForSelector('#guideDone');await panel.locator('#guideDone').click();
 await app.evaluate(({},proposal)=>{globalThis.__requests=[];globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);globalThis.__requests.push(body.messages);let answer=body.messages.at(-1).content.includes('主动打个招呼')?proposal:'接着讨论刚才的话题。';try{const job=JSON.parse(body.messages.at(-1).content);if(job.sessions)answer=JSON.stringify({sessions:job.sessions.map(s=>({session_id:s.session_id,summary:s.messages.map(m=>(m.role==='assistant'?'伙伴：':'用户：')+m.content).join('；').slice(0,200)})),add:[],update:[],delete:[]});}catch{}return new Response('data: '+JSON.stringify({choices:[{delta:{content:answer}}],usage:{prompt_tokens:20,completion_tokens:20}})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});};},proposal);
 await panel.evaluate(()=>window.companion.action('settings',{provider:'custom',baseUrl:'https://fixture.invalid/v1',model:'fixture',apiKey:'fixture-private-value',backgroundAI:true,mode:'custom',proactiveInterval:180,saveHistory:false,walking:false}));
 assert.equal(await panel.evaluate(()=>window.companion.action('proactive-preview')),'done');assert.equal((await panel.evaluate(()=>window.companion.history())).length,0);
 const reply=async()=>{await panel.evaluate(()=>window.companion.action('chat','继续你刚才提出的话题。'));await expect.poll(()=>panel.evaluate(async()=>!(await window.companion.state()).busy)).toBe(true);return app.evaluate(()=>globalThis.__requests.at(-1));};
 let sent=await reply();assert.equal(sent.filter(m=>m.role==='assistant'&&m.content===proposal).length,1);assert.equal((await panel.evaluate(()=>window.companion.history())).length,0);
 await panel.evaluate(()=>window.companion.action('settings',{saveHistory:true}));sent=await reply();assert.equal(sent.filter(m=>m.content===proposal).length,1);assert(sent.findIndex(m=>m.content===proposal)<sent.findIndex(m=>m.content==='接着讨论刚才的话题。'));
 await panel.evaluate(()=>window.companion.action('end-session'));assert.equal(await panel.evaluate(()=>window.companion.action('proactive-preview')),'done');sent=await reply();assert.equal(sent.filter(m=>m.content===proposal).length,1);
 await panel.evaluate(()=>window.companion.action('memory-update'));assert((await panel.evaluate(()=>window.companion.memory())).summaries.some(s=>s.content.includes(proposal)));
 await panel.evaluate(()=>window.companion.action('character-select','builtin-momo'));sent=await reply();assert(!sent.some(m=>m.content===proposal));await panel.evaluate(()=>window.companion.action('character-select','default-xiaoqi'));
 await app.evaluate(()=>globalThis.__companionTest.conversationClock.lastActivity=Date.now()-13*3600_000);assert.equal(await panel.evaluate(()=>window.companion.action('proactive-preview')),'done');const session=(await panel.evaluate(()=>window.companion.state())).sessionId;sent=await reply();assert.equal((await panel.evaluate(()=>window.companion.state())).sessionId,session);assert.equal(sent.filter(m=>m.content===proposal).length,1);
 const question=(await panel.evaluate(()=>window.companion.history())).findLast(m=>m.role==='assistant'&&m.content===proposal);assert(question);await panel.evaluate(id=>window.companion.action('forget',id),question.id);sent=await reply();assert(!sent.some(m=>m.content===proposal));
 console.log('PASS: actual provider request fixture retains proactive topics with history off/on/toggled, no duplicate turns, summary preserves assistant topic, role/session/deletion isolation and expired-session proactive reply continuity; no paid calls.');
}finally{await app.close();}
