export type ThreadMessage = {id?:string|null;internalDate?:string|null;labelIds?:string[]|null;snippet?:string|null;payload?:{headers?:{name?:string|null;value?:string|null}[]|null}|null};
export function latestThreadMessage(messages:ThreadMessage[]) {
 return messages.filter(m=>!m.labelIds?.some(l=>['DRAFT','TRASH','SPAM'].includes(l))).sort((a,b)=>Number(b.internalDate||0)-Number(a.internalDate||0))[0]??null;
}
export function sentByMe(message:ThreadMessage,email:string) {
 if(message.labelIds?.includes('SENT'))return true;
 const from=message.payload?.headers?.find(h=>h.name?.toLowerCase()==='from')?.value||'';
 const address=(from.match(/<([^>]+)>/)?.[1]||from).trim().toLowerCase();
 return address===email.toLowerCase();
}
export function eventPhase(start:string,end:string|null|undefined,now:Date) {
 const s=Date.parse(start),e=end?Date.parse(end):s;
 return e<=now.getTime()?'already ended':s<=now.getTime()?'in progress':'upcoming';
}
