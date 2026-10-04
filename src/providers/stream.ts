import type { ProviderId, StreamEvent, Usage } from '../shared/types';
export interface ProviderConfig {provider:ProviderId; baseUrl:string; model:string; key:string; maxTokens:number}
export interface PromptMessage {role:'system'|'user'|'assistant';content:string}
export class ProviderError extends Error { constructor(public code:string,message:string){super(message);} }
export const presets:Record<Exclude<ProviderId,'mock'>,{url:string;label:string;modelHint:string}> = {
  deepseek:{url:'https://api.deepseek.com',label:'DeepSeek',modelHint:'填写控制台当前模型 ID'},
  qwen:{url:'https://dashscope.aliyuncs.com/compatible-mode/v1',label:'Qwen / DashScope',modelHint:'填写当前模型 ID'},
  ark:{url:'https://ark.cn-beijing.volces.com/api/v3',label:'豆包 / 火山方舟',modelHint:'模型 ID 或推理接入点 ep-…'},
  glm:{url:'https://open.bigmodel.cn/api/paas/v4',label:'智谱 GLM',modelHint:'填写当前模型 ID'},
  kimi:{url:'https://api.moonshot.cn/v1',label:'Moonshot / Kimi',modelHint:'填写当前模型 ID'},
  openai:{url:'https://api.openai.com/v1',label:'OpenAI',modelHint:'填写支持 Chat Completions 的模型 ID'},
  anthropic:{url:'https://api.anthropic.com/v1',label:'Anthropic',modelHint:'填写 Claude 模型 ID'},
  gemini:{url:'https://generativelanguage.googleapis.com/v1beta/openai',label:'Gemini（文本兼容层）',modelHint:'填写当前 Gemini 模型 ID'},
  custom:{url:'https://example.com/v1',label:'自定义兼容服务',modelHint:'填写服务提供的模型 ID'}
};
function usageFrom(raw:any):Usage {
  return {input:raw.prompt_tokens??raw.input_tokens??null,output:raw.completion_tokens??raw.output_tokens??null,
    cached:raw.prompt_cache_hit_tokens??raw.prompt_tokens_details?.cached_tokens??raw.cache_read_input_tokens??null,source:'provider'};
}
export async function* sse(body:ReadableStream<Uint8Array>,signal:AbortSignal):AsyncGenerator<{event:string;data:string}> {
  const reader=body.getReader(); const decoder=new TextDecoder(); let buffer=''; let event='message',data:string[]=[];
  const consume=(line:string)=>{
    if(line===''){const result=data.length?{event,data:data.join('\n')}:null;data=[];event='message';return result;}
    if(line.startsWith('event:'))event=line.slice(6).trim();
    if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));
    return null;
  };
  try {
    while(true){signal.throwIfAborted();const next=await reader.read();
      buffer+=decoder.decode(next.value,{stream:!next.done});
      let i:number;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).replace(/\r$/,'');buffer=buffer.slice(i+1);const out=consume(line);if(out)yield out;}
      if(buffer.length>1_000_000)throw new ProviderError('protocol','响应片段过大。');
      if(next.done){if(buffer){const out=consume(buffer.replace(/\r$/,''));if(out)yield out;}const out=consume('');if(out)yield out;break;}
    }
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function* stream(config:ProviderConfig,messages:PromptMessage[],signal:AbortSignal):AsyncGenerator<StreamEvent> {
  if(config.provider==='mock'){
    if(!messages[0]?.content.includes('记忆更新任务')&&messages.at(-1)?.content.includes('[断网]'))throw new ProviderError('network','离线演示：模拟网络中断，桌宠仍可使用。');
    const text=messages[0]?.content.includes('记忆更新任务')?JSON.stringify({sessions:JSON.parse(messages[1].content).sessions.map((s:any)=>({session_id:s.session_id,summary:'用户与伙伴进行了交流。'})),add:[],update:[],delete:[]}):messages[0]?.content.includes('摘要任务')?JSON.stringify({summary:'用户与伙伴进行了简短交流。',facts:[]}):'我在这里陪着你。我们可以慢慢来，也可以先安静地做一会儿自己的事。';
    for(const token of text.match(/.{1,4}/gs)??[]){signal.throwIfAborted();await new Promise(r=>setTimeout(r,40));yield {type:'text_delta',text:token};}
    yield {type:'usage',usage:{input:null,output:null,cached:null,source:'unknown'}};yield {type:'done'};return;
  }
  if(!config.key)throw new ProviderError('key','请先在设置中配置 API Key；桌面角色可以继续使用。');
  if(!config.model.trim())throw new ProviderError('model','请在设置中填写供应商当前模型 ID。');
  let u:URL;try{u=new URL(config.baseUrl);}catch{throw new ProviderError('config','API 地址无效。');}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new ProviderError('config','模型服务地址必须使用 HTTPS，且不能包含账号或查询参数。');
  const claude=config.provider==='anthropic';
  const endpoint=config.baseUrl.replace(/\/+$/,'')+(claude?'/messages':'/chat/completions');
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(claude){headers['x-api-key']=config.key;headers['anthropic-version']='2023-06-01';}else headers.Authorization=`Bearer ${config.key}`;
  const body=claude?{model:config.model,system:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),messages:messages.filter(m=>m.role!=='system'),max_tokens:config.maxTokens,stream:true}:
    {model:config.model,messages,...(config.provider==='openai'?{max_completion_tokens:config.maxTokens}:{max_tokens:config.maxTokens}),stream:true,stream_options:{include_usage:true},...(config.provider==='deepseek'?{thinking:{type:'disabled'}}:{})};
  const timed=AbortSignal.any([signal,AbortSignal.timeout(60000)]);
  let response:Response;
  try {response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body),signal:timed,redirect:'error'});}catch(e){
    if(signal.aborted)throw e;if(timed.aborted)throw new ProviderError('timeout','请求超时，请稍后重试。');throw new ProviderError('network','无法连接模型服务，请检查网络、代理和 API 地址。');
  }
  if(!response.ok){await response.body?.cancel();const code=response.status;
    throw new ProviderError(String(code),code===401||code===403?'API Key 无效或没有访问权限。':code===402||code===429?'额度不足或请求频率受限。':code===404?'模型名称或 API 地址不存在。':`模型服务返回错误（${code}），请检查模型和配置。`);
  }
  if(!response.body)throw new ProviderError('protocol','模型服务没有返回响应流。');
  let input:number|null=null,output:number|null=null,cached:number|null=null,done=false;
  try {
    for await(const event of sse(response.body,timed)){
      if(event.data==='[DONE]'){done=true;break;}
      let data:any;try{data=JSON.parse(event.data);}catch{throw new ProviderError('protocol','无法解析模型响应。');}
      if(data.error)throw new ProviderError('provider','模型服务返回流式错误。');
      if(claude){
        if(data.type==='message_start'){const u=data.message?.usage;if(u){input=u.input_tokens??null;cached=u.cache_read_input_tokens??null;}}
        if(data.type==='content_block_delta'&&data.delta?.type==='text_delta')yield {type:'text_delta',text:data.delta.text};
        if(data.type==='message_delta'&&data.usage){output=data.usage.output_tokens??output;yield {type:'usage',usage:{input,output,cached,source:'provider'}};}
        if(data.type==='message_stop'){done=true;break;}
      }else{
        const t=data.choices?.[0]?.delta?.content;if(typeof t==='string')yield {type:'text_delta',text:t};
        if(data.usage)yield {type:'usage',usage:usageFrom(data.usage)};
        // finish_reason precedes the final usage chunk; continue until [DONE].
      }
    }
  }catch(e){if(signal.aborted)throw e;if(timed.aborted)throw new ProviderError('timeout','请求超时，已保留收到的内容。');throw e;}
  if(!done)throw new ProviderError('protocol','响应流意外结束，可重试本次请求。');
  yield {type:'done'};
}
