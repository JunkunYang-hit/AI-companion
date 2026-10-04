import {Readability} from '@mozilla/readability';
declare const chrome:any;
const target=window as any;
if(!target.__companionInstalled){
  target.__companionInstalled=true;
  let timer:ReturnType<typeof setInterval>|null=null,last='',captions:{time:number;text:string}[]=[],lastUrl=location.href;
  function text(){
    const selected=window.getSelection()?.toString().trim();if(selected)return selected.slice(0,4000);
    const clone=document.cloneNode(true) as Document;
    clone.querySelectorAll('form,input,textarea,select,script,style,[contenteditable],nav,footer').forEach(n=>n.remove());
    try{return new Readability(clone).parse()?.textContent?.replace(/\s+/g,' ').trim().slice(0,4000)??'';}catch{return '';}
  }
  function videoSnapshot(){
    const v=document.querySelector('video');if(!v)return {content:null,position:null,state:null,rate:null};
    const now=v.currentTime;let subtitle='';
    for(const track of [...v.textTracks] as TextTrack[])if(track.activeCues)for(const cue of [...track.activeCues])if('text' in cue)subtitle+=(cue as VTTCue).text+' ';
    if(!subtitle)subtitle=[...document.querySelectorAll('.bpx-player-subtitle-panel-text,.bilibili-player-video-subtitle')].map(n=>n.textContent??'').join(' ');
    subtitle=subtitle.trim().slice(0,1000);
    if(subtitle&&captions.at(-1)?.text!==subtitle)captions.push({time:now,text:subtitle});
    captions=captions.filter(c=>Math.abs(now-c.time)<120).slice(-20);
    return {content:captions.map(c=>c.text).join(' ').slice(-3000)||null,position:Number.isFinite(now)?now:null,state:v.ended?'ended':v.paused?'paused':'playing',rate:v.playbackRate};
  }
  async function send(segment=false){
    if(location.href!==lastUrl){lastUrl=location.href;captions=[];last='';}
    const bilibili=location.hostname==='www.bilibili.com'||location.hostname==='bilibili.com';const video=bilibili?videoSnapshot():null;
    const snapshot={source_type:bilibili?'bilibili':'web',source_id:location.pathname,title:document.title,sanitized_url:location.href,is_foreground:!document.hidden,
      content_excerpt:bilibili?video?.content??null:text()||null,position:video?.position??null,playback_state:video?.state??null,playback_rate:video?.rate??null,segment_end:segment};
    // Playback position heartbeat is throttled to 5 seconds; no full browsing history is retained.
    const signature=JSON.stringify(snapshot);
    last=signature;await chrome.runtime.sendMessage({type:'companion:snapshot',snapshot}).catch(()=>{});
  }
  chrome.runtime.onMessage.addListener((m:any,sender:any,respond:any)=>{
    if(sender.id!==chrome.runtime.id)return;
    if(m.type==='companion:stop'){if(timer)clearInterval(timer);timer=null;captions=[];respond({ok:true});}
    if(m.type==='companion:start'){if(timer)clearInterval(timer);void send(m.segment===true);if(m.watch)timer=setInterval(()=>void send(),5000);respond({ok:true});}
  });
  window.addEventListener('pagehide',()=>{if(timer)clearInterval(timer);captions=[];});
}
