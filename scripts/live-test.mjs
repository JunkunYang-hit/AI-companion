// Uses an environment credential; never reads a key from the repository or prints responses/headers.
import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
if(!process.env.AI_COMPANION_API_KEY||!process.env.COMPANION_MODEL)throw new Error('Set credential and a verified model ID in the process environment.');
const env={...process.env,COMPANION_TEST_DATA:await mkdtemp(path.join(tmpdir(),'companion-live-')),COMPANION_LIVE_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
const application=await electron.launch({args:['.'],env,timeout:30000});
try{
  const page=await application.firstWindow();await page.waitForFunction(()=>!!window.companion);
  await page.evaluate(()=>window.companion.action('settings',{provider:'deepseek',maxOutputTokens:64,backgroundAI:false}));
  const response=await page.evaluate(()=>window.companion.action('chat','我学习时喜欢先看简单例子。请只回复“记住啦”。'));assert(!response?.error);
  await expect.poll(()=>page.evaluate(async()=>!(await window.companion.state()).busy),{timeout:70000}).toBe(true);
  const m=await page.evaluate(()=>window.companion.memory());const usage=m.usage[0];
  assert.equal(usage.status,'done');assert.equal(usage.source,'provider');assert(usage.input>0&&usage.output>0);
  assert.equal(typeof usage.cost,'number');assert(usage.cost>0);
  const history=await page.evaluate(()=>window.companion.history());assert(history.some(r=>r.role==='assistant'&&r.content.length>0));
  await page.evaluate(()=>window.companion.action('end-session'));
  const update=await page.evaluate(()=>window.companion.action('memory-update'));assert(!update?.error,update?.error);assert(update.updated);
  await expect.poll(()=>page.evaluate(async()=>(await window.companion.memory()).queue.length),{timeout:90000}).toBe(0);
  const memory=await page.evaluate(()=>window.companion.memory());assert(memory.facts.some(f=>f.content.includes('例子')));assert(memory.facts.every(f=>f.source_session&&f.source_message));
  assert(memory.usage.some(r=>r.kind==='summary'&&r.status==='done'&&r.cost>0));
  console.log(JSON.stringify({test:'DeepSeek Windows streaming, CNY estimate and automatic source-linked memory',result:'PASS',model:usage.model,requests:memory.usage.length,input:memory.usage.reduce((n,r)=>n+(r.input??0),0),output:memory.usage.reduce((n,r)=>n+(r.output??0),0),costEstimateCNY:memory.usage.reduce((n,r)=>n+(r.cost??0),0)}));
}finally{await application.close();}
