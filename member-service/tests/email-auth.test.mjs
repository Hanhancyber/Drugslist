import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleAPI} from '../lib/community-api.mjs';
import {ACCOUNT_ORIGIN,emailReady,sendAccountMail} from '../lib/account-mail.mjs';
import {setup} from './support.mjs';
const account={email:'member@example.test',password:'Test-password-2026',display_name:'测试会员'};
const env={EMAIL_AUTH_ENABLED:'true',RESEND_API_KEY:'test-key-not-a-real-secret',MAIL_FROM:'accounts@example.test'};
function harness(t,config=env){
 const {db,sql}=setup();t.after(()=>sql.close());const emails=[],jobs=[],clients=[{},{},{}];let fail=false;
 const options={env:config,waitUntil(p){jobs.push(p);},async fetcher(url,init){assert.equal(url,'https://api.resend.com/emails');const message=JSON.parse(init.body);emails.push(message);return new Response(JSON.stringify(fail?{message:'do not expose provider internals'}:{id:'test-delivery'}),{status:fail?500:200});}};
 async function req(path,method='GET',data,client=0,extra={}){const c=clients[client];const response=await handleAPI(new Request(ACCOUNT_ORIGIN+path,{method,headers:{Origin:ACCOUNT_ORIGIN,...(data?{'Content-Type':'application/json'}:{}),...(c.cookie?{Cookie:c.cookie}:{}),...(c.csrf?{'X-CSRF-Token':c.csrf}:{}),...extra},body:data?JSON.stringify(data):undefined}),db,new Set(['drug-a']),options);const value=await response.json();if(response.headers.has('set-cookie'))c.cookie=response.headers.get('set-cookie').split(';')[0];if(value.csrf)c.csrf=value.csrf;return {status:response.status,data:value};}
 const token=()=>emails.at(-1).text.match(/#(?:verify|reset)=([A-Za-z0-9_-]{43})/)[1];
 return {req,emails,token,sql,clients,clearLimits(){sql.exec('DELETE FROM rate_limits');},async finish(){await Promise.all(jobs.splice(0));},fail(){fail=true;}};
}
test('registration sends verification; password + one-use token required before reviews',async t=>{
 const h=harness(t);const registration=await h.req('/api/auth/register','POST',account);assert.equal(registration.status,201);assert.equal(registration.data.user.email_verified,false);assert.equal(registration.data.email_delivery,'submitted');assert.equal(h.emails.length,1);
 const token=h.token();assert.ok(!JSON.stringify(registration).includes(token));assert.equal(h.emails[0].to[0],account.email);assert.match(h.emails[0].text,/24小时/);assert.ok(!h.emails[0].text.includes(account.password));
 const stored=h.sql.prepare('SELECT * FROM account_tokens').get();assert.equal(stored.token_hash,createHash('sha256').update(token).digest('hex'));assert.notEqual(stored.token_hash,token);
 const review={category:'price',rating:5,body:'测试价格体验文字'};assert.equal((await h.req('/api/reviews/drug-a','POST',review)).status,403);
 assert.equal((await h.req('/api/auth/verify-email?token='+token)).status,404);assert.equal(h.sql.prepare('SELECT email_verified_at FROM users').get().email_verified_at,null);
 assert.equal((await h.req('/api/auth/verify-email','POST',{token,password:'Wrong-password-2026'})).status,400);
 assert.equal((await h.req('/api/auth/verify-email','POST',{token,password:account.password},0,{Origin:'https://evil.test'})).status,403);
 assert.equal((await h.req('/api/auth/verify-email','POST',{token,password:account.password})).status,200);
 assert.equal((await h.req('/api/session')).data.user,null);assert.equal((await h.req('/api/auth/verify-email','POST',{token,password:account.password})).status,400);
 const login=await h.req('/api/auth/login','POST',account);assert.equal(login.data.user.email_verified,true);assert.equal((await h.req('/api/reviews/drug-a','POST',review)).status,201);
});
test('reset works without a session, verifies ownership, revokes sessions and all outstanding tokens',async t=>{
 const h=harness(t);await h.req('/api/auth/register','POST',account);const verify=h.token();await h.req('/api/auth/login','POST',account,1);h.clearLimits();
 const resetRequest=await h.req('/api/auth/forgot-password','POST',{email:account.email},2);assert.equal(resetRequest.status,202);await h.finish();const token=h.token();assert.match(h.emails.at(-1).text,/30分钟/);
 const password='New-test-password-2026';assert.equal((await h.req('/api/auth/reset-password','POST',{token,password,password_confirmation:'not-the-same'},2)).status,400);
 assert.equal((await h.req('/api/auth/reset-password','POST',{token,password,password_confirmation:password},2)).status,200);await h.finish();assert.match(h.emails.at(-1).subject,/已重置/);assert.ok(!h.emails.at(-1).text.includes(password));
 for(const client of [0,1,2])assert.equal((await h.req('/api/session','GET',undefined,client)).data.user,null);
 assert.equal((await h.req('/api/auth/login','POST',account)).status,401);assert.equal((await h.req('/api/auth/login','POST',{...account,password})).data.user.email_verified,true);
 assert.equal((await h.req('/api/auth/reset-password','POST',{token,password,password_confirmation:password})).status,400);assert.equal((await h.req('/api/auth/verify-email','POST',{token:verify,password:account.password})).status,400);
});
test('expired links and resend invalidate old tokens; resend requires CSRF and rate limits',async t=>{
 const h=harness(t);await h.req('/api/auth/register','POST',account);const old=h.token();assert.equal((await h.req('/api/auth/resend-verification','POST',{})).status,429);h.clearLimits();
 assert.equal((await h.req('/api/auth/resend-verification','POST',{},0,{'X-CSRF-Token':'bad'})).status,403);
 assert.equal((await h.req('/api/auth/resend-verification','POST',{})).status,202);const token=h.token();assert.notEqual(token,old);assert.equal((await h.req('/api/auth/verify-email','POST',{token:old,password:account.password})).status,400);
 h.sql.exec('UPDATE account_tokens SET expires_at=0');assert.equal((await h.req('/api/auth/verify-email','POST',{token,password:account.password})).status,400);
});
test('forgot password returns identical accepted response for existing/missing emails and defers delivery',async t=>{
 const h=harness(t);await h.req('/api/auth/register','POST',account);h.clearLimits();let release;const stalled=new Promise(resolve=>release=resolve);
 // Block a provider call: the API response still finishes because waitUntil owns it.
 const options={env,waitUntil(p){h.pending=p;},async fetcher(){await stalled;return new Response('{"id":"delivery"}');}};
 const request=email=>new Request(ACCOUNT_ORIGIN+'/api/auth/forgot-password',{method:'POST',headers:{Origin:ACCOUNT_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({email})});
 // Use the same test harness for response shape and ensure unknown users receive no email.
 const known=await h.req('/api/auth/forgot-password','POST',{email:account.email});await h.finish();const count=h.emails.length;
 const unknown=await h.req('/api/auth/forgot-password','POST',{email:'unknown@example.test'});await h.finish();assert.deepEqual(known,unknown);assert.equal(h.emails.length,count);
 h.clearLimits();const {db,sql}=setup();t.after(()=>sql.close());const reg=await handleAPI(new Request(ACCOUNT_ORIGIN+'/api/auth/register',{method:'POST',headers:{Origin:ACCOUNT_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(account)}),db,new Set(),{});assert.equal(reg.status,201);
 const response=await handleAPI(request(account.email),db,new Set(),options);assert.equal(response.status,202);release();await h.pending;
});
test('provider failures preserve account, report failed delivery and delete unusable token',async t=>{
 const h=harness(t);h.fail();const result=await h.req('/api/auth/register','POST',account);assert.equal(result.status,201);assert.equal(result.data.email_delivery,'failed');assert.equal(h.sql.prepare('SELECT count(*) n FROM account_tokens').get().n,0);assert.equal((await h.req('/api/auth/login','POST',account)).status,200);
 assert.ok(!JSON.stringify(result).includes('provider internals'));h.clearLimits();assert.equal((await h.req('/api/auth/resend-verification','POST',{})).status,503);
});
test('email features remain honest when disabled, and fail closed when enabled with missing configuration',async t=>{
 const disabled=harness(t,{});const result=await disabled.req('/api/auth/register','POST',account);assert.equal(result.status,201);assert.equal(result.data.user.email_verified,false);assert.equal(result.data.email_verification_required,false);assert.equal((await disabled.req('/api/auth/forgot-password','POST',{email:account.email})).status,503);assert.equal(disabled.emails.length,0);
 const broken=harness(t,{EMAIL_AUTH_ENABLED:'true'});assert.equal((await broken.req('/api/auth/register','POST',account)).status,503);assert.equal((await broken.req('/api/health')).data.email_delivery_available,false);
});
test('competing token claims produce only one successful reset',async t=>{
 const h=harness(t);await h.req('/api/auth/register','POST',account);h.clearLimits();await h.req('/api/auth/forgot-password','POST',{email:account.email});await h.finish();const token=h.token(),password='New-test-password-2026',payload={token,password,password_confirmation:password};
 const result=await Promise.all([h.req('/api/auth/reset-password','POST',payload,1),h.req('/api/auth/reset-password','POST',payload,2)]);await h.finish();assert.deepEqual(result.map(r=>r.status).sort(),[200,400]);
});
test('mail uses a fixed HTTPS origin, server authorization and no user-provided redirects',async()=>{
 assert.equal(emailReady({...env,MAIL_FROM:'injected\n@example.test'}),false);assert.equal(emailReady({...env,EMAIL_AUTH_ENABLED:'false'}),false);
 await sendAccountMail(env,{email:account.email,purpose:'verify',token:'a'.repeat(43),deliveryId:'test-request'},async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');assert.equal(init.headers.Authorization,'Bearer '+env.RESEND_API_KEY);assert.equal(init.headers['Idempotency-Key'],'test-request');assert.match(JSON.parse(init.body).text,/https:\/\/drugslist-members\.hanhan2\.chatgpt\.site\/#verify=/);return new Response('{"id":"delivery"}');});
});
