chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message?.type!=='companion:snapshot'||sender.id!==chrome.runtime.id||!sender.tab?.id||sender.tab.incognito)return;
  (async()=>{
    const pair=await chrome.storage.session.get(['port','token']);if(!pair.port||!pair.token)return {ok:false};
    const tab=await chrome.tabs.get(sender.tab.id);const win=await chrome.windows.get(tab.windowId);
    const source=message.snapshot;if(!source||typeof source!=='object')return {ok:false};
    // Use the browser's actual tab URL, not an arbitrary URL supplied by page text.
    if(!tab.url?.startsWith('https://'))return {ok:false};
    source.sanitized_url=tab.url;source.is_foreground=tab.active&&win.focused&&source.is_foreground===true;
    const response=await fetch(`http://127.0.0.1:${pair.port}/context`,{method:'POST',headers:{'Content-Type':'application/json','X-Companion-Token':pair.token},body:JSON.stringify(source),signal:AbortSignal.timeout(4000)});
    return {ok:response.ok};
  })().then(respond).catch(()=>respond({ok:false}));return true;
});
