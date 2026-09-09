import { latestThreadMessage, sentByMe } from '@/lib/email-thread'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { getAuthClient } from '@/lib/google'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Gmail query — exclude obvious noise at the API level before we even fetch
const GMAIL_QUERY = [
  '-category:promotions',
  '-category:social',
  '-from:noreply',
  '-from:no-reply',
  '-from:notifications@',
  '-from:donotreply',
  '-from:billing@',
  '-from:invoices@',
  '-from:receipts@',
  '-from:facebookmail.com',
  '-from:meta.com',
  '-from:business.facebook.com',
  '-from:google.com',
  '-from:accounts.google',
  '-from:tiktok',
  '-from:linkedin',
  '-from:slack',
  '-from:asana',
  '-from:mailchimp',
  '-from:hubspot',
  '-subject:receipt',
  '-subject:invoice',
  '-subject:payment confirmation',
  '-subject:your order',
  '-subject:unsubscribe',
  '-subject:newsletter',
].join(' ')

type EmailClassification = {
  needsAttention: boolean
  reason: string         // why it does/doesn't need attention
  suggestedReply?: string // brief note on what response is needed
  relatedClient?: string  // if it's about a client
  priority: 'high' | 'normal' | 'ignore'
}

async function classifyEmail(
  subject: string,
  from: string,
  snippet: string,
  clientNames: string[]
): Promise<EmailClassification> {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `You are filtering emails for Josh Kessel, founder of NO CONTEXT creative agency in Sydney.

Email:
From: ${from}
Subject: ${subject}
Latest message body: ${snippet.slice(0, 6000)}

This is the latest received message in a freshly checked thread. Quoted older messages are context, not new requests.

Known clients: ${clientNames.slice(0, 20).join(', ')}

Classify this email. Return JSON only:
{
  "needsAttention": true/false,
  "priority": "high" | "normal" | "ignore",
  "reason": "one sentence",
  "suggestedReply": "what Josh needs to do — only if needsAttention is true",
  "relatedClient": "client name if relevant, else null"
}

needsAttention = true if: someone is waiting for a reply, a decision is needed, a client is asking something, a potential client reached out, a deliverable is being sent for review, a meeting is being requested.

needsAttention = false if: it's automated, a receipt, a notification, a system email, a newsletter, a billing confirmation, a report, or doesn't require any action from Josh.

Team ownership: Ria owns creator/influencer partnership threads end-to-end (collab logistics, deliverables, posting schedules, outreach follow-ups) via ClickUp — these don't need Josh even when they look like a decision is pending. If the email is about a brand x creator collab or influencer partnership, set needsAttention to false UNLESS it's a brand-new partnership opportunity that hasn't been scoped yet, a budget/fee negotiation, or a legal/contract dispute — those still need Josh.

priority "high" = client question, potential new business, something time-sensitive.
priority "normal" = needs reply but not urgent.
priority "ignore" = automated or no action needed.`
    }],
  })

  const text = res.content[0].type === 'text' ? res.content[0].text : ''
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const value = JSON.parse(match[0])
      if (typeof value.needsAttention === 'boolean' && typeof value.reason === 'string' && ['high','normal','ignore'].includes(value.priority)) return value
    }
  } catch { /* fall through */ }

  throw new Error('Email classification could not be verified')
}

function extractBody(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part)
      if (text) return text
    }
  }
  return ''
}

export async function POST() {
 try {
  const {auth,email}=await getAuthClient();const gmail=google.gmail({version:'v1',auth});
  const {data:clients,error:clientError}=await supabase.from('clients').select('name');if(clientError)throw clientError;
  const {data:existing,error:existingError}=await supabase.from('email_inbox').select('message_id,thread_id,needs_attention,priority,reason,suggested_reply,related_client,reply_state').or(`needs_attention.eq.true,received_at.gte.${new Date(Date.now()-30*86400e3).toISOString()}`).limit(1000);if(existingError)throw existingError;
  const threadIds=new Set<string>();let pageToken:string|undefined;
  do {
   const response=await gmail.users.threads.list({userId:'me',q:`newer_than:30d ${GMAIL_QUERY}`,maxResults:100,pageToken});
   for(const t of response.data.threads??[])if(t.id)threadIds.add(t.id);
   pageToken=response.data.nextPageToken??undefined;
  }while(pageToken);
  // Always recheck previously flagged threads, even when they are older than the discovery window.
  for(const row of existing??[]){
   if(row.thread_id){threadIds.add(row.thread_id);continue;}
   try{const m=await gmail.users.messages.get({userId:'me',id:row.message_id,format:'minimal'});if(m.data.threadId){threadIds.add(m.data.threadId);const {error}=await supabase.from('email_inbox').update({thread_id:m.data.threadId}).eq('message_id',row.message_id);if(error)throw error;}}
   catch(error:any){if(error.code!==404)throw error;const {error:saveError}=await supabase.from('email_inbox').update({needs_attention:false,reply_state:'removed',checked_at:new Date().toISOString()}).eq('message_id',row.message_id);if(saveError)throw saveError;}
  }
  let synced=0,needsAttention=0;
  for(const threadId of threadIds){
   let thread;
   try{thread=await gmail.users.threads.get({userId:'me',id:threadId,format:'full'})}
   catch(error:any){if(error.code!==404)throw error;const {error:saveError}=await supabase.from('email_inbox').update({needs_attention:false,reply_state:'removed',checked_at:new Date().toISOString()}).eq('thread_id',threadId);if(saveError)throw saveError;continue;}
   const latest=latestThreadMessage(thread.data.messages??[]);
   if(!latest?.id){const {error}=await supabase.from('email_inbox').update({needs_attention:false,reply_state:'removed',checked_at:new Date().toISOString()}).eq('thread_id',threadId);if(error)throw error;continue;}
   const headers=latest.payload?.headers??[];const header=(name:string)=>headers.find(h=>h.name?.toLowerCase()===name.toLowerCase())?.value??'';
   const mine=sentByMe(latest,email);const body=extractBody(latest.payload)||latest.snippet||'';
   const previous=existing?.find(r=>r.message_id===latest.id&&['awaiting_reply','no_action'].includes(r.reply_state));
   const classification=mine?{needsAttention:false,priority:'ignore',reason:'The latest message in this thread was sent by you',suggestedReply:null,relatedClient:null}:previous?{needsAttention:previous.needs_attention,priority:previous.priority,reason:previous.reason,suggestedReply:previous.suggested_reply,relatedClient:previous.related_client}:await classifyEmail(header('Subject'),header('From'),body,(clients??[]).map(c=>c.name));
   const receivedAt=new Date(Number(latest.internalDate)).toISOString();
   const {error}=await supabase.rpc('save_email_thread',{p_email:{message_id:latest.id,thread_id:threadId,subject:header('Subject')||'(no subject)',from_address:header('From'),received_at:receivedAt,last_message_at:receivedAt,snippet:(latest.snippet||'').slice(0,500),body:body.slice(0,3000),needs_attention:classification.needsAttention,priority:classification.priority,reason:classification.reason,suggested_reply:classification.suggestedReply??null,related_client:classification.relatedClient??null,reply_state:mine?'replied':classification.needsAttention?'awaiting_reply':'no_action'}});if(error)throw error;
   synced++;if(classification.needsAttention)needsAttention++;
  }
  const {error:statusError}=await supabase.from('source_sync_status').upsert({source:'gmail',checked_at:new Date().toISOString(),succeeded:true,error:null,details:{synced,needsAttention}},{onConflict:'source'});if(statusError)throw statusError;
  return NextResponse.json({ok:true,synced,needsAttention});
 }catch(error:any){await supabase.from('source_sync_status').upsert({source:'gmail',checked_at:new Date().toISOString(),succeeded:false,error:error.message},{onConflict:'source'});return NextResponse.json({ok:false,error:error.message},{status:500})}
}
