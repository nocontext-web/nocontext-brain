#!/usr/bin/env node
// Three-way sync. Concurrent edits and deletions need human resolution.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
require('dotenv').config({path:process.env.BRAIN_ENV_FILE || path.join(os.homedir(),'nocontext-brain/.env.local')});
const {createClient}=require('@supabase/supabase-js');
const {hash,decide,safePath}=require('./vault-sync-core.cjs');
const vault=process.env.OBSIDIAN_VAULT || path.join(os.homedir(),'nocontext-vault');
const statePath=path.join(vault,'.caspar-sync-state.json');
const folders=new Set(['Clients','Creators','Culture','Campaigns','Taste','Josh','People','Decisions','Creative','Rules','Caspar','Daily']);
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY);
let busy=false;
async function scan(dir,relative='',out=new Map()){
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  if(entry.isSymbolicLink())continue;
  const rel=path.join(relative,entry.name);
  if(!relative&&!folders.has(entry.name))continue;
  if(entry.isDirectory())await scan(path.join(dir,entry.name),rel,out);
  else if(entry.name.endsWith('.md'))out.set(rel,await fs.readFile(path.join(dir,entry.name),'utf8'));
 }return out;
}
async function sync(){
 if(busy)return;busy=true;
 try{
  let state={};try{state=JSON.parse(await fs.readFile(statePath,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;}
  const local=await scan(vault),remote=new Map();
  for(let offset=0;;offset+=500){const {data,error}=await db.from('obsidian_notes').select('path,content,updated_at').order('path').range(offset,offset+499);if(error)throw error;for(const n of data)if(folders.has(n.path.split('/')[0]))remote.set(n.path,n);if(data.length<500)break;}
  for(const rel of new Set([...local.keys(),...remote.keys()])){
   const target=safePath(vault,rel),l=local.get(rel)??null,row=remote.get(rel),r=row?.content??null;
   const action=decide(l,r,state[rel]);
   if(action==='same'){state[rel]=hash(l);continue;}
   if(action==='conflict'){
    // Preserve the remote version separately; never replace either side.
    if(r!==null){const conflict=safePath(path.join(vault,'Sync Conflicts'),rel+'.remote-'+hash(r).slice(0,8)+'.md');await fs.mkdir(path.dirname(conflict),{recursive:true});await fs.writeFile(conflict,r,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});}
    console.warn('Needs review in Sync Conflicts:',rel);continue;
   }
   // Recheck the local file immediately before committing a remote change.
   let current=null;try{current=await fs.readFile(target,'utf8')}catch(e){if(e.code!=='ENOENT')throw e;}
   if(current!==l)continue;
   if(action==='pull'){await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,r);state[rel]=hash(r);}
   else{
    const body={path:rel,folder:rel.split('/')[0],title:path.basename(rel,'.md'),content:l,source:'watcher',updated_at:new Date().toISOString()};
    const result=row?await db.from('obsidian_notes').update(body).eq('path',rel).eq('updated_at',row.updated_at).select('path'):await db.from('obsidian_notes').insert(body).select('path');
    if(result.error){if(result.error.code==='23505')continue;throw result.error;}
    if(result.data?.length)state[rel]=hash(l);
   }
  }
  await fs.writeFile(statePath+'.tmp',JSON.stringify(state));await fs.rename(statePath+'.tmp',statePath);
 }finally{busy=false;}
}
if(require.main===module){sync().catch(console.error);setInterval(()=>sync().catch(console.error),15000);}
module.exports={sync};
