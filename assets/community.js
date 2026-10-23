/* Membership and reviews use the same-origin server. No credentials in browser storage. */
(() => {
  const communityEnabled = window.DRUGSLIST_CONFIG?.communityEnabled !== false;
  const labels = {price: '价格体验', effect: '用药体验', other: '其他评价'};
  let session = {user: null, csrf: null}, online = false, activeDrug = null, authMode = 'login';
  const member = document.getElementById('memberButton');
  const authDialog = document.getElementById('authDialog');
  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin', ...options,
      headers: {'Content-Type': 'application/json', ...(session.csrf ? {'X-CSRF-Token': session.csrf} : {}), ...options.headers}
    });
    const data = await response.json().catch(() => ({error: '会员服务未启动，请通过网站应用服务打开此页面。'}));
    if (!response.ok) throw new Error(data.error || '请求失败，请稍后重试。');
    return data;
  }
  function memberState() {
    if (!communityEnabled) {
      member.textContent = '会员功能 · 待开放';
      member.disabled = true;
      member.title = '会员注册与留言将在接入服务后开放';
      $('memberStatus').textContent = '会员注册与留言将在接入服务后开放';
      return;
    }
    member.textContent = session.user ? `${session.user.display_name} · 会员` : '登录 / 注册';
    member.title = session.user ? '管理登录状态' : '登录后分享价格与用药体验';
    $('memberStatus').textContent = session.user ? `已登录：${session.user.display_name}` : '注册会员，分享你的用药与购药经验';
  }
  function showAuth(mode = 'login') {
    if (!communityEnabled) return;
    authMode = mode;
    $('authError').textContent = '';
    $('authTitle').textContent = session.user ? '我的会员账号' : mode === 'register' ? '注册成为会员' : '欢迎回来';
    $('authFields').hidden = !!session.user;
    $('accountInfo').hidden = !session.user;
    $('accountName').textContent = session.user ? `${session.user.display_name} · ${session.user.username}` : '';
    $('registerName').hidden = mode !== 'register';
    $('displayName').required = mode === 'register';
    $('password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('authSubmit').textContent = mode === 'register' ? '创建账号' : '登录';
    $('authSwitch').textContent = mode === 'register' ? '已有账号，去登录' : '还没有账号？注册会员';
    $('authPasswordNote').textContent = mode === 'register' ? '请妥善保存账号和密码。当前版本暂不提供密码找回。' : '';
    if (!authDialog.open) authDialog.showModal();
  }
  member.onclick = () => showAuth();
  $('authClose').onclick = () => authDialog.close();
  authDialog.addEventListener('click', e => { if (e.target === authDialog) authDialog.close(); });
  $('authSwitch').onclick = () => showAuth(authMode === 'login' ? 'register' : 'login');
  $('authForm').onsubmit = async e => {
    e.preventDefault();
    const button = $('authSubmit'); button.disabled = true; $('authError').textContent = '';
    try {
      session = await api(`/api/auth/${authMode}`, {method: 'POST', body: JSON.stringify({
        username: $('username').value.trim(), password: $('password').value, display_name: $('displayName').value.trim()
      })});
      online = true; $('password').value = ''; memberState(); authDialog.close();
      if (activeDrug) loadReviews(activeDrug);
    } catch (error) { $('authError').textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('logoutButton').onclick = async () => {
    try {
      await api('/api/auth/logout', {method: 'POST', body: '{}'});
      session = {user: null, csrf: null}; memberState(); authDialog.close();
      if (activeDrug) loadReviews(activeDrug);
    } catch (error) { $('authError').textContent = error.message; }
  };

  function reviewForm(id) {
    if (!communityEnabled) return '<p class="service-note">会员注册与留言即将开放。届时可以分享价格、用药体验和其他评价。</p>';
    if (!online) return '<p class="service-note">会员与评价服务暂不可用。药品资料仍可浏览，请从应用服务地址打开页面。</p>';
    if (!session.user) return '<div class="review-signin"><p>有过购药或用药经历？登录后留下你的经验。</p><button class="btn primary" id="reviewLogin">登录 / 注册后评价</button></div>';
    return `<form id="reviewForm" class="review-form"><div class="review-controls">
      <label>评价方向<select id="reviewCategory"><option value="price">价格体验</option><option value="effect">用药体验</option><option value="other">其他评价</option></select></label>
      <label>体验评分<select id="reviewRating"><option value="">不评分，仅留言</option><option value="5">★★★★★ 5分</option><option value="4">★★★★☆ 4分</option><option value="3">★★★☆☆ 3分</option><option value="2">★★☆☆☆ 2分</option><option value="1">★☆☆☆☆ 1分</option></select></label></div>
      <label for="reviewText">你的留言</label><textarea id="reviewText" minlength="5" maxlength="2000" required rows="4" placeholder="价格可注明购买时间、地区、规格与支付方式；用药体验可说明个人感受。请勿填写姓名、电话、病历号等私人信息。"></textarea>
      <div class="review-actions"><small>同一药品、同一方向再次提交会更新你原有的评价。</small><button class="btn primary" id="reviewSubmit">发布评价</button></div><p id="reviewError" role="status" class="form-error"></p></form>`;
  }
  async function loadReviews(id) {
    if (activeDrug !== id || !$('reviewsPanel')) return;
    $('reviewCompose').innerHTML = reviewForm(id);
    if (!communityEnabled) { $('reviewsList').textContent = ''; return; }
    if ($('reviewLogin')) $('reviewLogin').onclick = () => showAuth();
    if ($('reviewForm')) $('reviewForm').onsubmit = async e => {
      e.preventDefault(); const button = $('reviewSubmit'); button.disabled = true;
      try {
        await api(`/api/reviews/${encodeURIComponent(id)}`, {method: 'POST', body: JSON.stringify({
          category: $('reviewCategory').value, rating: $('reviewRating').value ? Number($('reviewRating').value) : null, body: $('reviewText').value
        })});
        if (activeDrug === id) { await loadReviews(id); $('reviewsMessage').textContent = '你的评价已保存。'; }
      } catch (error) { if ($('reviewError')) $('reviewError').textContent = error.message; }
      finally { button.disabled = false; }
    };
    try {
      const data = await api(`/api/reviews?drug_id=${encodeURIComponent(id)}`);
      if (activeDrug !== id) return;
      online = true;
      $('reviewsSummary').innerHTML = data.summary.map(s => `<span class="review-summary">${E(labels[s.category])} · ${s.count}条${s.average !== null ? ` · ${s.average}分` : ''}</span>`).join('');
      $('reviewsList').innerHTML = data.reviews.length ? data.reviews.map(r => `<article class="review-card"><div class="review-meta"><strong>${E(r.display_name)}</strong><span>${E(labels[r.category])}${r.rating ? ' · ' + '★'.repeat(r.rating) + '☆'.repeat(5-r.rating) : ''}</span><time>${new Date(r.updated_at * 1000).toLocaleDateString('zh-CN')}</time></div><p class="review-text">${E(r.body)}</p>${r.is_own ? `<button class="btn text-btn" data-delete-review="${r.id}">删除我的评价</button>` : session.user ? `<button class="btn text-btn" data-report-review="${r.id}">举报不当内容</button>` : ''}</article>`).join('') : '<div class="review-empty">还没有评价。成为第一位分享经验的会员。</div>';
      $('reviewsList').querySelectorAll('[data-delete-review]').forEach(b => b.onclick = async () => {
        if (!confirm('确认删除这条评价？')) return;
        try { await api(`/api/reviews/${b.dataset.deleteReview}`, {method: 'DELETE'}); await loadReviews(id); }
        catch (error) { $('reviewsMessage').textContent = error.message; }
      });
      $('reviewsList').querySelectorAll('[data-report-review]').forEach(b => b.onclick = async () => {
        const reason = prompt('请简要说明需要核查的原因（2–200字）：');
        if (!reason) return;
        try { await api(`/api/reviews/${b.dataset.reportReview}/report`, {method: 'POST', body: JSON.stringify({reason})}); $('reviewsMessage').textContent = '举报已记录，等待管理员核查。'; }
        catch (error) { $('reviewsMessage').textContent = error.message; }
      });
    } catch (error) { if (activeDrug === id) $('reviewsList').textContent = error.message; }
  }
  const originalShow = show;
  show = function(id) {
    originalShow(id); activeDrug = id;
    $('detailbody').insertAdjacentHTML('beforeend', `<section id="reviewsPanel" class="reviews-panel"><h3>会员评价与留言</h3><p class="sub">个人体验供交流，不代表药物疗效证据。请按具体规格、时间和个人情况理解。</p><div id="reviewsSummary" class="reviews-summary"></div><div id="reviewCompose"></div><p id="reviewsMessage" role="status"></p><div id="reviewsList" aria-live="polite">正在加载评价…</div><p class="sub">按最近更新时间展示，最多显示100条。</p></section>`);
    loadReviews(id);
  };
  $('detail').addEventListener('close', () => { activeDrug = null; });
  $('aiSearchButton').onclick = () => {
    const query = $('aiQuestion').value.trim();
    if (!query) { $('aiQuestion').focus(); return; }
    const namedDrug = DATA.map(r => r['中文通用名'].replace(/^(注射用|盐酸|甲磺酸|甲苯磺酸|羟乙磺酸|氢溴酸|枸橼酸|脯氨酸|富马酸|苯磺酸|磷酸|苹果酸|苯甲酸|酒石酸|硫酸|己二酸)/, '').replace(/(注射用浓溶液|缓释片|肠溶胶囊|肠溶片|软胶囊|胶囊|注射液|片)$/, '')).filter(name => name.length >= 3 && query.includes(name)).sort((a, b) => b.length - a.length)[0];
    const searchTerm = namedDrug || query;
    ['year', 'insurance', 'price', 'disease', 'drugKind', 'innovation'].forEach(k => $(k).value = '');
    $('search').value = searchTerm; $('scope').value = 'all'; major = ''; page = 1; diseases(); render();
    $('search').scrollIntoView({behavior: 'smooth', block: 'center'});
    $('aiStatus').textContent = `已用“${searchTerm}”检索药品资料。AI问答将在接入模型后开放。`;
  };
  if (communityEnabled) api('/api/session').then(data => { session = data; online = true; memberState(); if (activeDrug) loadReviews(activeDrug); }).catch(() => {
    $('memberStatus').textContent = '会员服务需通过网站应用服务使用';
  });
  memberState();
})();
