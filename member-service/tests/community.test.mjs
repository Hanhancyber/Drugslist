import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './support.mjs';
import {handleAPI} from '../lib/community-api.mjs';
test('email registration, authentication, unique-person ratings, filtering and ownership',async()=>{
 const {db,sql}=setup(),ids=new Set(['drug-a','drug-b']),base='https://members.example',clients=[{}, {}, {}];
 async function req(client,path,method='GET',body,extra={}){const c=clients[client];const headers={Origin:base,...(body?{'Content-Type':'application/json'}:{}),...(c.cookie?{Cookie:c.cookie}:{}),...(c.csrf?{'X-CSRF-Token':c.csrf}:{}),...extra};const response=await handleAPI(new Request(base+path,{method,headers,body:body?JSON.stringify(body):undefined}),db,ids);const data=await response.json();if(response.headers.get('set-cookie'))c.cookie=response.headers.get('set-cookie').split(';')[0];if(data.csrf)c.csrf=data.csrf;return {status:response.status,data,headers:response.headers};}
 try{
 assert.equal((await req(0,'/api/health')).status,200);
 const account={email:'reviewer@example.test',password:'A-long-test-password-83',display_name:'<img src=x onerror=alert(1)>'};
 assert.equal((await req(0,'/api/auth/register','POST',account,{Origin:'https://evil.example'})).status,403);
 const registered=await req(0,'/api/auth/register','POST',account);assert.equal(registered.status,201);assert.match(registered.headers.get('set-cookie'),/HttpOnly/);assert.match(registered.headers.get('set-cookie'),/Secure/);assert.equal((await req(0,'/api/session')).data.user.email,account.email);
 assert.equal((await req(1,'/api/auth/register','POST',account)).status,409);
 const content={category:'price',rating:5,body:'这是用于测试的购药体验。'};
 assert.equal((await req(2,'/api/reviews/drug-a','POST',content)).status,401);
 assert.equal((await req(0,'/api/reviews/drug-a','POST',content,{'X-CSRF-Token':'wrong'})).status,403);
 assert.equal((await req(0,'/api/reviews/fake','POST',content)).status,404);
 assert.equal((await req(0,'/api/reviews/drug-a','POST',{...content,rating:6})).status,400);
 assert.equal((await req(0,'/api/reviews/drug-a','POST',content)).status,201);
 assert.equal((await req(0,'/api/reviews/drug-a','POST',{...content,category:'effect',rating:2})).status,201);
 await req(1,'/api/auth/register','POST',{...account,email:'second@example.test',display_name:'第二位'});
 await req(1,'/api/reviews/drug-a','POST',{...content,rating:4});
 const data=(await req(2,'/api/reviews?drug_id=drug-a')).data;assert.equal(data.summary.review_count,3);assert.equal(data.summary.reviewer_count,2);assert.equal(data.summary.rating_count,2);assert.equal(data.summary.average,3);assert.equal(data.summary.stars[5],0);assert.equal(data.summary.stars[2],1);assert.equal(data.summary.high_count,1);assert.equal(data.summary.low_count,1);assert.ok(data.reviews.every(r=>!('email' in r)&&!('user_id' in r)&&!r.is_own));
 const own=(await req(0,'/api/reviews?drug_id=drug-a&rating=low')).data.reviews[0];assert.ok(own.is_own);assert.equal((await req(1,`/api/reviews/${own.id}`,'DELETE')).status,403);
 assert.equal((await req(1,`/api/reviews/${own.id}/report`,'POST',{reason:'测试举报流程'})).status,200);
 assert.equal((await req(0,`/api/reviews/${own.id}`,'DELETE')).status,200);const updated=(await req(0,'/api/reviews?drug_id=drug-a')).data.summary;assert.equal(updated.average,4.5);assert.equal(updated.review_count,2);
 await req(0,'/api/reviews/drug-a','POST',{...content,rating:null,body:'只分享价格体验而不评分。'});const noRating=(await req(0,'/api/reviews?drug_id=drug-a')).data.summary;assert.equal(noRating.rating_count,1);assert.equal(noRating.average,4);assert.equal(noRating.reviewer_count,2);
 const publicStats=await req(2,'/api/review-summaries','GET',undefined,{Origin:'https://hanhancyber.github.io'});assert.equal(publicStats.headers.get('access-control-allow-origin'),'https://hanhancyber.github.io');assert.equal(publicStats.data.summaries['drug-a'].rating_count,1);
 assert.equal((await req(0,'/api/reviews?drug_id=drug-b')).data.summary.average,null);
 assert.equal((await req(0,'/api/auth/logout','POST',{})).status,200);assert.equal((await req(0,'/api/session')).data.user,null);assert.equal((await req(0,'/api/auth/login','POST',{...account,password:'wrong-password-123'})).status,401);assert.equal((await req(0,'/api/auth/login','POST',account)).status,200);
 assert.ok(sql.prepare('SELECT password_hash FROM users LIMIT 1').get().password_hash.startsWith('scrypt:'));assert.equal(sql.prepare('SELECT count(*) AS n FROM reviews WHERE deleted_at IS NOT NULL').get().n,1);
 }finally{sql.close();}
});
