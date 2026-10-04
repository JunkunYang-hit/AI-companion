export const sessionIdleLimit=12*3600_000;
export class ConversationClock {
  constructor(public lastActivity=Date.now()){}
  expired(now=Date.now()){return now-this.lastActivity>=sessionIdleLimit;}
  touch(now=Date.now()){this.lastActivity=now;}
}
