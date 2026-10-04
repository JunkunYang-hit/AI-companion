import test from 'node:test';
import assert from 'node:assert/strict';
import {stream,presets} from '../src/providers/stream';
import type {ProviderId} from '../src/shared/types';
test('all compatible provider presets preserve stream/usage and endpoint selection (fixtures)',async()=>{
  const original=globalThis.fetch;
  try{
    for(const provider of ['deepseek','qwen','ark','glm','kimi','openai','gemini','custom'] as ProviderId[]){
      let captured:any;
      globalThis.fetch=(async(url,options)=>{
        captured={url,body:JSON.parse(options!.body as string),headers:options!.headers};
        return new Response('data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"prompt_tokens_details":{"cached_tokens":3}}}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
      }) as typeof fetch;
      const events=[];for await(const event of stream({provider,baseUrl:presets[provider as keyof typeof presets].url,model:'fixture-model',key:'fixture-key',maxTokens:64},[{role:'user',content:'hello'}],new AbortController().signal))events.push(event);
      assert(captured.url.endsWith('/chat/completions'));assert.equal(captured.body.stream,true);
      assert.equal(provider==='openai'?captured.body.max_completion_tokens:captured.body.max_tokens,64);
      assert.equal(events.find(e=>e.type==='usage')!.usage!.input,10);assert.equal(events.at(-1)?.type,'done');
    }
  }finally{globalThis.fetch=original;}
});
test('Anthropic has independent request/authentication and combines usage fragments',async()=>{
  const original=globalThis.fetch;let captured:any;
  try{
    globalThis.fetch=(async(url,options)=>{captured={url,body:JSON.parse(options!.body as string),headers:options!.headers};return new Response([
      {type:'message_start',message:{usage:{input_tokens:12,cache_read_input_tokens:4}}},
      {type:'content_block_delta',delta:{type:'text_delta',text:'hello'}},
      {type:'message_delta',usage:{output_tokens:3}}, {type:'message_stop'}
    ].map(e=>'event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n').join(''));}) as typeof fetch;
    const events=[];for await(const e of stream({provider:'anthropic',baseUrl:presets.anthropic.url,model:'fixture-claude',key:'fixture-key',maxTokens:64},[{role:'system',content:'policy'},{role:'user',content:'hello'}],new AbortController().signal))events.push(e);
    assert(captured.url.endsWith('/messages'));assert.equal(captured.headers['x-api-key'],'fixture-key');assert(!captured.headers.Authorization);
    assert.equal(captured.body.system,'policy');assert.equal(captured.body.messages.length,1);assert.deepEqual(events.find(e=>e.type==='usage')!.usage,{input:12,output:3,cached:4,source:'provider'});
  }finally{globalThis.fetch=original;}
});
test('invalid credentials and truncated streams are visible errors, not successful answers',async()=>{
  const original=globalThis.fetch;
  const config={provider:'deepseek' as const,baseUrl:presets.deepseek.url,model:'fixture',key:'fixture-key',maxTokens:64};
  const run=async()=>{for await(const _ of stream(config,[{role:'user' as const,content:'hello'}],new AbortController().signal)){}};
  try{
    globalThis.fetch=(async()=>new Response('private server body',{status:401})) as typeof fetch;
    await assert.rejects(run,/API Key 无效/);
    globalThis.fetch=(async()=>new Response('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n')) as typeof fetch;
    await assert.rejects(run,/意外结束/);
  }finally{globalThis.fetch=original;}
});
