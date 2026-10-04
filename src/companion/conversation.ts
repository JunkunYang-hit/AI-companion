import type {PromptMessage} from '../providers/stream';
export interface ConversationMessage extends PromptMessage {id:string}
// 已显示的对话暂存在当前会话内；不保存历史也能接上伙伴主动的话题。
export function conversationHistory(saved:ConversationMessage[],recent:ConversationMessage[]):PromptMessage[]{
  const ids=new Set(recent.map(m=>m.id));
  return [...saved.filter(m=>!ids.has(m.id)),...recent].slice(-24).map(({role,content})=>({role,content}));
}
