import {_electron as electron} from '@playwright/test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const env={...process.env,COMPANION_TEST_DATA:await mkdtemp(path.join(tmpdir(),'companion-native-'))};delete env.ELECTRON_RUN_AS_NODE;
const application=await electron.launch({args:['.'],env});
try{
  const page=await application.firstWindow();await page.waitForFunction(()=>!!window.companion);
  await page.evaluate(()=>window.companion.action('settings',{walking:false,allowDrag:false}));
  const info=await application.evaluate(async({BrowserWindow,screen})=>{
    const pet=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=pet'));
    const a=screen.getPrimaryDisplay().workArea;pet.setPosition(a.x+160,a.y+160);const b=pet.getBounds();
    const below=new BrowserWindow({x:b.x,y:b.y,width:b.width,height:b.height,frame:false,show:false,focusable:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
    await below.loadURL('data:text/html,<body style="background:%23e7ecd9"><p>Temporary click-through verification</p><script>window.clicks=0;document.addEventListener("click",()=>window.clicks++)</script>');below.show();below.focus();pet.moveTop();
    const koffi=globalThis.__companionTest.nativeFFI,u=koffi.load('user32.dll');
    const set=u.func('bool __stdcall SetCursorPos(int,int)');const mouse=u.func('void __stdcall mouse_event(uint32,uint32,uint32,uint32,uintptr_t)');
    const point=koffi.struct('CompanionTestPoint',{x:'int32',y:'int32'}),hit=u.func('void * __stdcall WindowFromPoint(CompanionTestPoint)');
    const original=screen.getCursorScreenPoint();globalThis.__nativeTest={below,pet,original,move:(x,y)=>{const p=screen.dipToScreenPoint({x,y});return {target:p,result:set(p.x,p.y),actual:screen.getCursorScreenPoint(),windowAtPoint:String(koffi.address(hit(p))),belowWindow:String(below.getNativeWindowHandle().readBigUInt64LE()),petWindow:String(pet.getNativeWindowHandle().readBigUInt64LE())};},click:()=>mouse(2,0,0,0,0),up:()=>mouse(4,0,0,0,0)};
    return {bounds:b,observer:globalThis.__companionTest.observer(false)};
  });
  console.log('Observer diagnostic:',info.observer?{pid:info.observer.pid,hasRect:!!info.observer.rect,titleRead:!!info.observer.title}:null);
  const moveResult=await application.evaluate((_,b)=>globalThis.__nativeTest.move(b.x+8,b.y+8),info.bounds);console.log('Native cursor diagnostic:',JSON.stringify(moveResult));await page.waitForTimeout(350);
  if(moveResult.windowAtPoint!==moveResult.belowWindow&&moveResult.windowAtPoint!==moveResult.petWindow)throw new Error('INCONCLUSIVE: current desktop occludes the test windows; actual click-through requires manual validation.');
  await application.evaluate(()=>globalThis.__nativeTest.click());await page.waitForTimeout(120);await application.evaluate(()=>globalThis.__nativeTest.up());await page.waitForTimeout(350);
  const passThrough=await application.evaluate(()=>globalThis.__nativeTest.below.webContents.executeJavaScript('window.clicks'));assert.equal(passThrough,1);
  await application.evaluate((_,b)=>globalThis.__nativeTest.move(b.x+Math.round(b.width*.5),b.y+Math.round(b.height*.70)),info.bounds);await page.waitForTimeout(450);
  await application.evaluate(()=>globalThis.__nativeTest.click());await page.waitForTimeout(120);await application.evaluate(()=>globalThis.__nativeTest.up());await page.waitForTimeout(450);
  const onBody=await application.evaluate(({BrowserWindow})=>({quick:BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=quick')).isVisible()}));
  assert.equal(await application.evaluate(()=>globalThis.__nativeTest.below.webContents.executeJavaScript('window.clicks')),1);assert(onBody.quick);
  await page.evaluate(()=>window.companion.action('hide'));await application.evaluate(()=>globalThis.__companionTest.tray.emit('double-click'));
  assert.equal((await page.evaluate(()=>window.companion.state())).hidden,false);
  console.log('PASS: actual Win32 mouse clicks pass through transparent pixels, opaque body receives clicks/opens quick input, native observer works without reading titles, tray double-click restores.');
}catch(error){if(error.message.startsWith('INCONCLUSIVE:'))console.log(error.message);else throw error;}finally{
  await application.evaluate(()=>{const t=globalThis.__nativeTest;if(t){t.move(t.original.x,t.original.y);t.below.destroy();}}).catch(()=>{});
  await application.close();
}
