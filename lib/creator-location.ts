// Only explicit residence statements qualify. Travel, audience and imagery do not.
const places: Record<string,string> = {
 'australia':'Australia','sydney':'Australia','melbourne':'Australia','brisbane':'Australia','perth':'Australia',
 'united states':'United States','usa':'United States','new york':'United States','los angeles':'United States',
 'united kingdom':'United Kingdom','uk':'United Kingdom','london':'United Kingdom',
 'canada':'Canada','toronto':'Canada','vancouver':'Canada','new zealand':'New Zealand','auckland':'New Zealand'
};
export function creatorLocation(sources: {text:string;url:string;kind:string}[]) {
 const evidence: {country:string;quote:string;url:string;kind:string}[]=[];
 for(const source of sources){
  const pattern=/\b(?:based in|living in|i live in|home is in)\s+([^.!?\n|]{2,65})/gi;
  for(const match of source.text.matchAll(pattern)){
   // Negated or hypothetical residence is not evidence.
   const prefix=source.text.slice(Math.max(0,match.index!-30),match.index);
   if(/(?:not|never|wish|want to be|used to be|previously|formerly)\s*$/i.test(prefix))continue;
   const location=match[1].toLowerCase();
   const countries=[...new Set(Object.entries(places).filter(([place])=>new RegExp(`\\b${place}\\b`,'i').test(location)).map(([,country])=>country))];
   if(countries.length===1)evidence.push({country:countries[0],quote:match[0],url:source.url,kind:source.kind});
  }
 }
 const countries=[...new Set(evidence.map(e=>e.country))];
 return {country:countries.length===1?countries[0]:'',status:countries.length===1?'stated':countries.length>1?'conflicting':'unknown',evidence};
}
