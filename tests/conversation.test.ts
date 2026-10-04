import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationHistory} from '../src/companion/conversation';
test('assistant-initiated topics survive private replies and saving toggles without duplication',()=>{
 const proposal={id:'a',role:'assistant' as const,content:'今天想聊哪一本书？'};
 const reply={id:'u',role:'user' as const,content:'就聊你刚才提出的那个话题。'};
 assert.deepEqual(conversationHistory([], [proposal,reply]),[{role:'assistant',content:proposal.content},{role:'user',content:reply.content}]);
 assert.deepEqual(conversationHistory([reply],[proposal,reply]),conversationHistory([], [proposal,reply]));
 assert.deepEqual(conversationHistory([proposal,reply],[proposal,reply]),conversationHistory([], [proposal,reply]));
});
