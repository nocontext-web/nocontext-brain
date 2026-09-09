import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revenueSummary } from '../lib/revenue.ts';
import { authorized } from '../lib/access.ts';
import { clientInput } from '../lib/client-input.ts';

test('retainers exclude prospects, paused and project clients; missing is distinct from zero', () => {
  const result = revenueSummary([
    {id:'1',name:'Active',status:'active',monthly_value:'4000'},
    {id:'2',name:'Prospect',status:'prospect',monthly_value:3000},
    {id:'3',name:'Paused',status:'paused',monthly_value:5000},
    {id:'4',name:'Project',status:'adhoc',monthly_value:8000},
    {id:'5',name:'Missing',status:'active',monthly_value:null},
    {id:'6',name:'Zero',status:'active',monthly_value:0},
  ]);
  assert.equal(result.contracted,4000); assert.equal(result.pipeline,3000); assert.equal(result.missing,1);
});
test('authentication is closed without configuration and service access is API-only', () => {
  assert.equal(authorized('', '/api/clients', {}),false);
  assert.equal(authorized('Bearer undefined','/api/clients',{}),false);
  const env = {BRAIN_AUTH_USER:'owner',BRAIN_AUTH_PASSWORD:'example',BRAIN_SERVICE_TOKEN:'worker'};
  assert.equal(authorized('Basic '+Buffer.from('owner:example').toString('base64'),'/clients',env),true);
  assert.equal(authorized('Basic '+Buffer.from('owner:wrong').toString('base64'),'/clients',env),false);
  assert.equal(authorized('Bearer worker','/api/sync/calendar',env),true);
  assert.equal(authorized('Bearer worker','/clients',env),false);
});
test('client changes cannot rewrite IDs and retainers must be valid numbers', () => {
  assert.deepEqual(clientInput({id:'overwrite',name:' Example ',monthly_value:0},true),{name:'Example',monthly_value:0});
  assert.throws(()=>clientInput({name:' ',monthly_value:10},true));
  assert.throws(()=>clientInput({monthly_value:-1}));
  assert.throws(()=>clientInput({monthly_value:NaN}));
  assert.throws(()=>clientInput({monthly_value:'4000'}));
});

const { COUNTRIES, normalizeToList } = await import('../lib/creator-taxonomy.ts');
test('country aliases distinguish US from Australia and leave ambiguous locations unknown', () => {
  assert.equal(normalizeToList('US', COUNTRIES), 'United States');
  assert.equal(normalizeToList('USA', COUNTRIES), 'United States');
  assert.equal(normalizeToList('AU', COUNTRIES), 'Australia');
  assert.equal(normalizeToList('aus', COUNTRIES), 'Australia');
  assert.equal(normalizeToList('maybe travelling', COUNTRIES), null);
});

const { latestThreadMessage, sentByMe, eventPhase } = await import('../lib/email-thread.ts');
const { sydneyDayBoundsUTC } = await import('../lib/sydney-time.ts');
test('a newer sent reply clears waiting-on-you; a later incoming reply reopens assessment',()=>{
 const received={id:'inbound',internalDate:'1000',labelIds:['INBOX'],payload:{headers:[{name:'From',value:'Lauren <lauren@example.com>'}]}};
 const reply={id:'reply',internalDate:'2000',labelIds:['SENT']};
 assert.equal(sentByMe(latestThreadMessage([reply,received]),'josh@example.com'),true);
 const newer={...received,id:'new',internalDate:'3000'};
 assert.equal(sentByMe(latestThreadMessage([newer,received,reply]),'josh@example.com'),false);
 const draft={id:'draft',internalDate:'4000',labelIds:['DRAFT']};
 assert.equal(latestThreadMessage([draft,newer,reply]).id,'new');
});
test('an alias marked SENT counts as a reply and email header matching is exact',()=>{
 assert.equal(sentByMe({labelIds:['SENT']},'josh@example.com'),true);
 assert.equal(sentByMe({payload:{headers:[{name:'from',value:'Josh <JOSH@example.com>'}]}},'josh@example.com'),true);
 assert.equal(sentByMe({payload:{headers:[{name:'From',value:'otherjosh@example.com'}]}},'josh@example.com'),false);
});
test('the 7:30 meeting is already ended at a 9am briefing',()=>{
 assert.equal(eventPhase('2026-09-08T21:30:00Z','2026-09-08T22:00:00Z',new Date('2026-09-08T23:00:00Z')),'already ended');
});
test('Sydney day boundaries account for daylight-saving transition days',()=>{
 const spring=sydneyDayBoundsUTC(new Date('2026-10-04T01:00:00Z'));
 assert.equal((spring.nextDay-spring.startOfDay)/3600000,23);
 const autumn=sydneyDayBoundsUTC(new Date('2026-04-05T01:00:00Z'));
 assert.equal((autumn.nextDay-autumn.startOfDay)/3600000,25);
});
