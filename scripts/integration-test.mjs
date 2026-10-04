import {_electron as electron,chromium,expect} from '@playwright/test';
import {mkdtemp,readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=await mkdtemp(path.join(tmpdir(),'companion-integration-'));await mkdir(path.join(dir,'profile'));
const env={...process.env,COMPANION_TEST_DATA:path.join(dir,'profile')};delete env.ELECTRON_RUN_AS_NODE;
const application=await electron.launch({args:process.env.COMPANION_EXECUTABLE?[]:['.'],executablePath:process.env.COMPANION_EXECUTABLE,env});let browser;
try{
  const page=await application.firstWindow();await page.waitForFunction(()=>!!window.companion);
  const data='BT /F1 18 Tf 60 700 Td (Hello PDF Companion) Tj ET';
  const tail='BT /F1 18 Tf 60 700 Td (Final Page Marker) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${data.length} >>\nstream\n${data}\nendstream`,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',`<< /Length ${tail.length} >>\nstream\n${tail}\nendstream`];
  let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const pdfPath=path.join(dir,'sample.pdf');await writeFile(pdfPath,pdf);
  await application.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},pdfPath);
  const imported=await page.evaluate(()=>window.companion.action('pdf-import'));assert(!imported?.error,imported?.error);assert.equal(imported.pages,2);
  const snapshot=(await page.evaluate(()=>window.companion.state())).context;assert.equal(snapshot.source_type,'pdf');assert.match(snapshot.content_excerpt,/Hello PDF Companion/);
  await page.evaluate(()=>window.companion.action('open','chat'));const panel=application.windows().find(p=>p.url().includes('view=panel'));await panel.waitForSelector('#messageInput');
  await panel.waitForSelector('#guideDone');await panel.locator('#guideDone').click();
  const consent=panel.evaluate(()=>window.companion.action('settings',{contextSend:true}));await panel.waitForSelector('#confirmAccept');await panel.locator('#confirmAccept').click();await consent;
  assert.match((await panel.evaluate(()=>window.companion.state())).context.content_excerpt,/Hello PDF Companion/);
  assert(snapshot.full_document);assert.match(snapshot.content_excerpt,/Final Page Marker/);
  await panel.locator('#sourcePreview').click();await panel.waitForSelector('#sourceDone');assert.equal(await panel.locator('#pdfPage').count(),0);await panel.locator('#sourceDone').click();
  await page.evaluate(()=>window.companion.action('settings',{browserPermission:true}));const pair=(await page.evaluate(()=>window.companion.state())).pairing;
  const ext=path.join(dir,'extension');await cp('browser-extension',ext,{recursive:true});const manifest=JSON.parse(await readFile(path.join(ext,'manifest.json'),'utf8'));
  // Test-only host grant in an isolated browser profile, not shipped in the extension.
  manifest.host_permissions.push('https://example.com/*');await writeFile(path.join(ext,'manifest.json'),JSON.stringify(manifest));
  browser=await chromium.launchPersistentContext(path.join(dir,'browser'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
  const worker=browser.serviceWorkers()[0]??await browser.waitForEvent('serviceworker');await worker.evaluate(p=>chrome.storage.session.set(p),pair);
  const web=await browser.newPage();await web.route('https://example.com/learn',route=>route.fulfill({contentType:'text/html',body:'<!DOCTYPE html><title>Learning fixture</title><article><h1>A learning article</h1><p>'+('Photosynthesis converts light into energy. '.repeat(40))+'</p></article><form><input type="password" value="must-not-collect"></form>'}));await web.goto('https://example.com/learn');
  await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({url:'https://example.com/learn'});await chrome.scripting.executeScript({target:{tabId:tabs[0].id},files:['content.js']});await chrome.tabs.sendMessage(tabs[0].id,{type:'companion:start',watch:false});});
  await expect.poll(()=>page.evaluate(async()=>(await window.companion.state()).context?.source_type),{timeout:10000}).toBe('web');
  const context=(await page.evaluate(()=>window.companion.state())).context;assert.match(context.content_excerpt,/Photosynthesis/);assert(!context.content_excerpt.includes('must-not-collect'));
  await page.evaluate(()=>window.companion.action('context-revoke'));assert.equal((await page.evaluate(()=>window.companion.state())).context,null);
  console.log('PASS: real PDF file extraction on Windows worker; unpacked MV3 extension + actual Chrome service worker + loopback + Readability on an explicitly labelled fixture page; permission revocation.');
}finally{await browser?.close();await application.close();}
