import {createServer,type Server} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import type {ContextSnapshot} from '../shared/types';
import {redact,sanitizeUrl} from '../privacy/content';
export function validateSnapshot(raw:any):ContextSnapshot {
  if(!raw||!['bilibili','web'].includes(raw.source_type)||typeof raw.title!=='string'||typeof raw.source_id!=='string'||typeof raw.is_foreground!=='boolean')throw new Error('Invalid snapshot');
  const url=sanitizeUrl(raw.sanitized_url);if(!url)throw new Error('Invalid URL');
  if(raw.source_type==='bilibili'&&!['www.bilibili.com','bilibili.com'].includes(new URL(url).hostname))throw new Error('Invalid site');
  return {source_type:raw.source_type,source_id:raw.source_id.slice(0,200),observed_at:Date.now(),title:redact(raw.title.slice(0,300)),sanitized_url:url,is_foreground:raw.is_foreground,
    content_excerpt:typeof raw.content_excerpt==='string'?redact(raw.content_excerpt.slice(0,4000)):null,
    position:typeof raw.position==='number'&&Number.isFinite(raw.position)&&raw.position>=0?raw.position:null,
    playback_state:['playing','paused','ended'].includes(raw.playback_state)?raw.playback_state:null,
    playback_rate:typeof raw.playback_rate==='number'&&raw.playback_rate>0&&raw.playback_rate<=16?raw.playback_rate:null,
    confidence:raw.content_excerpt?'observed':'unavailable',permission_scope:new URL(url).origin,segment_end:raw.segment_end===true};
}
export class ContextBridge {
  server:Server|null=null; token=randomBytes(32).toString('hex');port=0;
  async start(allowed:()=>boolean,onSnapshot:(s:ContextSnapshot)=>void){
    this.server=createServer((req,res)=>{
      const origin=req.headers.origin??'';
      if(!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)){res.writeHead(403);res.end();return;}
      res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
      res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Companion-Token');
      res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
      if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
      const supplied=req.headers['x-companion-token'];
      if(req.method!=='POST'||req.url!=='/context'||!allowed()||typeof supplied!=='string'||supplied.length!==this.token.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(this.token))){res.writeHead(403);res.end();return;}
      if(req.headers['content-type']!=='application/json'){res.writeHead(415);res.end();return;}
      let data='';req.setEncoding('utf8');req.on('data',chunk=>{data+=chunk;if(Buffer.byteLength(data)>16000){res.writeHead(413);res.end();req.destroy();}});
      req.on('end',()=>{if(res.writableEnded)return;try{onSnapshot(validateSnapshot(JSON.parse(data)));res.writeHead(204);}catch{res.writeHead(400);}res.end();});
    });
    this.server.requestTimeout=5000;this.server.headersTimeout=5000;
    await new Promise<void>((resolve,reject)=>{this.server!.once('error',reject);this.server!.listen(0,'127.0.0.1',()=>resolve());});
    this.port=(this.server.address() as any).port;
  }
  rotate(){this.token=randomBytes(32).toString('hex');}
  close(){this.server?.closeAllConnections();this.server?.close();}
}
