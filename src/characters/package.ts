import {readFileSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {unzipSync} from 'fflate';
import type {CharacterPackage} from '../shared/types';
import {redact,sensitive} from '../privacy/content';
export function safeEntry(name:string):boolean {return !!name&&!name.includes('\\')&&!name.includes(':')&&!name.startsWith('/')&&!name.split('/').some(s=>s==='..'||s==='.'||s==='')&&!/[\x00-\x1f]/.test(name);}
export function inspectZip(data:Uint8Array){
  if(data.length>20*1024*1024)throw new Error('ZIP 超过 20 MB。');
  let total=0,count=0;
  const entries=unzipSync(data,{filter:file=>{
    const entryName=file.name.endsWith('/')?file.name.slice(0,-1):file.name;count++;total+=file.originalSize;
    if(count>300||total>80*1024*1024||file.originalSize>20*1024*1024||!safeEntry(entryName))throw new Error('包内路径或大小无效。');
    return !file.name.endsWith('/');
  }});
  return entries;
}
export function validateCharacter(raw:any):CharacterPackage {
  if(!raw||raw.schema_version!==1||typeof raw.id!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(raw.id)||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>40||
    typeof raw.persona_text!=='string'||raw.persona_text.length>8000||!['png','frames'].includes(raw.visual_type)||raw.fallback_action!=='idle'||
    typeof raw.license!=='string'||typeof raw.source!=='string'||!Array.isArray(raw.supported_actions)||!raw.asset_paths||typeof raw.asset_paths!=='object')throw new Error('角色包字段无效。');
  if(!Array.isArray(raw.asset_paths.idle)||!raw.asset_paths.idle.length)throw new Error('角色包必须包含 idle 图像。');
  for(const [action,frames] of Object.entries(raw.asset_paths)){
    if(!['idle','walk','sleep','click','read'].includes(action)||!Array.isArray(frames)||!frames.length||frames.length>60||frames.some((f:any)=>typeof f!=='string'||!safeEntry(f)||!/\.(png|gif|webp)$/i.test(f)))throw new Error('角色图像路径无效。');
  }
  if(raw.frame_ms!==undefined&&(typeof raw.frame_ms!=='object'||raw.frame_ms===null||Object.entries(raw.frame_ms).some(([k,v])=>!['idle','walk','sleep','click','read'].includes(k)||typeof v!=='number'||!Number.isFinite(v)||v<50||v>2000)))throw new Error('动作帧间隔范围为50–2000毫秒。');
  if(sensitive(raw.id)||!raw.supported_actions.includes('idle')||raw.supported_actions.some((a:any)=>!['idle','walk','sleep','click','read'].includes(a)))throw new Error('角色 ID 或动作声明无效。');
  if(raw.greetings!==undefined)raw.greetings=validateGreetings(raw.greetings);
  if(raw.live2d!==undefined)throw new Error('公开版仅支持图片或动图角色包。');
  return {...raw,name:redact(raw.name),persona_text:redact(raw.persona_text),license:redact(raw.license),source:redact(raw.source)};
}
export function validateGreetings(raw:any):string[]{if(!Array.isArray(raw)||!raw.length||raw.length>20||raw.some((s:any)=>typeof s!=='string'||!s.trim()||s.length>120||sensitive(s)))throw new Error('问候语最多20条，每条1–120字符。');return raw.map((s:string)=>redact(s.trim()));}
export function characterGreetings(pack:CharacterPackage):string[]{return pack.greetings??(pack.id==='default-xiaoqi'?['嗯，我在呢。','陪着你呢，慢慢来。','来啦，今天怎么样？']:pack.id==='builtin-momo'?['桃桃来啦，要一起歇会儿吗？','今天也陪你一点一点来。']:['我是'+pack.name+'，很高兴见到你。','我在，想聊点什么？']);}
export function importCharacter(file:string,directory:string,validateImage:(bytes:Uint8Array)=>void):CharacterPackage {
  if(statSync(file).size>20*1024*1024)throw new Error('角色包过大。');
  const entries=inspectZip(readFileSync(file));
  if(!entries['character.json'])throw new Error('缺少 character.json。');
  const pack=validateCharacter(JSON.parse(new TextDecoder().decode(entries['character.json'])));
  // Allocate a fresh internal ID on every import; importing cannot overwrite existing history.
  const id='import-'+randomUUID();const assets:Record<string,string[]>={};
  for(const [action,frames] of Object.entries(pack.asset_paths)){
    assets[action]=frames.map(f=>{const bytes=entries[f];if(!bytes)throw new Error('缺少角色图片。');validateImage(bytes);return f;});
  }
  const root=path.join(directory,id);mkdirSync(root,{recursive:true});
  for(const frames of Object.values(assets))for(const f of frames){mkdirSync(path.dirname(path.join(root,f)),{recursive:true});writeFileSync(path.join(root,f),entries[f]);}
  return {...pack,id,asset_paths:assets};
}
