const el=id=>document.getElementById(id);
chrome.storage.session.get(['port','token']).then(p=>{el('port').value=p.port||'';el('token').value=p.token||'';});
const status=text=>{el('status').textContent=text;};
el('save').onclick=async()=>{
  const port=Number(el('port').value),token=el('token').value.trim();
  if(!Number.isInteger(port)||port<1||port>65535||!/^[a-f0-9]{64}$/.test(token)){status('请填写桌面设置中的端口和配对码。');return;}
  await chrome.storage.session.set({port,token});el('token').value='';status('已保存本次浏览器会话配对。');
};
async function share(segment=false){
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id||!tab.url?.startsWith('https://')){status('仅支持你选择的 HTTPS 网页。');return;}
    if(el('watch').checked){const origin=new URL(tab.url).origin+'/*';if(!await chrome.permissions.request({origins:[origin]})){status('站点授权未开启。');return;}}
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    await chrome.tabs.sendMessage(tab.id,{type:'companion:start',watch:el('watch').checked,segment});
    status('已分享；若桌面未接收，请检查配对和浏览器权限。');
  }catch{status('无法读取此页，请选择文字或在聊天中粘贴内容。');}
}
el('share').onclick=()=>share(false);el('section').onclick=()=>share(true);
el('stop').onclick=async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.id)await chrome.tabs.sendMessage(tab.id,{type:'companion:stop'}).catch(()=>{});await chrome.storage.session.clear();status('已停止，桌面缓存将在 20 秒内过期。');};
