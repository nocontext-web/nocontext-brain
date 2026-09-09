begin;
alter table public.email_inbox add column if not exists thread_id text;
alter table public.email_inbox add column if not exists reply_state text;
alter table public.email_inbox add column if not exists checked_at timestamptz;
alter table public.email_inbox add column if not exists last_message_at timestamptz;
create table if not exists public.source_sync_status(source text primary key,checked_at timestamptz not null default now(),succeeded boolean not null,error text,details jsonb);
alter table public.source_sync_status enable row level security;
grant all on public.source_sync_status to service_role;
create or replace function public.save_email_thread(p_email jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtext('email-thread:'||(p_email->>'thread_id')));
 if exists(select 1 from email_inbox where thread_id=p_email->>'thread_id' and last_message_at>(p_email->>'last_message_at')::timestamptz) then return false;end if;
 update email_inbox set needs_attention=false,reply_state='superseded',checked_at=now() where thread_id=p_email->>'thread_id' and message_id<>p_email->>'message_id';
 insert into email_inbox(message_id,thread_id,subject,from_address,received_at,snippet,body,needs_attention,priority,reason,suggested_reply,related_client,status,reply_state,checked_at,last_message_at)
 values(p_email->>'message_id',p_email->>'thread_id',p_email->>'subject',p_email->>'from_address',(p_email->>'received_at')::timestamptz,p_email->>'snippet',p_email->>'body',(p_email->>'needs_attention')::boolean,p_email->>'priority',p_email->>'reason',p_email->>'suggested_reply',p_email->>'related_client','unread',p_email->>'reply_state',now(),(p_email->>'last_message_at')::timestamptz)
 on conflict(message_id) do update set thread_id=excluded.thread_id,needs_attention=excluded.needs_attention,priority=excluded.priority,reason=excluded.reason,suggested_reply=excluded.suggested_reply,related_client=excluded.related_client,reply_state=excluded.reply_state,checked_at=excluded.checked_at,last_message_at=excluded.last_message_at;
 return true;
end $$;
revoke all on function public.save_email_thread(jsonb) from public,anon,authenticated;
grant execute on function public.save_email_thread(jsonb) to service_role;
commit;

begin;
create or replace function public.replace_calendar_window(p_start timestamptz,p_end timestamptz,p_events jsonb)
returns void language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtext('calendar-sync'));
 delete from calendar_events where start_time>=p_start and start_time<p_end;
 insert into calendar_events(id,title,start_time,end_time,location,description,attendees,updated_at)
 select e->>'id',e->>'title',(e->>'start_time')::timestamptz,(e->>'end_time')::timestamptz,e->>'location',e->>'description',array(select jsonb_array_elements_text(e->'attendees')),now() from jsonb_array_elements(p_events)e
 on conflict(id)do update set title=excluded.title,start_time=excluded.start_time,end_time=excluded.end_time,location=excluded.location,description=excluded.description,attendees=excluded.attendees,updated_at=excluded.updated_at;
 insert into source_sync_status(source,checked_at,succeeded,error,details)values('calendar',now(),true,null,jsonb_build_object('events',jsonb_array_length(p_events)))on conflict(source)do update set checked_at=now(),succeeded=true,error=null,details=excluded.details;
end $$;
revoke all on function public.replace_calendar_window(timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.replace_calendar_window(timestamptz,timestamptz,jsonb) to service_role;
commit;

begin;
create table if not exists public.briefing_deliveries(day_key text primary key,status text not null check(status in ('preparing','sending','sent','uncertain')),message text,error text,created_at timestamptz not null default now());
alter table public.briefing_deliveries enable row level security;
grant all on public.briefing_deliveries to service_role;
commit;
