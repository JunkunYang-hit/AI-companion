import type {Settings,Usage} from '../shared/types';
export function localDay(now=Date.now()):string {const d=new Date(now);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function costOf(usage:Usage,s:Settings):number|null {
  if(s.inputPrice===null||s.outputPrice===null||usage.input===null||usage.output===null)return null;
  const cached=Math.min(usage.input,Math.max(0,usage.cached??0));
  return ((usage.input-cached)*s.inputPrice+cached*(s.cachedInputPrice??s.inputPrice)+usage.output*s.outputPrice)/1_000_000;
}
export class Budget {
  pending=false;
  reserve(s:Settings,background:boolean,records:any[],inputChars:number):()=>void {
    if(this.pending)throw new Error('正在生成，请先停止或等本次完成。');
    const today=records.filter(r=>localDay(r.created_at)===localDay());
    if(background&&today.filter(r=>r.kind!=='chat'&&r.provider!=='mock').length>=s.backgroundDailyLimit)throw new Error('今日后台调用次数已达到上限。');
    if(s.dailyBudget!==null){
      if(s.inputPrice===null||s.outputPrice===null)throw new Error('设置金额预算后，请先填写单价；当前无法保证金额上限。');
      if(today.some(r=>r.provider!=='mock'&&r.cost===null))throw new Error('今日存在未知费用，已暂停调用。请核实供应商用量后调整预算。');
      const upper=((inputChars+512)*s.inputPrice+s.maxOutputTokens*s.outputPrice)/1_000_000;
      if(today.reduce((a,r)=>a+(r.cost??0),0)+upper>s.dailyBudget)throw new Error('今日 AI 预算不足，已停止调用。');
    }
    this.pending=true;return ()=>{this.pending=false;};
  }
}
