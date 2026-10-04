import type {Settings} from '../shared/types';
import {localDay} from '../costs/budget';
export type ProactiveKind='idle'|'break'|'review';
export class ProactivePolicy {
  sent:number[]=[]; lastChat=0; unanswered=0; lastTopic=''; lastClick=0; lastAttempt=0;
  click(now:number):boolean {if(now-this.lastClick<1200)return false;this.lastClick=now;return true;}
  replied(now:number){this.lastChat=now;this.unanswered=0;}
  allow(s:Settings,state:{hidden:boolean;fullscreen:boolean;busy:boolean;key:boolean;learning:boolean;review:boolean},kind:ProactiveKind,now:number,displayCheck=false):boolean {
    if(s.dnd||s.mode==='reply'||s.todayQuiet===localDay(now)||(!s.backgroundAI&&!(state.learning&&state.review&&kind!=='idle'))||state.hidden||state.fullscreen||state.busy||!state.key)return false;
    if(kind==='review'&&(!state.learning||!state.review))return false;
    if(kind==='break'&&!state.learning)return false;
    const limits=s.mode==='custom'?[s.proactiveHourlyLimit,s.proactiveInterval]:{quiet:[1,45],normal:[2,20],active:[12,5]}[s.mode];
    if(!limits)return false;
    const recent=this.sent.filter(t=>now-t<3600_000);
    const cooldown=limits[1]*60_000*(this.unanswered>=2?2:1);
    if(recent.length>=limits[0]||now-(this.sent.at(-1)??0)<cooldown||now-this.lastChat<Math.min(limits[1],2)*60_000)return false;
    if(!displayCheck&&now-this.lastAttempt<cooldown)return false;
    if(kind==='idle'&&state.learning&&now-(this.sent.at(-1)??0)<45*60_000)return false;
    return true;
  }
  mark(kind:ProactiveKind,now:number){this.sent.push(now);this.sent=this.sent.filter(t=>now-t<3600_000);this.unanswered++;this.lastTopic=kind;}
}
