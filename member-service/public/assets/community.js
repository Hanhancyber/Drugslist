/* Public catalog + durable membership service. Secrets never enter browser storage. */
(() => {
 const cfg=window.DRUGSLIST_CONFIG||{}, local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 const communityOrigin=cfg.communityUrl||location.origin,remote=!local&&location.origin!==communityOrigin;
 const labels={price:'价格体验',effect:'用药体验',other:'其他评价'};
 let session={user:null,csrf:null},activeDrug=null,authMode='register',offset=0,hasMore=false,currentReviews=[];
 let accountLink=null;
 function captureAccountLink(){
  const fragment=new URLSearchParams(location.hash.slice(1));
  const link=fragment.has('verify')?{mode:'verify-email',token:fragment.get('verify')}:fragment.has('reset')?{mode:'reset-password',token:fragment.get('reset')}:null;
  // Keep one-time credentials in memory only and remove them from the address/history immediately.
  if(link){accountLink=link;history.replaceState(null,'',location.pathname+location.search);}return link;
 }
 captureAccountLink();
 const member=$('memberButton'),auth=$('authDialog');
 const connectionMessage='会员服务暂时无法连接，请稍后重试。药品查询、说明书、价格与创新药专题仍可正常浏览。';
 async function api(path,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
   const r=await fetch((remote?communityOrigin:'')+path,{credentials:remote?'omit':'same-origin',...options,signal:controller.signal,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(session.csrf?{'X-CSRF-Token':session.csrf}:{}),...options.headers}});
   if(!r.headers.get('content-type')?.includes('application/json'))throw new Error(connectionMessage);
   const data=await r.json();if(!r.ok)throw new Error(data.error||'请求失败，请稍后重试。');return data;
  }catch(error){if(error.name==='AbortError'||error instanceof TypeError)throw new Error(connectionMessage);throw error;}
  finally{clearTimeout(timer);}
 }
 function memberState(){member.textContent=session.user?`${session.user.display_name} · 会员`:'邮箱注册 / 登录';member.disabled=false;$('memberStatus').textContent=session.user?'分享真实体验，帮助更多人':'注册会员，分享价格与用药体验';}
 auth.querySelector('.auth-body').insertAdjacentHTML('beforeend','<section id="memberConnection" hidden><p id="memberConnectionMessage" role="status"></p><div class="review-actions"><button class="btn" id="continueBrowsing">继续浏览药品</button><button class="btn primary" id="retryMemberConnection">重新连接</button></div></section>');
 $('continueBrowsing').onclick=()=>auth.close();$('retryMemberConnection').onclick=()=>goToMembers();
 let checkingConnection=false;
 async function goToMembers(){
  if(checkingConnection)return;
  checkingConnection=true;member.disabled=true;member.textContent='正在连接会员服务…';
  const retry=$('retryMemberConnection');retry.disabled=true;
  try{
   const data=await api('/api/review-summaries');
   if(!data.summaries||typeof data.summaries!=='object')throw new Error(connectionMessage);
   const url=new URL(communityOrigin);url.searchParams.set('join','1');if(activeDrug)url.searchParams.set('drug',activeDrug);
   location.assign(url.href);
  }catch{
   $('authTitle').textContent='会员服务连接暂不可用';$('authFields').hidden=true;$('accountInfo').hidden=true;$('authError').textContent='';
   $('memberConnection').hidden=false;$('memberConnectionMessage').textContent=connectionMessage;
   $('memberStatus').textContent='会员连接暂不可用 · 药品查询正常';
   if(!auth.open)auth.showModal();
  }finally{checkingConnection=false;member.disabled=false;member.textContent='邮箱注册 / 登录';retry.disabled=false;}
 }
 function showAuth(mode='register'){
  if(remote){goToMembers();return;}
  $('memberConnection').hidden=true;
  authMode=mode;const linkMode=['verify-email','reset-password'].includes(mode),forgot=mode==='forgot-password',account=!!session.user&&!linkMode&&!forgot;
  $('authError').textContent='';$('authTitle').textContent=account?'我的会员账号':({'register':'邮箱注册','login':'欢迎回来','forgot-password':'找回密码','verify-email':'验证你的邮箱','reset-password':'设置新密码'})[mode];$('authFields').hidden=account;$('accountInfo').hidden=!account;
  $('accountName').textContent=session.user?`${session.user.display_name} · ${session.user.email}`:'';
  $('emailVerificationStatus').textContent=session.user?.email_verified?'邮箱已验证':session.email_verification_required?'邮箱尚未验证，请完成验证后发布评价。':'邮箱尚未验证，验证邮件服务暂未开放。';
  $('resendVerification').hidden=!session.user||session.user.email_verified||!session.email_delivery_available;
  $('authEmailLabel').hidden=linkMode;$('username').disabled=linkMode;$('registerName').hidden=mode!=='register';$('displayName').required=false;
  $('authPasswordLabel').hidden=forgot;$('password').disabled=forgot;$('password').value='';$('password').autocomplete=['register','reset-password'].includes(mode)?'new-password':'current-password';
  $('authPasswordLabelText').textContent=mode==='reset-password'?'新密码':mode==='verify-email'?'注册时设置的密码':'密码';
  $('authConfirmLabel').hidden=mode!=='reset-password';$('passwordConfirm').disabled=mode!=='reset-password';$('passwordConfirm').required=mode==='reset-password';$('passwordConfirm').value='';
  $('authSubmit').textContent=({'register':'注册并登录','login':'登录','forgot-password':'发送重置邮件','verify-email':'确认验证邮箱','reset-password':'重置密码'})[mode];
  $('authSubmit').disabled=forgot&&!session.email_delivery_available;
  $('authSwitch').textContent=mode==='register'?'已有账号？去登录':mode==='login'?'没有账号？邮箱注册':'返回登录';$('forgotPassword').hidden=mode!=='login';
  $('authPasswordNote').textContent=mode==='register'?(session.email_verification_required?'邮箱不会公开。注册后请通过邮件验证邮箱，再发布评价。':'邮箱不会公开，不填昵称时会自动生成。'):forgot?(session.email_delivery_available?'输入注册邮箱，我们会发送30分钟内有效的重置链接。':'邮件找回暂不可用，请稍后再试。'):mode==='verify-email'?'请输入注册时设置的密码，确认此邮箱属于你。验证完成后重新登录。':mode==='reset-password'?'设置10–128位新密码。完成后所有旧登录会话都会退出。':'';
  if(!auth.open)auth.showModal();
 }
 member.onclick=()=>showAuth();$('authClose').onclick=()=>auth.close();auth.addEventListener('click',e=>{if(e.target===auth)auth.close();});$('authSwitch').onclick=()=>showAuth(authMode==='login'?'register':'login');$('forgotPassword').onclick=()=>showAuth('forgot-password');
 $('authForm').onsubmit=async e=>{
  e.preventDefault();const b=$('authSubmit');b.disabled=true;$('authError').textContent='';
  try{const mode=authMode,data=await api(`/api/auth/${mode}`,{method:'POST',body:JSON.stringify({email:$('username').value.trim(),password:$('password').value,password_confirmation:$('passwordConfirm').value,display_name:$('displayName').value.trim(),token:accountLink?.token})});$('password').value='';$('passwordConfirm').value='';
   if(mode==='forgot-password'){$('authError').textContent=data.message;return;}
   if(['verify-email','reset-password'].includes(mode)){accountLink=null;session={...session,user:null,csrf:null};memberState();showAuth('login');$('authError').textContent=data.message;if(activeDrug){compose();await loadReviews();}return;}
   session=data;memberState();if(session.email_verification_required&&!session.user.email_verified){showAuth();$('authError').textContent=data.email_delivery==='failed'?'账号已创建，验证邮件暂未发送成功，请一分钟后重新发送。':data.email_delivery==='submitted'?'验证邮件已提交发送，请查看收件箱及垃圾邮件。':'';}else auth.close();
   if(activeDrug){compose();await loadReviews();if(!auth.open)$('reviewsPanel')?.scrollIntoView({block:'start'});}}
  catch(error){$('authError').textContent=error.message;}finally{b.disabled=authMode==='forgot-password'&&!session.email_delivery_available;}
 };
 $('resendVerification').onclick=async()=>{const b=$('resendVerification');b.disabled=true;try{const data=await api('/api/auth/resend-verification',{method:'POST',body:'{}'});$('authError').textContent=data.message;}catch(error){$('authError').textContent=error.message;}finally{setTimeout(()=>{b.disabled=false;},60000);}};
 $('logoutButton').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST',body:'{}'});session={...session,user:null,csrf:null};memberState();auth.close();if(activeDrug){compose();await loadReviews();}}catch(error){$('authError').textContent=error.message;}};
 function renderStats(s){
  const total=s.rating_count,score=total?Number(s.average).toFixed(1):'暂无';
  const distribution=[5,4,3,2,1].map(star=>`<div class="rating-row"><span>${star}星</span><span class="rating-track" aria-label="${star}星：${s.stars[star]}人"><i style="width:${total?s.stars[star]/total*100:0}%"></i></span><b>${s.stars[star]}人</b></div>`).join('');
  return `<div class="rating-overview"><div class="rating-score"><strong>${score}</strong><span class="rating-stars">${total?'★'.repeat(Math.round(s.average))+'☆'.repeat(5-Math.round(s.average)):'☆☆☆☆☆'}</span><small>${total?'满分 5.0 · '+total+'人评分':'尚无会员评分'}</small><small>${s.reviewer_count}人评价 · ${s.review_count}条留言</small></div><div>${distribution}<div class="rating-highlow"><span>高分（4–5星）${s.high_count}人</span><span>低分（1–2星）${s.low_count}人</span></div></div></div><p class="rating-policy">综合评分采用每位会员最新一次有评分的评价，每人计一次；仅留言不评分的会员不计入均分。体验评分不代表临床疗效证据。</p>`;
 }
 function compose(){
  if(!$('reviewCompose'))return;
  if(remote||!session.user){$('reviewCompose').innerHTML='<div class="review-signin"><p>分享购药价格、用药体验或其他感受。</p><button class="btn primary" id="reviewLogin">邮箱注册 / 登录后评价</button></div>';$('reviewLogin').onclick=()=>showAuth();return;}
  if(session.email_verification_required&&!session.user.email_verified){$('reviewCompose').innerHTML='<div class="review-signin"><p>请先验证注册邮箱，再分享评价。</p><button class="btn primary" id="reviewVerify">验证邮箱</button></div>';$('reviewVerify').onclick=()=>showAuth();return;}
  $('reviewCompose').innerHTML=`<form id="reviewForm" class="review-form"><label for="reviewCategory">评价方向</label><select id="reviewCategory"><option value="price">价格体验</option><option value="effect">用药体验</option><option value="other">其他评价</option></select><fieldset style="border:0;padding:0;margin:14px 0"><legend>体验评分 · 五星满分</legend><div class="star-picker">${[1,2,3,4,5].map(n=>`<label><input type="radio" name="reviewRating" value="${n}" aria-label="${n}星"><span>★</span><small>${n}星</small></label>`).join('')}</div><label class="nickname-note"><input style="min-width:0;width:auto" type="radio" name="reviewRating" value="" checked> 仅留言，不评分</label></fieldset><label for="reviewText">你的留言</label><textarea id="reviewText" minlength="5" maxlength="2000" rows="4" required placeholder="价格体验可注明地域、时间与规格；用药体验可描述个人感受。请勿上传病历、联系方式等隐私。"></textarea><div class="review-actions"><small>公开显示昵称。同一药品、同一方向再次提交会更新原留言。</small><button id="reviewSubmit" class="btn primary">发布评价</button></div><p id="reviewError" class="form-error" role="status"></p></form>`;
  $('reviewForm').onsubmit=async e=>{e.preventDefault();const id=activeDrug,b=$('reviewSubmit');b.disabled=true;$('reviewError').textContent='';const selected=document.querySelector('input[name="reviewRating"]:checked').value;
   try{await api(`/api/reviews/${encodeURIComponent(id)}`,{method:'POST',body:JSON.stringify({category:$('reviewCategory').value,rating:selected?Number(selected):null,body:$('reviewText').value})});if(activeDrug===id){$('reviewText').value='';$('reviewFilterCategory').value='';$('reviewFilterRating').value='';await loadReviews();$('reviewsMessage').textContent='你的评价已保存。';await refreshSummaries();}}
   catch(error){if($('reviewError'))$('reviewError').textContent=error.message;}finally{b.disabled=false;}
  };
 }
 function bindActions(){
  $('reviewsList').querySelectorAll('[data-edit-review]').forEach(b=>b.onclick=()=>{const r=currentReviews.find(r=>String(r.id)===b.dataset.editReview);if(!r||!$('reviewForm'))return;$('reviewCategory').value=r.category;$('reviewText').value=r.body;document.querySelector(`input[name="reviewRating"][value="${r.rating||''}"]`).checked=true;$('reviewForm').scrollIntoView({block:'center'});});
  $('reviewsList').querySelectorAll('[data-delete-review]').forEach(b=>b.onclick=async()=>{if(!confirm('移除这条评价？'))return;try{await api(`/api/reviews/${b.dataset.deleteReview}`,{method:'DELETE'});await loadReviews();await refreshSummaries();}catch(error){$('reviewsMessage').textContent=error.message;}});
  $('reviewsList').querySelectorAll('[data-report-review]').forEach(b=>b.onclick=async()=>{const reason=prompt('请说明需要核查的原因（2–200字）：');if(!reason)return;try{await api(`/api/reviews/${b.dataset.reportReview}/report`,{method:'POST',body:JSON.stringify({reason})});$('reviewsMessage').textContent='已记录举报，供管理员核查。';}catch(error){$('reviewsMessage').textContent=error.message;}});
 }
 async function loadReviews(more=false){
  const id=activeDrug;if(!id)return;const category=$('reviewFilterCategory').value,rating=$('reviewFilterRating').value;if(!more){offset=0;currentReviews=[];}
  const query=new URLSearchParams({drug_id:id,category,rating,offset:String(offset)});$('reviewMore').disabled=true;
  try{const data=await api('/api/reviews?'+query);if(activeDrug!==id||category!==$('reviewFilterCategory').value||rating!==$('reviewFilterRating').value)return;
   $('reviewsSummary').innerHTML=renderStats(data.summary);window.DRUGSLIST_REVIEW_SUMMARIES??={};window.DRUGSLIST_REVIEW_SUMMARIES[id]=data.summary;
   currentReviews=more?[...currentReviews,...data.reviews]:data.reviews;offset=currentReviews.length;hasMore=data.has_more;
   $('reviewsList').innerHTML=currentReviews.length?currentReviews.map(r=>`<article class="review-card"><div class="review-meta"><strong>${E(r.display_name)}</strong><span>${E(labels[r.category])} · ${r.rating?'★'.repeat(r.rating)+'☆'.repeat(5-r.rating):'仅留言'}</span><time>${new Date(r.updated_at).toLocaleDateString('zh-CN')}</time></div><p class="review-text">${E(r.body)}</p>${r.is_own?`<button class="btn text-btn" data-edit-review="${r.id}">编辑</button> <button class="btn text-btn" data-delete-review="${r.id}">移除</button>`:session.user?`<button class="btn text-btn" data-report-review="${r.id}">举报</button>`:''}</article>`).join(''):'<div class="review-empty">'+(data.summary.review_count?'当前筛选下暂无留言。':'还没有评价，欢迎分享第一条真实体验。')+'</div>';
   $('reviewsCount').textContent=`筛选后 ${data.total} 条留言`;$('reviewMore').hidden=!hasMore;$('reviewMore').disabled=false;bindActions();
  }catch(error){if(activeDrug===id){$('reviewsList').textContent=error.message;$('reviewsSummary').textContent='评分暂未加载。';$('reviewMore').hidden=true;}}
 }
 const originalShow=show;
 show=function(id){originalShow(id);activeDrug=id;$('detailbody').insertAdjacentHTML('beforeend',`<section id="reviewsPanel" class="reviews-panel"><h3>会员评分与留言</h3><p class="sub">个人体验供交流；请按具体规格、时间和个人情况理解。</p><div id="reviewsSummary" aria-live="polite">正在加载评分…</div><div id="reviewCompose"></div><p id="reviewsMessage" role="status"></p><div class="review-filterbar"><label>评价方向 <select id="reviewFilterCategory"><option value="">全部</option><option value="price">价格体验</option><option value="effect">用药体验</option><option value="other">其他评价</option></select></label><label>评分 <select id="reviewFilterRating"><option value="">全部</option><option value="high">高分（4–5星）</option><option value="3">3星</option><option value="low">低分（1–2星）</option></select></label><span id="reviewsCount" class="sub"></span></div><div id="reviewsList" aria-live="polite">正在加载留言…</div><button class="btn review-more" id="reviewMore" hidden>查看更多留言</button></section>`);compose();$('reviewFilterCategory').onchange=()=>loadReviews();$('reviewFilterRating').onchange=()=>loadReviews();$('reviewMore').onclick=()=>loadReviews(true);loadReviews();};
 $('detail').addEventListener('close',()=>{activeDrug=null;});
 async function refreshSummaries(){try{const data=await api('/api/review-summaries');window.DRUGSLIST_REVIEW_SUMMARIES=data.summaries;window.DRUGSLIST_REVIEWS_LOADED=true;render();}catch{window.DRUGSLIST_REVIEWS_LOADED=false;}}
 $('aiSearchButton').onclick=()=>{const q=$('aiQuestion').value.trim();if(!q){$('aiQuestion').focus();return;}const name=DATA.map(r=>r['中文通用名'].replace(/^(注射用|盐酸|甲磺酸|甲苯磺酸|羟乙磺酸|氢溴酸|枸橼酸|脯氨酸|富马酸|苯磺酸|磷酸|苹果酸|苯甲酸|酒石酸|硫酸|己二酸)/,'').replace(/(注射用浓溶液|缓释片|肠溶胶囊|肠溶片|软胶囊|胶囊|注射液|片)$/,'')).filter(n=>n.length>=3&&q.includes(n)).sort((a,b)=>b.length-a.length)[0];['year','insurance','disease','drugKind','innovation'].forEach(k=>$(k).value='');$('search').value=name||q;$('scope').value='all';major='';page=1;diseases();render();$('search').scrollIntoView({behavior:'smooth',block:'center'});$('aiStatus').textContent='已检索药品资料。AI问答尚未接入模型。';};
 memberState();refreshSummaries();
 window.addEventListener('hashchange',()=>{const link=captureAccountLink();if(link&&!remote)showAuth(link.mode);});
 const params=new URLSearchParams(location.search),selected=params.get('drug');if(selected&&DATA.some(r=>r.drug_id===selected))show(selected);
 if(remote&&params.get('join'))showAuth();
 if(!remote)api('/api/session').then(data=>{session=data;memberState();if(activeDrug){compose();loadReviews();}if(accountLink)showAuth(accountLink.mode);else if(params.get('join')&&!session.user)showAuth('register');}).catch(()=>{$('memberStatus').textContent='会员服务暂不可用，请稍后重试';});
 document.addEventListener('visibilitychange',()=>{if(!remote&&document.visibilityState==='visible'&&session.user&&!accountLink)api('/api/session').then(data=>{session=data;memberState();if(auth.open)showAuth();if(activeDrug)compose();}).catch(()=>{});});
})();
