export function sydneyDayBoundsUTC(now:Date) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
 function midnight(day:number){const wall=Date.UTC(get('year'),get('month')-1,day);let guess=wall;for(let i=0;i<3;i++){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));const n=(k:string)=>Number(p.find(x=>x.type===k)!.value);const actual=Date.UTC(n('year'),n('month')-1,n('day'),n('hour'),n('minute'),n('second'));guess+=wall-actual;}return new Date(guess)}
 const startOfDay=midnight(get('day')),nextDay=midnight(get('day')+1);return {startOfDay,endOfDay:new Date(nextDay.getTime()-1),nextDay};
}
