export type ProviderId = 'deepseek'|'qwen'|'ark'|'glm'|'kimi'|'openai'|'anthropic'|'gemini'|'custom'|'mock';
export interface Settings {
  provider: ProviderId; baseUrl: string; model: string; name: string; persona: string;
  alwaysOnTop: boolean; allowDrag: boolean; walking: boolean; bubbleRotation:boolean; scale: number;
  mode: 'quiet'|'normal'|'active'|'reply'|'custom'; dnd: boolean; todayQuiet: string;
  theme:'sakura'|'blue'|'dark'; bubbleFontSize:number; proactiveHourlyLimit:number; proactiveInterval:number; memoryEnabled:boolean;
  cachedInputPrice:number|null; priceSource:string; priceCheckedAt:number;
  onboardingSeen:boolean;
  saveHistory: boolean; backgroundAI: boolean; foregroundPermission: boolean; browserPermission: boolean;
  contextSend: boolean; maxOutputTokens: number; backgroundDailyLimit: number;
  dailyBudget: number|null; inputPrice: number|null; outputPrice: number|null; currency: string;
  characterId: string; meetingApps: string[]; deletedCharacterIds:string[];
}
export interface ContextSnapshot {
  source_type:'bilibili'|'web'|'pdf'; source_id:string; observed_at:number;
  title:string; sanitized_url:string|null; is_foreground:boolean;
  content_excerpt:string|null; position:number|null; playback_state:string|null;
  confidence:'observed'|'unavailable'; permission_scope:string; playback_rate?:number|null;
  segment_end?:boolean;
  full_document?:boolean; characters?:number; pages?:number;
}
export interface ChatMessage {id:string; session_id:string; character_id:string; role:'user'|'assistant'; content:string; created_at:number; status:string}
export interface Usage {input:number|null; output:number|null; cached:number|null; source:'provider'|'estimated'|'unknown'}
export interface StreamEvent {type:'text_delta'|'usage'|'done'|'error'; text?:string; usage?:Usage}
export interface CharacterPackage {
  schema_version:1; id:string; name:string; persona_text:string; visual_type:'png'|'frames';
  asset_paths:Record<string,string[]>; supported_actions:string[]; fallback_action:'idle';
  license:string; source:string;
  frame_ms?:Record<string,number>;
  greetings?:string[];
}
export const defaults: Settings = {
  provider:'deepseek',baseUrl:'https://api.deepseek.com',model:'',name:'小栖',
  persona:'你是小栖，一个温柔、好奇、有一点俏皮的桌面伙伴。陪用户学习、工作和生活，回应简短自然。',
  alwaysOnTop:true,allowDrag:false,walking:true,bubbleRotation:true,scale:1,mode:'normal',dnd:false,todayQuiet:'',
  theme:'sakura',bubbleFontSize:16,proactiveHourlyLimit:2,proactiveInterval:20,memoryEnabled:true,
  cachedInputPrice:null,priceSource:'',priceCheckedAt:0,
  onboardingSeen:false,
  saveHistory:true,backgroundAI:false,foregroundPermission:false,browserPermission:false,contextSend:false,
  maxOutputTokens:300,backgroundDailyLimit:200,dailyBudget:null,inputPrice:null,outputPrice:null,currency:'CNY',
  characterId:'default-xiaoqi',meetingApps:[],deletedCharacterIds:[]
};
export interface State {
  settings:Settings;proactiveStatus:string; sessionId:string; avatar:string; keyConfigured:boolean; credentialConfigured:boolean;keyProviders:ProviderId[]; keyStorage:string; context:ContextSnapshot|null;
  learning:{active:boolean; review:boolean; startedAt:number; goal:string}; hidden:boolean;
  foreground:{title:string; app:string; fullscreen:boolean}|null;
  character: {id:string; name:string; frames:Record<string,string[]>;frameMs?:Record<string,number>;greetings:string[]};
  busy:boolean; pairing:{port:number; token:string}|null;
}
export type Action = 'pet-bounds'|'bubble-visibility'|'key-delete'|'proactive-preview'|'character-delete'|'chat'|'cancel'|'hide'|'show'|'open'|'settings'|'forget'|'summary-delete'|'clear'|'fact-save'|'fact-delete'|'image-import'|'persona-import'|'character-import'|'character-select'|'learning'|'review-response'|'context-revoke'|'pdf-import'|'pdf-page'|'export'|'import'|'end-session'|'external-link'|'pair-reset'|'resize'|'confirm'|'prices-refresh'|'document-import'|'memory-update'|'memory-save'|'avatar-import'|'action-import'|'action-preview';
export interface Bridge {
  state():Promise<State>; history(session?:string):Promise<ChatMessage[]>; memory():Promise<any>;
  action(action:Action,payload?:any):Promise<any>; on(channel:'state'|'stream'|'bubble'|'dialog'|'pointer',cb:(data:any)=>void):()=>void;
  hit(interactive:boolean):void; drag(phase:'start'|'move'|'end'):void;
}
declare global { interface Window { companion:Bridge } }
