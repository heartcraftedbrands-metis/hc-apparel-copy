import { createClient } from 'npm:@supabase/supabase-js@2';
import { getSupabaseServiceKey } from '../_shared/supabaseCredentials.ts';

type Row = Record<string, any>;
const SITE='https://www.ilovehcapparel.net';
const SENDER='support@ilovehcapparel.net';
const LOGO='https://bxsdajpldrdesnvjiubt.supabase.co/storage/v1/object/public/storefront-assets/legacy/8498fd234f415ff5_4bf10d633_1.png';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const esc=(value:unknown)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const money=(value:unknown)=>value===null||value===undefined?'Not available':`$${Number(value).toFixed(2)}`;
const fmt=(value:unknown)=>value===null||value===undefined?'Not available':Number(value).toLocaleString('en-US');
const eventKey=(value:unknown)=>String(value||'').toLowerCase().replaceAll('_','').replaceAll('-','');
const sameId=(a:unknown,b:unknown)=>String(a||'').replace(/^<|>$/g,'')===String(b||'').replace(/^<|>$/g,'');

function easternParts(date=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,weekday:parts.weekday,hour:Number(parts.hour),day:Number(parts.day)};
}
const greetings=[
  'Good morning. Purpose grows stronger when today’s next step is clear.',
  'Good morning. Creativity becomes momentum when care and consistency move together.',
  'Good morning. Sustainable growth is built one thoughtful customer decision at a time.',
  'Good morning. Perseverance turns small, well-measured improvements into lasting progress.',
  'Good morning. Service is how our best ideas become meaningful experiences for others.',
  'Good morning. Let today’s priorities protect both the craft and the customer.',
  'Good morning. The clearest path forward is the one we can act on with care today.'
];

async function brevoGet(key:string,path:string){
  const response=await fetch(`https://api.brevo.com/v3${path}`,{headers:{'api-key':key,accept:'application/json'},signal:AbortSignal.timeout(15000)});
  const body=await response.json().catch(()=>({}));
  return {ok:response.ok,status:response.status,body};
}

async function sendBrevo(key:string,recipient:Row,subject:string,html:string,text:string,operationKey:string){
  const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':key,accept:'application/json','content-type':'application/json'},body:JSON.stringify({
    sender:{email:SENDER,name:'HC Apparel'},to:[{email:recipient.email,name:recipient.display_name}],replyTo:{email:SENDER,name:'HC Apparel Support'},subject,htmlContent:html,textContent:text,
    tags:['hc-operations-report'],headers:{'Idempotency-Key':`${operationKey}:${recipient.email}`}
  }),signal:AbortSignal.timeout(20000)});
  const body=await response.json().catch(()=>({}));
  return {ok:response.ok&&Boolean(body.messageId),status:response.status,messageId:body.messageId||null};
}

function renderReport(snapshot:Row,recipient:Row,label:string,isSample:boolean){
  const k=snapshot.kpis||{},queues=snapshot.work_queues||{},alerts=snapshot.alerts||[],trends=snapshot.trends||[],availability=snapshot.data_availability||{};
  const urgent=[...(alerts.filter((a:Row)=>a.severity==='critical').map((a:Row)=>`${a.workflow}: ${a.next_action}`)),...(queues.orders_needing_attention||[]).slice(0,2).map((o:Row)=>`Order ${String(o.id).slice(0,8)}: ${o.next_action}`)];
  const ceo=[
    queues.dtf_orders?.some((x:Row)=>x.next_action?.includes('Owner approval'))?'Review paid DTF orders awaiting owner approval.':'Review the KPI movement and choose one measurable growth action.',
    'Approve or refine customer-facing drafts; ordinary email replies never authorize sensitive actions.',
    'Review one verified trend opportunity before approving new public content or spend.'
  ];
  const yho=[
    queues.dtf_orders?.some((x:Row)=>x.next_action==='Verify freight')?'Verify exact DTF freight for waiting drafts.':'Review active orders for the next fulfillment step.',
    queues.inquiries?.length?'Prepare responses for open customer inquiries.':'Confirm the inquiry queue remains clear.',
    'Update assigned tasks, due dates, and blockers before the next briefing.'
  ];
  const rows=[['Website visits',fmt(k.website_visits)],['Qualified traffic',fmt(k.qualified_traffic)],['Orders',fmt(k.orders)],['Net sales',money(k.net_sales)],['Average order value',money(k.average_order_value)],['Gross profit',money(k.gross_profit)],['Checkout conversion',k.conversion_rate==null?'Not available':`${k.conversion_rate}%`],['DTF upload failures',fmt(k.dtf_upload_failures)],['DTF freight requests',fmt(k.dtf_quote_requests)]];
  const list=(items:string[])=>items.length?`<ul style="margin:8px 0 0;padding-left:20px;">${items.map(x=>`<li style="margin:6px 0;">${esc(x)}</li>`).join('')}</ul>`:'<p style="color:#68715f;">No items require action.</p>';
  const section=(title:string,body:string)=>`<h2 style="color:#2d441f;margin:24px 0 8px;font-size:20px;">${esc(title)}</h2>${body}`;
  const greeting=greetings[new Date().getUTCDate()%greetings.length];
  const sampleNotice=isSample?'<p style="background:#fff2cc;border:1px solid #d8af45;border-radius:10px;padding:12px;font-weight:700;">SAMPLE INTERNAL BRIEFING — validates the scheduled reporting and delivery workflow. It does not authorize a purchase, refund, credential change, supplier submission, deployment, or public message.</p>':'';
  const table=`<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rows.map(([a,b],i)=>`<tr style="background:${i%2?'#faf7ef':'#f0eadc'}"><td style="padding:9px;font-weight:700;">${a}</td><td align="right" style="padding:9px;">${b}</td></tr>`).join('')}</table>`;
  /* Replaced below with pre-composed sections to keep the edge bundler parser path simple.
  const html=`<!doctype html><html><body style="margin:0;background:#f7f3ea;color:#23271f;font-family:Arial,sans-serif;"><table role="presentation" width="100%"><tr><td align="center" style="padding:20px 10px;"><table role="presentation" width="100%" style="max-width:700px;background:#fff;border:1px solid #ddd3bf;border-radius:18px;overflow:hidden;"><tr><td align="center" style="background:#435d2b;padding:18px;"><img src="${LOGO}" width="145" alt="HC Apparel" style="display:block;width:145px;height:auto;"></td></tr><tr><td style="padding:26px;line-height:1.55;">${sampleNotice}<p style="font-size:18px;margin:0 0 14px;"><strong>${esc(greeting)}</strong></p><p>This ${esc(label)} briefing covers HC Apparel commerce and the separately connected Heart Command Center. Data freshness: ${esc(new Date(snapshot.generated_at).toLocaleString('en-US',{timeZone:'America/New_York'}))} Eastern.</p>${section('Urgent first',list(urgent))}${section('What happened',table)}${section('Why it matters',`<p>${k.orders||0} paid non-test order(s) and ${money(k.net_sales)} in net sales are recorded for the period. Missing data is labeled “Not available,” never treated as zero.</p>`)}${section('CEO / Creative Director — top three',list(ceo))}${section('YHo / Operations — top three',list(yho))}${section('Orders and customers needing attention',list([...(queues.orders_needing_attention||[]).slice(0,6).map((o:Row)=>`${o.customer_name}: ${o.next_action}`),...(queues.inquiries||[]).slice(0,4).map((x:Row)=>`${x.name}: ${x.next_action}`)]))}${section('Website and integration health',list(alerts.slice(0,6).map((a:Row)=>`${a.severity.toUpperCase()} — ${a.workflow}: ${a.next_action}`))}${section('Industry intelligence',trends.length?trends.slice(0,2).map((t:Row)=>`<p><a href="${esc(t.source_url)}" style="color:#435d2b;font-weight:700;">${esc(t.headline)}</a> <small>(${esc(t.observed_or_published_on)})</small><br><strong>Verified fact:</strong> ${esc(t.verified_fact)}<br><strong>Interpretation:</strong> ${esc(t.interpretation||'Not available')}<br><strong>Next step:</strong> ${esc(t.recommended_next_step)}</p>`).join(''):'<p>Not available.</p>')}${section('Known data limits',list(Object.entries(availability).map(([a,b])=>`${a.replaceAll('_',' ')}: ${b}`)))}<p style="margin-top:24px;"><a href="${SITE}/AdminBusinessIntelligence" style="display:inline-block;background:#435d2b;color:#fff;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:10px;">Open secure mobile action center</a></p><p style="font-size:13px;color:#68715f;">You may reply for context, but inbound reply-to-task automation is not configured. Sensitive actions require authenticated approval in the secure action center. It’s All About The Love!</p></td></tr></table></td></tr></table></body></html>`;
  const text=`${isSample?'SAMPLE INTERNAL BRIEFING\n\n':''}${greeting}\n\n${label} briefing for ${recipient.display_name}\nData freshness: ${snapshot.generated_at}\n\nURGENT\n${urgent.length?urgent.map(x=>`- ${x}`).join('\n'):'No urgent items.'}\n\nKPIs\n${rows.map(([a,b])=>`${a}: ${b}`).join('\n')}\n\nCEO ACTIONS\n${ceo.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nYHO ACTIONS\n${yho.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nSecure action center: ${SITE}/AdminBusinessIntelligence\n\nReplies do not authorize sensitive actions. It's All About The Love!`;
  */
  const orderItems=[...(queues.orders_needing_attention||[]).slice(0,6).map((o:Row)=>`${o.customer_name}: ${o.next_action}`),...(queues.inquiries||[]).slice(0,4).map((x:Row)=>`${x.name}: ${x.next_action}`)];
  const healthItems=alerts.slice(0,6).map((a:Row)=>`${a.severity.toUpperCase()} — ${a.workflow}: ${a.next_action}`);
  const trendHtml=trends.length?trends.slice(0,2).map((t:Row)=>`<p><a href="${esc(t.source_url)}" style="color:#435d2b;font-weight:700;">${esc(t.headline)}</a> <small>(${esc(t.observed_or_published_on)})</small><br><strong>Verified fact:</strong> ${esc(t.verified_fact)}<br><strong>Interpretation:</strong> ${esc(t.interpretation||'Not available')}<br><strong>Next step:</strong> ${esc(t.recommended_next_step)}</p>`).join(''):'<p>Not available.</p>';
  const limitItems=Object.entries(availability).map(([a,b])=>`${a.replaceAll('_',' ')}: ${b}`);
  const why=`<p>${k.orders||0} paid non-test order(s) and ${money(k.net_sales)} in net sales are recorded for the period. Missing data is labeled “Not available,” never treated as zero.</p>`;
  const generated=esc(new Date(snapshot.generated_at).toLocaleString('en-US',{timeZone:'America/New_York'}));
  const reportBody=[section('Urgent first',list(urgent)),section('What happened',table),section('Why it matters',why),section('CEO / Creative Director — top three',list(ceo)),section('YHo / Operations — top three',list(yho)),section('Orders and customers needing attention',list(orderItems)),section('Website and integration health',list(healthItems)),section('Industry intelligence',trendHtml),section('Known data limits',list(limitItems))].join('');
  const html=`<!doctype html><html><body style="margin:0;background:#f7f3ea;color:#23271f;font-family:Arial,sans-serif;"><table role="presentation" width="100%"><tr><td align="center" style="padding:20px 10px;"><table role="presentation" width="100%" style="max-width:700px;background:#fff;border:1px solid #ddd3bf;border-radius:18px;overflow:hidden;"><tr><td align="center" style="background:#435d2b;padding:18px;"><img src="${LOGO}" width="145" alt="HC Apparel" style="display:block;width:145px;height:auto;"></td></tr><tr><td style="padding:26px;line-height:1.55;">${sampleNotice}<p style="font-size:18px;margin:0 0 14px;"><strong>${esc(greeting)}</strong></p><p>This ${esc(label)} briefing covers HC Apparel commerce and the separately connected Heart Command Center. Data freshness: ${generated} Eastern.</p>${reportBody}<p style="margin-top:24px;"><a href="${SITE}/AdminBusinessIntelligence" style="display:inline-block;background:#435d2b;color:#fff;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:10px;">Open secure mobile action center</a></p><p style="font-size:13px;color:#68715f;">You may reply for context, but inbound reply-to-task automation is not configured. Sensitive actions require authenticated approval in the secure action center. It’s All About The Love!</p></td></tr></table></td></tr></table></body></html>`;
  const text=`${isSample?'SAMPLE INTERNAL BRIEFING\n\n':''}${greeting}\n\n${label} briefing for ${recipient.display_name}\nData freshness: ${snapshot.generated_at}\n\nURGENT\n${urgent.length?urgent.map(x=>`- ${x}`).join('\n'):'No urgent items.'}\n\nKPIs\n${rows.map(([a,b])=>`${a}: ${b}`).join('\n')}\n\nCEO ACTIONS\n${ceo.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nYHO ACTIONS\n${yho.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nSecure action center: ${SITE}/AdminBusinessIntelligence\n\nReplies do not authorize sensitive actions. It's All About The Love!`;
  return {html,text};
}

Deno.serve(async request=>{
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const url=Deno.env.get('SUPABASE_URL')||'',serviceKey=getSupabaseServiceKey(),brevoKey=Deno.env.get('BREVO_API_KEY')||'';
  if(!url||!serviceKey||!brevoKey)return json({error:'Required operations configuration is unavailable'},503);
  const db=createClient(url,serviceKey,{db:{schema:'public'}});
  const {data:config}=await db.from('operations_runtime_config').select('*').eq('id',true).maybeSingle();
  if(!config||request.headers.get('x-operations-token')!==config.monitor_token)return json({error:'Not authorized'},401);
  const body=await request.json().catch(()=>({}));
  if(body.action!=='tick')return json({error:'Unsupported action'},400);

  // Reconcile provider acceptance with delivery events before any send decision.
  const {data:acceptedRuns=[]}=await db.from('operations_report_runs').select('*').in('status',['accepted','partial']).gte('created_at',new Date(Date.now()-7*86400000).toISOString());
  for(const run of acceptedRuns||[]){
    const eventsByRecipient:Row={}; let delivered=0,failed=0;
    for(const [email,messageId] of Object.entries(run.provider_message_ids||{})){
      const lookup=await brevoGet(brevoKey,`/smtp/statistics/events?email=${encodeURIComponent(email)}&days=7&sort=desc&limit=100&offset=0`);
      const events=(Array.isArray(lookup.body?.events)?lookup.body.events:[]).filter((e:Row)=>sameId(e.messageId,messageId));
      eventsByRecipient[email]=events.map((e:Row)=>({event:e.event,date:e.date,reason:e.reason||null}));
      const keys=events.map((e:Row)=>eventKey(e.event));
      if(keys.includes('delivered'))delivered++; else if(keys.some((k:string)=>k.includes('bounce')||k==='blocked'||k==='invalid'))failed++;
    }
    const count=Object.keys(run.provider_message_ids||{}).length;
    const status=delivered===count&&count>0?'delivered':failed>0?'partial':'accepted';
    await db.from('operations_report_runs').update({status,delivery_events:eventsByRecipient,delivered_at:status==='delivered'?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',run.id);
  }

  // Read-only monitors. A failed check opens one deduplicated alert; recovery closes it once.
  const checks:Row[]=[];
  for(const [key,path] of [['homepage','/'],['dtf-page','/DTFTransfers']]){
    try{const started=Date.now(),response=await fetch(`${SITE}${path}`,{signal:AbortSignal.timeout(12000)});checks.push({check_key:key,severity:'critical',status:response.ok?'healthy':'failed',evidence:{http_status:response.status,duration_ms:Date.now()-started,path}});}catch(error){checks.push({check_key:key,severity:'critical',status:'failed',evidence:{error:String(error).slice(0,200),path}});}
  }
  const hourAgo=new Date(Date.now()-3600000).toISOString();
  const [{data:webhookFailures=[]},{data:uploadFailures=[]},{data:expiredQuotes=[]}]=await Promise.all([
    db.from('stripe_webhook_events').select('event_id,last_error,created_at').eq('processing_status','failed').gte('created_at',hourAgo).limit(10),
    db.from('marketing_events').select('id,metadata,created_at').eq('event_name','artwork_upload_failure').eq('is_test',false).gte('created_at',hourAgo).limit(10),
    db.from('dtf_transfer_orders').select('id,order_reference,shipping_quote_status').eq('is_sample',false).eq('shipping_quote_status','expired').limit(10)
  ]);
  checks.push({check_key:'stripe-webhooks',severity:'critical',status:webhookFailures?.length?'failed':'healthy',evidence:{failed_last_hour:webhookFailures?.length||0}});
  checks.push({check_key:'artwork-uploads',severity:'warning',status:(uploadFailures?.length||0)>=3?'degraded':'healthy',evidence:{failures_last_hour:uploadFailures?.length||0,threshold:3}});
  checks.push({check_key:'dtf-freight',severity:'warning',status:expiredQuotes?.length?'degraded':'healthy',evidence:{expired_quotes:expiredQuotes?.length||0}});
  await db.from('operations_monitor_checks').insert(checks.map(c=>({...c,checked_at:new Date().toISOString()})));
  for(const check of checks){
    const dedupe=`${check.check_key}:active`;
    if(check.status==='healthy')await db.from('operations_alerts').update({status:'recovered',recovered_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('dedupe_key',dedupe).neq('status','recovered');
    else await db.from('operations_alerts').upsert({dedupe_key:dedupe,workflow:check.check_key,severity:check.severity,status:'open',customer_impact:check.severity==='critical'?'Customers may be unable to complete the affected workflow.':'Some orders may require manual attention.',evidence:JSON.stringify(check.evidence),owner_label:'YHo',next_action:`Open the secure action center and inspect ${check.check_key}.`,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'dedupe_key'});
  }

  const {data:snapshot,error:snapshotError}=await db.rpc('operations_business_snapshot',{p_days:30});
  if(snapshotError)return json({error:'Snapshot generation failed',detail:snapshotError.message},500);
  const {data:recipients=[]}=await db.from('operations_report_recipients').select('*').order('recipient_role');
  const ep=easternParts();
  const shouldSample=config.sample_pending===true;
  const shouldDaily=ep.hour===9;
  if(!shouldSample&&!shouldDaily)return json({ok:true,checks:checks.map(c=>({key:c.check_key,status:c.status})),report:'not due'});
  const isWeekly=ep.weekday==='Mon',isMonthly=ep.day===1;
  const reportType=shouldSample?'sample':(isWeekly||isMonthly?'combined':'daily');
  const label=shouldSample?'sample daily':isWeekly&&isMonthly?'combined daily, weekly, and monthly':isWeekly?'combined daily and weekly':isMonthly?'combined daily and monthly':'daily';
  const operationKey=shouldSample?config.sample_operation_key:`hc-operations-${ep.date}:${reportType}`;
  const {data:existing}=await db.from('operations_report_runs').select('*').eq('operation_key',operationKey).maybeSingle();
  if(existing)return json({ok:true,duplicate_prevented:true,operation_key:operationKey,status:existing.status});
  const enabled=(recipients||[]).filter((r:Row)=>shouldSample||r.daily_enabled);
  const {data:claimed,error:claimError}=await db.from('operations_report_runs').insert({operation_key:operationKey,report_type:reportType,reporting_window_start:new Date(Date.now()-30*86400000).toISOString(),reporting_window_end:new Date().toISOString(),status:'generating',recipient_count:enabled.length}).select('*').single();
  if(claimError)return json({error:'Report idempotency claim failed'},409);
  const ids:Row={},failures:Row={};
  for(const recipient of enabled){
    const content=renderReport(snapshot,recipient,label,shouldSample);
    const subject=shouldSample?'[SAMPLE — INTERNAL] HC Apparel morning briefing':`${label[0].toUpperCase()+label.slice(1)} HC Apparel briefing — ${ep.date}`;
    const result=await sendBrevo(brevoKey,recipient,subject,content.html,content.text,operationKey);
    if(result.ok)ids[recipient.email]=result.messageId;else failures[recipient.email]=`Brevo ${result.status}`;
  }
  const accepted=Object.keys(ids).length;
  const status=accepted===enabled.length?'accepted':accepted>0?'partial':'failed';
  await db.from('operations_report_runs').update({status,provider_message_ids:ids,accepted_at:accepted?new Date().toISOString():null,last_error:Object.keys(failures).length?JSON.stringify(failures):null,updated_at:new Date().toISOString()}).eq('id',claimed.id);
  if(shouldSample&&accepted===enabled.length)await db.from('operations_runtime_config').update({sample_pending:false,updated_at:new Date().toISOString()}).eq('id',true);
  return json({ok:status!=='failed',operation_key:operationKey,status,provider_acceptance:ids,delivery_status:'pending provider events',failures});
});
