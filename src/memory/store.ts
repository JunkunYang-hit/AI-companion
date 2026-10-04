import initSqlJs, {type Database} from 'sql.js';
import {existsSync,readFileSync,writeFileSync,renameSync,copyFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {redact,sensitive} from '../privacy/content';
import type {ChatMessage,Usage,Settings} from '../shared/types';
import {costOf} from '../costs/budget';
import {memoryCapacity,memoryInputLimit,memorySessionLimit} from './batch';
export class Store {
  db!:Database; sessionId:string=randomUUID(); file:string; privacyRevision=0;
  constructor(public directory:string){this.file=path.join(directory,'companion.db');}
  async init(wasmPath:string){
    mkdirSync(this.directory,{recursive:true});const SQL=await initSqlJs({locateFile:()=>wasmPath});
    this.db=existsSync(this.file)?new SQL.Database(readFileSync(this.file)):new SQL.Database();
    const version=this.db.exec('PRAGMA user_version')[0]?.values[0][0]??0;
    if(Number(version)>3)throw new Error('数据版本比应用新，请更新应用。');
    if(Number(version)<3&&existsSync(this.file))copyFileSync(this.file,this.file+'.migration-backup-v3');
    this.db.run(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, session_id TEXT, character_id TEXT, role TEXT, content TEXT, created_at INTEGER, status TEXT);
      CREATE TABLE IF NOT EXISTS summaries (session_id TEXT PRIMARY KEY, character_id TEXT, content TEXT, created_at INTEGER);
      CREATE TABLE IF NOT EXISTS summary_queue (session_id TEXT PRIMARY KEY, character_id TEXT, revision INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, next_at INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS facts (id TEXT PRIMARY KEY, character_id TEXT, category TEXT, content TEXT, source_session TEXT, source_message TEXT, confirmed INTEGER, created_at INTEGER, expires_at INTEGER);
      CREATE TABLE IF NOT EXISTS memory_sources (fact_id TEXT REFERENCES facts(id) ON DELETE CASCADE, session_id TEXT, PRIMARY KEY(fact_id,session_id));
      CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY, session_id TEXT, kind TEXT, provider TEXT, model TEXT, input INTEGER, output INTEGER, cached INTEGER, source TEXT, cost REAL, currency TEXT, price_version TEXT, status TEXT, created_at INTEGER);
      CREATE TABLE IF NOT EXISTS learning (id TEXT PRIMARY KEY, character_id TEXT, goal TEXT, started_at INTEGER, ended_at INTEGER, source_title TEXT);
      CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, character_id TEXT, response TEXT, source_title TEXT, created_at INTEGER);
      CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      INSERT OR IGNORE INTO memory_sources SELECT id,source_session FROM facts WHERE source_session IS NOT NULL;
      CREATE TABLE IF NOT EXISTS memory_meta (name TEXT PRIMARY KEY,value INTEGER);
      DELETE FROM memory_sources WHERE fact_id NOT IN (SELECT id FROM facts);
      PRAGMA user_version=3;`);this.flush();
  }
  rows(sql:string,params:any[]=[]):any[]{const st=this.db.prepare(sql);try{st.bind(params);const rows=[];while(st.step())rows.push(st.getAsObject());return rows;}finally{st.free();}}
  flush(){const tmp=this.file+'.tmp';writeFileSync(tmp,this.db.export());this.db.run('PRAGMA foreign_keys=ON');renameSync(tmp,this.file);}
  transaction<T>(fn:()=>T):T {this.db.run('BEGIN');try{const out=fn();this.db.run('COMMIT');this.flush();return out;}catch(e){this.db.run('ROLLBACK');throw e;}}
  getSettings():Partial<Settings>{try{return JSON.parse(this.rows('SELECT json FROM settings WHERE id=1')[0]?.json??'{}');}catch{return {};}}
  saveSettings(settings:Settings){this.db.run('INSERT OR REPLACE INTO settings VALUES (1,?)',[JSON.stringify(settings)]);this.flush();}
  add(role:'user'|'assistant',content:string,s:Settings,status='done',sessionId=this.sessionId):ChatMessage|null {
    if(!s.saveHistory||sensitive(content))return null;
    const m:ChatMessage={id:randomUUID(),session_id:sessionId,character_id:s.characterId,role,content:redact(content),created_at:Date.now(),status};
    this.db.run('INSERT INTO messages VALUES (?,?,?,?,?,?,?)',Object.values(m));this.flush();return m;
  }
  history(character:string,session?:string):ChatMessage[]{return session?this.rows('SELECT * FROM messages WHERE character_id=? AND session_id=? ORDER BY created_at DESC,rowid DESC LIMIT 250',[character,session]).reverse():this.rows('SELECT * FROM messages WHERE character_id=? ORDER BY created_at DESC, rowid DESC LIMIT 250',[character]).reverse();}
  sessions(character:string){return this.rows("SELECT session_id,MIN(created_at) AS started_at,MAX(created_at) AS updated_at,COUNT(*) AS count FROM messages WHERE character_id=? GROUP BY session_id ORDER BY updated_at DESC LIMIT 100",[character]).map(s=>({...s,title:this.rows("SELECT content FROM messages WHERE session_id=? AND character_id=? AND role='user' ORDER BY rowid LIMIT 1",[s.session_id,character])[0]?.content?.slice(0,40)??'对话'}));}
  promptHistory(character:string){return this.rows("SELECT id,role,content FROM messages WHERE character_id=? AND session_id=? AND status IN ('done','summarized') ORDER BY created_at DESC,rowid DESC LIMIT 12",[character,this.sessionId]).reverse();}
  facts(character:string){return this.rows('SELECT * FROM facts WHERE (character_id=? OR character_id=?) AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC',[character,'shared',Date.now()]);}
  summaries(character:string){return this.rows('SELECT * FROM summaries WHERE character_id=? ORDER BY created_at DESC LIMIT 20',[character]);}
  saveFact(content:string,character:string,id?:string){
    if(!content.trim()||content.length>500||sensitive(content))throw new Error('记忆需要简短内容，不能包含密钥、密码或特别敏感字段。');
    if(id){this.db.run('UPDATE facts SET content=?,confirmed=1 WHERE id=? AND (character_id=? OR character_id=?)',[content,id,character,'shared']);}
    else this.db.run('INSERT INTO facts VALUES (?,?,?,?,?,?,?,?,?)',[randomUUID(),character,'preference',content,null,null,1,Date.now(),null]);this.flush();
  }
  deleteFact(id:string,character:string){this.privacyRevision++;this.transaction(()=>this.removeFact(id,character));}
  private removeFact(id:string,character:string){
    const fact=this.rows('SELECT * FROM facts WHERE id=? AND (character_id=? OR character_id=?)',[id,character,'shared'])[0];if(!fact)return;
    const sources=this.rows('SELECT session_id FROM memory_sources WHERE fact_id=?',[id]);
    if(fact.source_session&&!sources.some(s=>s.session_id===fact.source_session))sources.push({session_id:fact.source_session});
    for(const source of sources){this.db.run('DELETE FROM summaries WHERE session_id=?',[source.session_id]);this.db.run('DELETE FROM summary_queue WHERE session_id=?',[source.session_id]);this.db.run("UPDATE messages SET status='excluded' WHERE session_id=?",[source.session_id]);}
    this.db.run('DELETE FROM facts WHERE id=?',[id]);
  }
  forget(id:string,character:string){
    this.privacyRevision++;this.transaction(()=>{const message=this.rows('SELECT rowid AS sequence,* FROM messages WHERE id=? AND character_id=?',[id,character])[0];if(!message)return;
      // Invalidate the entire source session and its derivatives, including shared facts.
      this.db.run('DELETE FROM messages WHERE id=?',[id]);
      if(message.role==='user'){
        const next=this.rows("SELECT id,role FROM messages WHERE session_id=? AND rowid>? ORDER BY rowid LIMIT 1",[message.session_id,message.sequence])[0];
        if(next?.role==='assistant')this.db.run('DELETE FROM messages WHERE id=?',[next.id]);
      }
      this.db.run('DELETE FROM summaries WHERE session_id=?',[message.session_id]);
      this.invalidateMemories(message.session_id);
      this.db.run('DELETE FROM facts WHERE source_session=? OR source_message=?',[message.session_id,id]);
      this.db.run('UPDATE summary_queue SET revision=revision+1,attempts=0,next_at=0 WHERE session_id=?',[message.session_id]);
    });
  }
  clear(character:string|null){this.privacyRevision++;this.transaction(()=>{
    if(character)this.db.run("DELETE FROM facts WHERE source_session IN (SELECT session_id FROM messages WHERE character_id=? UNION SELECT session_id FROM summaries WHERE character_id=?) OR id IN (SELECT fact_id FROM memory_sources WHERE session_id IN (SELECT session_id FROM messages WHERE character_id=? UNION SELECT session_id FROM summaries WHERE character_id=?))",[character,character,character,character]);
    for(const table of ['messages','summaries','summary_queue','facts','learning','reviews']) {
      if(character)this.db.run(`DELETE FROM ${table} WHERE character_id=?`,[character]);else this.db.run(`DELETE FROM ${table}`);
    }
  });}
  endSession(character:string){
    if(this.rows('SELECT id FROM messages WHERE session_id=? LIMIT 1',[this.sessionId]).length){
      this.db.run('INSERT OR IGNORE INTO summary_queue(session_id,character_id) VALUES (?,?)',[this.sessionId,character]);this.flush();
    }this.sessionId=randomUUID();
  }
  recoverSummaries(){this.db.run("INSERT OR IGNORE INTO summary_queue(session_id,character_id) SELECT session_id,character_id FROM messages WHERE status='done' GROUP BY session_id,character_id");this.flush();}
  nextSummary(character?:string){return character?this.rows('SELECT * FROM summary_queue WHERE next_at<=? AND character_id=? ORDER BY rowid LIMIT 1',[Date.now(),character])[0]:this.rows('SELECT * FROM summary_queue WHERE next_at<=? ORDER BY rowid LIMIT 1',[Date.now()])[0];}
  memoryLastUpdate(character:string){return Number(this.getSettingsExtra('memoryUpdate:'+character)||0);}
  private getSettingsExtra(name:string){this.db.run('CREATE TABLE IF NOT EXISTS memory_meta (name TEXT PRIMARY KEY,value INTEGER)');return this.rows('SELECT value FROM memory_meta WHERE name=?',[name])[0]?.value;}
  memoryBatch(character:string,manual=false){
    if(manual)this.db.run("INSERT OR IGNORE INTO summary_queue(session_id,character_id) SELECT session_id,character_id FROM messages WHERE character_id=? AND status='done' GROUP BY session_id",[character]);
    const candidates=this.rows('SELECT * FROM summary_queue WHERE character_id=? AND next_at<=? ORDER BY rowid',[character,manual?Number.MAX_SAFE_INTEGER:Date.now()]);
    const sessions:any[]=[];let length=JSON.stringify(this.facts(character)).length;
    for(const job of candidates){if(!manual&&job.session_id===this.sessionId)continue;
      const messages=this.rows("SELECT id,role,content FROM messages WHERE session_id=? AND status IN ('done','summarized') ORDER BY created_at,rowid",[job.session_id]);
      if(!messages.length)continue;const size=JSON.stringify(messages).length;
      if(size+length>memoryInputLimit){if(!sessions.length&&manual)throw new Error('本次会话过长，记忆更新最多处理160000字符。');continue;}
      sessions.push({...job,messages});length+=size;if(sessions.length>=memorySessionLimit)break;
    }
    this.flush();return sessions.length?{character_id:character,sessions,manual,privacyRevision:this.privacyRevision}:null;
  }
  completeMemoryUpdate(batch:any,raw:string){
    const obj=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));
    if(!Array.isArray(obj.sessions)||!Array.isArray(obj.add)||!Array.isArray(obj.update)||!Array.isArray(obj.delete)||obj.add.length>6)throw new Error('记忆更新格式无效。');
    if(obj.sessions.length!==batch.sessions.length||batch.sessions.some((s:any)=>obj.sessions.filter((v:any)=>v.session_id===s.session_id&&typeof v.summary==='string'&&v.summary.length<=2500).length!==1))throw new Error('会话摘要不完整。');
    if(this.privacyRevision!==batch.privacyRevision)throw new Error('记忆已修改，本次更新已取消。');
    const sources=batch.sessions.flatMap((s:any)=>s.messages.map((m:any)=>({...m,session_id:s.session_id})));
    this.transaction(()=>{
      for(const s of batch.sessions)if(this.rows('SELECT revision FROM summary_queue WHERE session_id=?',[s.session_id])[0]?.revision!==s.revision)throw new Error('会话已修改，本次更新已取消。');
      for(const [kind,items] of [['delete',obj.delete],['update',obj.update],['add',obj.add]] as const)for(const item of items){
        const source=sources.find((m:any)=>m.role==='user'&&m.id===item.source_message&&typeof item.evidence==='string'&&item.evidence.trim()&&m.content.includes(item.evidence));if(!source)continue;
        const existing=this.facts(batch.character_id).find(f=>f.id===item.id);
        if(kind!=='add'&&(!existing||existing.confirmed||existing.character_id!==batch.character_id))continue;
        if(kind==='delete'){this.db.run('DELETE FROM facts WHERE id=?',[existing.id]);continue;}
        if(typeof item.content!=='string'||!item.content.trim()||item.content.length>500||sensitive(item.content))continue;
        const content=redact(item.content.trim()),facts=this.facts(batch.character_id);
        if(facts.some(f=>f.id!==existing?.id&&f.content===content))continue;
        if(facts.reduce((n,f)=>n+f.content.length+2,0)-(existing?.content.length??0)+content.length>memoryCapacity)continue;
        const id=existing?.id??randomUUID(),category=['preference','goal','learning'].includes(item.category)?item.category:'preference';
        if(existing)this.db.run('UPDATE facts SET content=?,source_session=?,source_message=?,created_at=? WHERE id=?',[content,source.session_id,source.id,Date.now(),id]);
        else this.db.run('INSERT INTO facts VALUES (?,?,?,?,?,?,?,?,?)',[id,batch.character_id,category,content,source.session_id,source.id,0,Date.now(),null]);
        this.db.run('INSERT OR IGNORE INTO memory_sources VALUES (?,?)',[id,source.session_id]);
      }
      for(const s of batch.sessions){this.db.run('INSERT OR REPLACE INTO summaries VALUES (?,?,?,?)',[s.session_id,batch.character_id,redact(obj.sessions.find((v:any)=>v.session_id===s.session_id).summary),Date.now()]);for(const m of s.messages)this.db.run("UPDATE messages SET status='summarized' WHERE id=? AND status='done'",[m.id]);if(!this.rows("SELECT id FROM messages WHERE session_id=? AND status='done' LIMIT 1",[s.session_id]).length)this.db.run('DELETE FROM summary_queue WHERE session_id=?',[s.session_id]);}
      this.getSettingsExtra('memoryUpdate:'+batch.character_id);this.db.run('INSERT OR REPLACE INTO memory_meta VALUES (?,?)',['memoryUpdate:'+batch.character_id,Date.now()]);
    });
  }
  saveMemoryText(text:string,character:string){
    if(text.length>memoryCapacity||sensitive(text))throw new Error('记忆最多6000字符，不能包含密钥或敏感字段。');
    const parts=text.split(/\n\s*\n/).map(v=>v.trim()).filter(Boolean),facts=this.facts(character);
    this.privacyRevision++;this.transaction(()=>{for(const fact of facts)if(!parts.includes(fact.content))this.removeFact(fact.id,character);for(const content of parts){const existing=this.facts(character).find(f=>f.content===content);if(!existing)this.db.run('INSERT INTO facts VALUES (?,?,?,?,?,?,?,?,?)',[randomUUID(),character,'preference',content,null,null,1,Date.now(),null]);}});
  }
  summaryMessages(session:string){return this.rows("SELECT id,role,content FROM messages WHERE session_id=? AND status='done' ORDER BY created_at,rowid LIMIT 12",[session]);}
  invalidateMemories(session:string){
    const ids=this.rows('SELECT fact_id FROM memory_sources WHERE session_id=?',[session]);
    for(const item of ids){const sources=this.rows('SELECT session_id FROM memory_sources WHERE fact_id=?',[item.fact_id]);for(const source of sources){this.db.run('DELETE FROM summaries WHERE session_id=?',[source.session_id]);this.db.run('UPDATE summary_queue SET revision=revision+1,attempts=0,next_at=0 WHERE session_id=?',[source.session_id]);}this.db.run('DELETE FROM facts WHERE id=?',[item.fact_id]);}
  }
  forgetSession(session:string,character:string){this.privacyRevision++;this.transaction(()=>{
    if(this.rows('SELECT session_id FROM messages WHERE session_id=? AND character_id=? UNION SELECT session_id FROM summaries WHERE session_id=? AND character_id=?',[session,character,session,character]).length)this.invalidateMemories(session);
    for(const table of ['messages','summaries','summary_queue'])this.db.run(`DELETE FROM ${table} WHERE session_id=? AND character_id=?`,[session,character]);
    this.db.run('DELETE FROM facts WHERE source_session=? AND (character_id=? OR character_id=?)',[session,character,'shared']);
  });}
  prune(){this.db.run('DELETE FROM messages WHERE session_id IN (SELECT s.session_id FROM summaries s WHERE NOT EXISTS (SELECT 1 FROM summary_queue q WHERE q.session_id=s.session_id) AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.session_id=s.session_id AND m.created_at>=?))',[Date.now()-7*86400_000]);this.flush();}
  completeSummary(job:any,raw:string){
    const obj=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));
    if(typeof obj.summary!=='string'||obj.summary.length>2500||!Array.isArray(obj.facts)||obj.facts.length>12)throw new Error('摘要格式无效。');
    this.transaction(()=>{const current=this.rows('SELECT * FROM summary_queue WHERE session_id=?',[job.session_id])[0];
      if(!current||current.revision!==job.revision)return;
      this.db.run('INSERT OR REPLACE INTO summaries VALUES (?,?,?,?)',[job.session_id,job.character_id,redact(obj.summary),Date.now()]);
      const sources=this.summaryMessages(job.session_id);
      for(const fact of obj.facts){
        if(typeof fact?.content!=='string'||!fact.content.trim()||fact.content.length>500||sensitive(fact.content))continue;
        const source=sources.find(m=>m.id===fact.source_message&&m.role==='user');
        if(!source||typeof fact.evidence!=='string'||!fact.evidence.trim()||!source.content.includes(fact.evidence))continue;
        const category=['preference','goal','learning'].includes(fact.category)?fact.category:'preference';
        const existing=this.facts(job.character_id).find(f=>f.id===fact.replace_id);
        if(existing){
          // 用户编辑过的记忆保留；模型只能更新本角色的自动记忆。
          if(existing.confirmed||existing.character_id!==job.character_id)continue;
          this.db.run('UPDATE facts SET content=?,category=?,source_session=?,source_message=?,created_at=?,expires_at=? WHERE id=?',[redact(fact.content.trim()),category,job.session_id,source.id,Date.now(),category==='preference'?null:Date.now()+30*86400_000,existing.id]);
          this.db.run('INSERT OR IGNORE INTO memory_sources VALUES (?,?)',[existing.id,job.session_id]);
        }else if(!this.facts(job.character_id).some(f=>f.content===fact.content.trim())){
          const id=randomUUID();this.db.run('INSERT INTO facts VALUES (?,?,?,?,?,?,?,?,?)',[id,job.character_id,category,redact(fact.content.trim()),job.session_id,source.id,0,Date.now(),category==='preference'?null:Date.now()+30*86400_000]);
          this.db.run('INSERT OR IGNORE INTO memory_sources VALUES (?,?)',[id,job.session_id]);
        }
      }
      for(const message of sources)this.db.run("UPDATE messages SET status='summarized' WHERE id=? AND status='done'",[message.id]);
      if(this.summaryMessages(job.session_id).length){this.db.run('UPDATE summary_queue SET attempts=0,next_at=0 WHERE session_id=?',[job.session_id]);return;}
      this.db.run('DELETE FROM summary_queue WHERE session_id=?',[job.session_id]);
      // Full text is pruned only after a valid summary and only when ALL messages are older than 7 days.
      const recent=this.rows('SELECT id FROM messages WHERE session_id=? AND created_at>=? LIMIT 1',[job.session_id,Date.now()-7*86400_000]);
      if(!recent.length)this.db.run('DELETE FROM messages WHERE session_id=?',[job.session_id]);
    });
  }
  failSummary(job:any){this.db.run('UPDATE summary_queue SET attempts=attempts+1,next_at=? WHERE session_id=?',[Date.now()+Math.min(24*3600_000,60000*2**Math.min(job.attempts,10)),job.session_id]);this.flush();}
  usageRecords(){return this.rows('SELECT * FROM usage ORDER BY created_at DESC LIMIT 10000');}
  recordUsage(s:Settings,kind:string,usage:Usage,status:string,sessionId=this.sessionId){const id=randomUUID();this.db.run('INSERT INTO usage VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[
    id,sessionId,kind,s.provider,s.model,usage.input,usage.output,usage.cached,usage.source,s.provider==='mock'?null:costOf(usage,s),s.currency,
    JSON.stringify({input:s.inputPrice,cached:s.cachedInputPrice,output:s.outputPrice,source:s.priceSource,checkedAt:s.priceCheckedAt,estimate:true}),status,Date.now()
  ]);this.flush();return id;}
  settleUsage(id:string,s:Settings,usage:Usage,status:string){this.db.run('UPDATE usage SET input=?,output=?,cached=?,source=?,cost=?,status=? WHERE id=?',[usage.input,usage.output,usage.cached,usage.source,s.provider==='mock'?null:costOf(usage,s),status,id]);this.flush();}
  close(){this.flush();this.db.close();}
}
