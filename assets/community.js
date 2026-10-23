/* Public catalog + durable membership service. Secrets never enter browser storage. */
(() => {
 const cfg=window.DRUGSLIST_CONFIG||{}, local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 const communityOrigin=cfg.communityUrl||location.origin,remote=!local&&location.origin!==communityOrigin;
 const labels={price:'价格体验',effect:'用药体验',other:'其他评价'};
 let session={user:null,csrf:null},activeDrug=null,authMode='register',offset=0,hasMore=false,currentReviews=[];
 const member=$('memberButton'),auth=$('authDialog');
 async function api(path,options={}){
  const r=await fetch((remote?communityOrigin:'')+path,{credentials:remote?'omit':'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(session.csrf?{'X-CSRF-Token':session.csrf}:{}),...options.headers}});
  const data=await r.json().catch(()=>({error:'服务暂不可用，请稍后重试。'}));if(!r.ok)throw new Error(data.error||'请求失败，请稍后重试。');return data;
 }
 function memberState(){member.textContent=session.user?`${session.user.display_name} · 会员`:'邮箱注册 / 登录';member.disabled=false;$('memberStatus').textContent=session.user?'分享真实体验，帮助更多人':'注册会员，分享价格与用药体验';}
 function goToMembers(){const url=new URL(communityOrigin);url.searchParams.set('join','1');if(activeDrug)url.searchParams.set('drug',activeDrug);location.assign(url.href);}
 function showAuth(mode='register'){
  if(remote){goToMembers();return;}
  authMode=mode;$('authError').textContent='';$('authTitle').textContent=session.user?'我的会员账号':mode==='register'?'邮箱注册':'欢迎回来';$('authFields').hidden=!!session.user;$('accountInfo').hidden=!session.user;
  $('accountName').textContent=session.user?`${session.user.display_name} · ${session.user.email}`:'';$('registerName').hidden=mode!=='register';$('displayName').required=false;$('password').autocomplete=mode==='register'?'new-password':'current-password';
  $('authSubmit').textContent=mode==='register'?'注册并登录':'登录';$('authSwitch').textContent=mode==='register'?'已有账号？去登录':'没有账号？邮箱注册';$('authPasswordNote').textContent=mode==='register'?'邮箱不会公开，不填昵称时会自动生成。请妥善保存密码；暂未提供邮件找回。':'';
  if(!auth.open)auth.showModal();
 }
 member.onclick=()=>showAuth();$('authClose').onclick=()=>auth.close();auth.addEventListener('click',e=>{if(e.target===auth)auth.close();});$('authSwitch').onclick=()=>showAuth(authMode==='register'?'login':'register');
 $('authForm').onsubmit=async e=>{
  e.preventDefault();const b=$('authSubmit');b.disabled=true;$('authError').textContent='';
  try{session=await api(`/api/auth/${authMode}`,{method:'POST',body:JSON.stringify({email:$('username').value.trim(),password:$('password').value,display_name:$('displayName').value.trim()})});$('password').value='';memberState();auth.close();if(activeDrug){compose();await loadReviews();$('reviewsPanel')?.scrollIntoView({block:'start'});}}
  catch(error){$('authError').textContent=error.message;}finally{b.disabled=false;}
 };
 $('logoutButton').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST',body:'{}'});session={user:null,csrf:null};memberState();auth.close();if(activeDrug){compose();await loadReviews();}}catch(error){$('authError').textContent=error.message;}};
 function renderStats(s){
  const total=s.rating_count,score=total?Number(s.average).toFixed(1):'暂无';
  const distribution=[5,4,3,2,1].map(star=>`<div class="rating-row"><span>${star}星</span><span class="rating-track" aria-label="${star}星：${s.stars[star]}人"><i style="width:${total?s.stars[star]/total*100:0}%"></i></span><b>${s.stars[star]}人</b></div>`).join('');
  return `<div class="rating-overview"><div class="rating-score"><strong>${score}</strong><span class="rating-stars">${total?'★'.repeat(Math.round(s.average))+'☆'.repeat(5-Math.round(s.average)):'☆☆☆☆☆'}</span><small>${total?'满分 5.0 · '+total+'人评分':'尚无会员评分'}</small><small>${s.reviewer_count}人评价 · ${s.review_count}条留言</small></div><div>${distribution}<div class="rating-highlow"><span>高分（4–5星）${s.high_count}人</span><span>低分（1–2星）${s.low_count}人</span></div></div></div><p class="rating-policy">综合评分采用每位会员最新一次有评分的评价，每人计一次；仅留言不评分的会员不计入均分。体验评分不代表临床疗效证据。</p>`;
 }
 function compose(){
  if(!$('reviewCompose'))return;
  if(remote||!session.user){$('reviewCompose').innerHTML='<div class="review-signin"><p>分享购药价格、用药体验或其他感受。</p><button class="btn primary" id="reviewLogin">邮箱注册 / 登录后评价</button></div>';$('reviewLogin').onclick=()=>showAuth();return;}
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
 const params=new URLSearchParams(location.search),selected=params.get('drug');if(selected&&DATA.some(r=>r.drug_id===selected))show(selected);
 if(!remote)api('/api/session').then(data=>{session=data;memberState();if(activeDrug){compose();loadReviews();}if(params.get('join')&&!session.user)showAuth('register');}).catch(()=>{$('memberStatus').textContent='会员服务暂不可用，请稍后重试';});
})();
