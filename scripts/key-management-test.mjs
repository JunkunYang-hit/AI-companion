import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const directory=await mkdtemp(path.join(process.env.TEMP??'test-results/tmp','keys-'));
const env={...process.env,COMPANION_TEST_DATA:directory};
delete env.ELECTRON_RUN_AS_NODE;
const launch=()=>electron.launch({args:process.env.COMPANION_EXECUTABLE?[]:['.'],executablePath:process.env.COMPANION_EXECUTABLE,env});
let app=await launch();
try{
  let page=await app.firstWindow();await page.waitForFunction(()=>window.companion);
  for(const provider of ['mock','deepseek'])await page.evaluate(provider=>window.companion.action('settings',{provider,apiKey:'fixture-private-value',backgroundAI:false}),provider);
  assert.deepEqual((await page.evaluate(()=>window.companion.state())).keyProviders.sort(),['deepseek','mock']);
  assert(!(await page.evaluate(async()=>JSON.stringify(await window.companion.state()))).includes('fixture-private-value'));
  assert(!(await readFile(path.join(directory,'credentials-v2.bin'))).includes(Buffer.from('fixture-private-value')));
  await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.companion);
  assert.deepEqual((await page.evaluate(()=>window.companion.state())).keyProviders.sort(),['deepseek','mock']);
  assert((await page.evaluate(()=>window.companion.state())).credentialConfigured);
  await page.evaluate(()=>window.companion.action('open','model'));
  const panel=app.windows().find(p=>p.url().includes('view=panel'));
  if(await panel.locator('#guideDone').count())await panel.locator('#guideDone').evaluate(el=>el.click());
  await panel.locator('#saveModel').evaluate(el=>el.click());await expect(panel.locator('#apiKey')).toHaveValue('');await panel.locator('#modalClose').evaluate(el=>el.click());
  for(const provider of ['deepseek','mock']){const deleting=panel.evaluate(provider=>window.companion.action('key-delete',provider),provider);await panel.locator('#confirmAccept').evaluate(el=>el.click());assert.equal(await deleting,true);}
  assert.deepEqual((await panel.evaluate(()=>window.companion.state())).keyProviders,[]);
  assert(!(await panel.evaluate(()=>window.companion.state())).credentialConfigured);
  console.log('PASS: provider keys survive restart, encrypted storage contains no plaintext, UI never returns or fills saved keys, both provider keys can be deleted.');
}finally{await app.close();}
