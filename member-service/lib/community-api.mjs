import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import {emailEnabled,emailReady,sendAccountMail} from './account-mail.mjs';
const AGE=14*86400, COOKIE='drugslist_member', CATEGORIES=new Set(['price','effect','other']);
const hash=s=>createHash('sha256').update(s).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const now=()=>Math.floor(Date.now()/1000);
class APIError extends Error{constructor(status,message){super(message);this.status=status;}}
export function passwordHash(password,salt=randomBytes(16).toString('hex')){
  return `scrypt:32768:8:3:${salt}:${scryptSync(password,salt,32,{N:32768,r:8,p:3,maxmem:48*1024*1024}).toString('hex')}`;
}
function passwordMatches(password,stored){
 const parts=stored.split(':');if(parts.length!==6)return false;
 const expected=Buffer.from(parts[5],'hex');const actual=Buffer.from(passwordHash(password,parts[4]).split(':')[5],'hex');
 return expected.length===actual.length&&timingSafeEqual(actual,expected);
}
function safeEqual(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);}
async function body(request){
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new APIError(415,'请以正确格式提交。');
 const reader=request.body?.getReader();if(!reader)throw new APIError(400,'请求内容为空。');
 const chunks=[];let length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>16384){await reader.cancel();throw new APIError(413,'提交内容过长。');}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!data||typeof data!=='object'||Array.isArray(data))throw 0;return data;}catch{throw new APIError(400,'提交格式不正确。');}
}
export function emptySummary(){return {review_count:0,reviewer_count:0,rating_count:0,average:null,high_count:0,low_count:0,stars:{1:0,2:0,3:0,4:0,5:0}};}
export async function summaries(db,drugId){
 const where=drugId?' AND drug_id=?':'';const args=drugId?[drugId]:[];
 const totals=(await db.prepare(`SELECT drug_id,count(*) AS review_count,count(DISTINCT user_id) AS reviewer_count FROM reviews WHERE deleted_at IS NULL${where} GROUP BY drug_id`).bind(...args).all()).results;
 const stars=(await db.prepare(`WITH ranked AS (SELECT drug_id,rating,ROW_NUMBER() OVER(PARTITION BY drug_id,user_id ORDER BY updated_at DESC,id DESC) AS rn FROM reviews WHERE deleted_at IS NULL AND rating IS NOT NULL${where}) SELECT drug_id,rating,count(*) AS people FROM ranked WHERE rn=1 GROUP BY drug_id,rating`).bind(...args).all()).results;
 const result={};for(const row of totals)result[row.drug_id]={...emptySummary(),review_count:row.review_count,reviewer_count:row.reviewer_count};
 for(const row of stars){const s=result[row.drug_id];s.stars[row.rating]=row.people;s.rating_count+=row.people;}
 for(const s of Object.values(result)){s.average=s.rating_count?Math.round(Object.entries(s.stars).reduce((a,[star,n])=>a+Number(star)*n,0)/s.rating_count*10)/10:null;s.high_count=s.stars[4]+s.stars[5];s.low_count=s.stars[1]+s.stars[2];}
 return result;
}
async function getSession(db,request){
 const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
 return await db.prepare('SELECT s.*,u.email,u.display_name,u.email_verified_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(hash(token),now()).first();
}
async function requireUser(db,request){const s=await getSession(db,request);if(!s)throw new APIError(401,'请先登录会员账号。');if(!safeEqual(request.headers.get('x-csrf-token'),s.csrf))throw new APIError(403,'登录状态校验失败，请刷新后重试。');return s;}
function publicAccount(s){return s?{id:s.user_id,email:s.email,display_name:s.display_name,email_verified:!!s.email_verified_at}:null;}
async function throttle(db,key,limit,seconds){
 const bucket=hash(`${key}:${Math.floor(now()/seconds)}`);
 const row=await db.prepare('INSERT INTO rate_limits (bucket,hits,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 RETURNING hits').bind(bucket,now()+seconds*2).first();
 if(row.hits>limit)throw new APIError(429,'操作较频繁，请稍后再试。');
}
async function newSession(db,request,user){
 const old=await getSession(db,request);const token=random(),csrf=random();
 const work=[db.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now()),db.prepare('DELETE FROM rate_limits WHERE expires_at<=?').bind(now()),db.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) SELECT ?,id,?,? FROM users WHERE id=? AND password_hash=?').bind(hash(token),csrf,now()+AGE,user.id,user.password_hash)];
 if(old)work.push(db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(old.token_hash));const result=await db.batch(work);
 if(result[2].meta.changes!==1)throw new APIError(401,'账号状态已更新，请重新登录。');
 const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
 return [{user:{id:user.id,email:user.email,display_name:user.display_name,email_verified:!!user.email_verified_at},csrf},`${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AGE}${secure}`];
}
async function issueAccountToken(db,user,purpose,sendMail){
 const token=random(),tokenHash=hash(token);
 await db.batch([
  db.prepare('DELETE FROM account_tokens WHERE expires_at<=?').bind(now()),
  db.prepare('DELETE FROM account_tokens WHERE user_id=? AND purpose=?').bind(user.id,purpose),
  db.prepare('INSERT INTO account_tokens(token_hash,user_id,purpose,credential_hash,expires_at) VALUES (?,?,?,?,?)').bind(tokenHash,user.id,purpose,user.password_hash,now()+(purpose==='verify'?86400:1800)),
 ]);
 try{await sendMail({email:user.email,purpose,token,deliveryId:randomUUID()});}
 catch(error){await db.prepare('DELETE FROM account_tokens WHERE token_hash=?').bind(tokenHash).run();throw error;}
}
function validatePassword(password){if(typeof password!=='string'||password.length<10||password.length>128)throw new APIError(400,'密码须为10–128位。');}
export async function handleAPI(request,db,drugIds,options={}){
 const env=options.env||{},enabled=emailEnabled(env),ready=emailReady(env);
 const mailState={email_verification_required:enabled,email_delivery_available:ready};
 const sendMail=message=>sendAccountMail(env,message,options.fetcher||fetch);
 const requireMail=()=>{if(!ready)throw new APIError(503,'邮件服务暂不可用，请稍后重试。');};
 const background=async task=>{const work=task.catch(()=>console.error('Account email delivery failed'));if(options.waitUntil)options.waitUntil(work);else await work;};
 const url=new URL(request.url),path=url.pathname,method=request.method,origin=request.headers.get('origin');
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
 const publicRead=method==='GET'&&['/api/reviews','/api/review-summaries','/api/health'].includes(path);
 if(origin==='https://hanhancyber.github.io'&&publicRead){headers['Access-Control-Allow-Origin']=origin;headers.Vary='Origin';}
 const response=(data,status=200,cookie)=>new Response(JSON.stringify(data),{status,headers:{...headers,...(cookie?{'Set-Cookie':cookie}:{})}});
 try{
  if(method!=='GET'&&origin!==url.origin)throw new APIError(403,'请求来源不匹配。');
  if(path==='/api/health'&&method==='GET'){await db.prepare('SELECT 1 FROM users LIMIT 1').first();return response({ok:true,storage:'D1',email_registration:true,...mailState,ai_connected:false});}
  if(path==='/api/session'&&method==='GET'){const s=await getSession(db,request);return response({user:publicAccount(s),csrf:s?.csrf||null,...mailState});}
  if(path==='/api/auth/forgot-password'&&method==='POST'){
   requireMail();const ip=request.headers.get('cf-connecting-ip')||'local';await throttle(db,'recovery:'+ip,15,3600);
   const data=await body(request),email=String(data.email||'').trim().toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new APIError(400,'请填写有效邮箱。');
   await throttle(db,'mail-minute:'+email,1,60);await throttle(db,'mail-hour:'+email,5,3600);
   // Identical public response and asynchronous lookup/delivery avoid an account-existence oracle.
   await background((async()=>{const user=await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();if(user)await issueAccountToken(db,user,'reset',sendMail);})());
   return response({ok:true,message:'如果该邮箱已注册，会收到重置链接。请查看收件箱及垃圾邮件；一分钟后可重新申请。'},202);
  }
  if(path==='/api/auth/resend-verification'&&method==='POST'){
   requireMail();const s=await requireUser(db,request);
   if(s.email_verified_at)return response({ok:true,message:'邮箱已验证。'});
   await throttle(db,'mail-minute:'+s.email,1,60);await throttle(db,'mail-hour:'+s.email,5,3600);
   const user=await db.prepare('SELECT * FROM users WHERE id=?').bind(s.user_id).first();
   try{await issueAccountToken(db,user,'verify',sendMail);}catch{throw new APIError(503,'验证邮件暂未发送成功，请一分钟后重试。');}
   return response({ok:true,message:'验证邮件已提交发送，请查看收件箱及垃圾邮件。'},202);
  }
  if(['/api/auth/verify-email','/api/auth/reset-password'].includes(path)&&method==='POST'){
   const ip=request.headers.get('cf-connecting-ip')||'local';await throttle(db,'consume:'+ip,30,900);
   const data=await body(request),purpose=path.endsWith('verify-email')?'verify':'reset';
   if(typeof data.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(data.token))throw new APIError(400,'链接无效或已过期，请重新申请邮件。');
   validatePassword(data.password);
   if(purpose==='reset'&&data.password!==data.password_confirmation)throw new APIError(400,'两次输入的密码不一致。');
   const tokenHash=hash(data.token),user=await db.prepare('SELECT u.* FROM account_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.purpose=? AND t.consumed_by IS NULL AND t.expires_at>? AND t.credential_hash=u.password_hash').bind(tokenHash,purpose,now()).first();
   if(!user)throw new APIError(400,'链接无效或已过期，请重新申请邮件。');
   // Requiring the registration password stops an attacker pre-registering somebody else's email.
   if(purpose==='verify'&&!passwordMatches(data.password,user.password_hash))throw new APIError(400,'请输入注册时设置的密码；忘记密码可申请重置邮件。');
   const claim=randomUUID(),password=purpose==='reset'?passwordHash(data.password):user.password_hash;
   // A D1 batch is atomic: claim exactly once, change credentials, then revoke all sessions/tokens.
   const result=await db.batch([
    db.prepare('UPDATE account_tokens SET consumed_by=? WHERE token_hash=? AND purpose=? AND consumed_by IS NULL AND expires_at>? AND credential_hash=(SELECT password_hash FROM users WHERE id=account_tokens.user_id)').bind(claim,tokenHash,purpose,now()),
    db.prepare('UPDATE users SET password_hash=?,email_verified_at=COALESCE(email_verified_at,?) WHERE id=(SELECT user_id FROM account_tokens WHERE token_hash=? AND consumed_by=?)').bind(password,now(),tokenHash,claim),
    db.prepare('DELETE FROM sessions WHERE user_id=(SELECT user_id FROM account_tokens WHERE token_hash=? AND consumed_by=?)').bind(tokenHash,claim),
    db.prepare('UPDATE account_tokens SET consumed_by=? WHERE consumed_by IS NULL AND user_id=(SELECT user_id FROM account_tokens WHERE token_hash=? AND consumed_by=?)').bind(claim,tokenHash,claim),
   ]);
   if(result[0].meta.changes!==1)throw new APIError(400,'链接无效或已过期，请重新申请邮件。');
   if(purpose==='reset'&&ready)await background(sendMail({email:user.email,purpose:'changed',deliveryId:randomUUID()}));
   return response({ok:true,message:purpose==='verify'?'邮箱验证成功，请登录。':'密码已重置，所有旧登录会话已退出。请使用新密码登录。'},200,`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol==='https:'?'; Secure':''}`);
  }
  if(['/api/auth/register','/api/auth/login'].includes(path)&&method==='POST'){
   const ip=request.headers.get('cf-connecting-ip')||'local';await throttle(db,'auth:'+ip,35,900);
   const data=await body(request),email=String(data.email||'').trim().toLowerCase(),password=data.password;
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||password.length<10||password.length>128)throw new APIError(400,'请填写有效邮箱及10–128位密码。');
   await throttle(db,'account:'+email,20,900);
   if(path.endsWith('/register')){
    if(enabled)requireMail();
    await throttle(db,'register:'+ip,10,3600);
    const display=String(data.display_name||'').trim()||'会员'+randomBytes(3).toString('hex');
    if(display.length>30||/[\u0000-\u001f\u007f]/.test(display))throw new APIError(400,'昵称请控制在30字以内。');
    const user={id:randomUUID(),email,display_name:display};const password_hash=passwordHash(password);user.password_hash=password_hash;
    try{await db.prepare('INSERT INTO users(id,email,display_name,password_hash,created_at) VALUES (?,?,?,?,?)').bind(user.id,email,display,password_hash,now()).run();}catch(error){if(String(error).includes('UNIQUE'))throw new APIError(409,'此邮箱已有账号，请登录。');throw error;}
    let email_delivery=null;if(ready){try{await throttle(db,'mail-minute:'+email,1,60);await throttle(db,'mail-hour:'+email,5,3600);await issueAccountToken(db,user,'verify',sendMail);email_delivery='submitted';}catch{email_delivery='failed';}}
    const [payload,cookie]=await newSession(db,request,user);return response({...payload,...mailState,email_delivery},201,cookie);
   }
   const user=await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
   const valid=passwordMatches(password,user?.password_hash||'scrypt:32768:8:3:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000');
   if(!user||!valid)throw new APIError(401,'邮箱或密码不正确。');
   const [payload,cookie]=await newSession(db,request,user);return response({...payload,...mailState},200,cookie);
  }
  if(path==='/api/auth/logout'&&method==='POST'){const s=await requireUser(db,request);await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(s.token_hash).run();return response({ok:true},200,`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol==='https:'?'; Secure':''}`);}
  if(path==='/api/review-summaries'&&method==='GET')return response({summaries:await summaries(db)});
  if(path==='/api/reviews'&&method==='GET'){
   const drug=url.searchParams.get('drug_id');if(!drugIds.has(drug))throw new APIError(404,'未找到该药品。');
   const category=url.searchParams.get('category')||'',rating=url.searchParams.get('rating')||'';
   if(category&&!CATEGORIES.has(category)||rating&&!['high','low','3','5','4','2','1'].includes(rating))throw new APIError(400,'评价筛选不正确。');
   const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new APIError(400,'分页参数不正确。');
   let filter='r.drug_id=? AND r.deleted_at IS NULL';const args=[drug];
   if(category){filter+=' AND r.category=?';args.push(category);}if(rating){if(rating==='high')filter+=' AND r.rating>=4';else if(rating==='low')filter+=' AND r.rating<=2';else{filter+=' AND r.rating=?';args.push(Number(rating));}}
   const session=await getSession(db,request);
   const result=await db.prepare(`SELECT r.*,u.display_name FROM reviews r JOIN users u ON u.id=r.user_id WHERE ${filter} ORDER BY r.updated_at DESC,r.id DESC LIMIT 20 OFFSET ?`).bind(...args,offset).all();
   const total=await db.prepare(`SELECT count(*) AS total FROM reviews r WHERE ${filter}`).bind(...args).first();
   const summary=(await summaries(db,drug))[drug]||emptySummary();
   const reviews=result.results.map(({id,user_id,category,rating,body,created_at,updated_at,display_name})=>({id,category,rating,body,created_at,updated_at,display_name,is_own:session?.user_id===user_id}));
   return response({reviews,summary,total:total.total,offset,has_more:offset+reviews.length<total.total});
  }
  const report=path.match(/^\/api\/reviews\/(\d+)\/report$/);
  if(report&&method==='POST'){const s=await requireUser(db,request);await throttle(db,'report:'+s.user_id,20,3600);const row=await db.prepare('SELECT id FROM reviews WHERE id=? AND deleted_at IS NULL').bind(Number(report[1])).first();if(!row)throw new APIError(404,'评价不存在。');const data=await body(request),reason=String(data.reason||'').trim();if(reason.length<2||reason.length>200)throw new APIError(400,'举报原因须为2–200字。');await db.prepare('INSERT INTO reports(review_id,user_id,reason,created_at) VALUES (?,?,?,?) ON CONFLICT(review_id,user_id) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at').bind(row.id,s.user_id,reason,now()).run();return response({ok:true});}
  if(path.startsWith('/api/reviews/')&&method==='POST'){
   const s=await requireUser(db,request);if(enabled&&!s.email_verified_at)throw new APIError(403,'请先在会员账号中验证邮箱，再发布评价。');await throttle(db,'review:'+s.user_id,30,3600);const drug=decodeURIComponent(path.slice('/api/reviews/'.length));if(!drugIds.has(drug))throw new APIError(404,'未找到该药品。');
   const data=await body(request),category=data.category,rating=data.rating,text=data.body;
   if(!CATEGORIES.has(category)||rating!==null&&(!Number.isInteger(rating)||rating<1||rating>5))throw new APIError(400,'请选择评价方向及1–5星评分，也可仅留言。');
   if(typeof text!=='string'||text.trim().length<5||text.trim().length>2000)throw new APIError(400,'留言须为5–2000字。');
   const stamp=Date.now();await db.prepare('INSERT INTO reviews(drug_id,user_id,category,rating,body,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,NULL) ON CONFLICT(drug_id,user_id,category) DO UPDATE SET rating=excluded.rating,body=excluded.body,updated_at=excluded.updated_at,deleted_at=NULL').bind(drug,s.user_id,category,rating,text.trim(),stamp,stamp).run();return response({ok:true},201);
  }
  const deletion=path.match(/^\/api\/reviews\/(\d+)$/);
  if(deletion&&method==='DELETE'){const s=await requireUser(db,request);const row=await db.prepare('SELECT user_id FROM reviews WHERE id=? AND deleted_at IS NULL').bind(Number(deletion[1])).first();if(!row)throw new APIError(404,'评价不存在。');if(row.user_id!==s.user_id)throw new APIError(403,'只能删除自己的评价。');await db.prepare('UPDATE reviews SET deleted_at=?,updated_at=? WHERE id=?').bind(Date.now(),Date.now(),Number(deletion[1])).run();return response({ok:true});}
  throw new APIError(404,'接口不存在。');
 }catch(error){if(error instanceof APIError)return response({error:error.message},error.status);console.error('Community request failed',error?.name||'Error');return response({error:'服务暂不可用，请稍后重试。'},500);}
}
