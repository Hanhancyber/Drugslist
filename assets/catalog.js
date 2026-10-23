const $=id=>document.getElementById(id),E=s=>String(typeof s==='object' && s!==null ? JSON.stringify(s) : s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MAIN='国内企业关联主清单（暂定）';let major='',page=1,filtered=[];const size=35;
const priceMap=new Map;PRICES.forEach(p=>{if(!priceMap.has(p.drug_id))priceMap.set(p.drug_id,[]);priceMap.get(p.drug_id).push(p)});
function scoped(){return DATA.filter(r=>$('scope').value==='all'||($('scope').value==='main')===(r['清单层级']===MAIN))}
function categories(){const rs=scoped(),c={};rs.forEach(r=>r['治疗领域关系'].split(';').forEach(m=>c[m]=(c[m]||0)+1));$('categories').innerHTML='<h2>治疗领域</h2>'+[['',rs.length],...Object.entries(c).sort((a,b)=>b[1]-a[1])].map(([m,n])=>`<button class="category ${m===major?'active':''}" data-major="${E(m)}"><span>${E(m||'全部领域')}</span><small>${n}</small></button>`).join('');document.querySelectorAll('.category').forEach(b=>b.onclick=()=>{major=b.dataset.major;page=1;diseases();render()})}
function diseases(){const prev=$('disease').value;const ds=[...new Set(scoped().filter(r=>!major||r['治疗领域关系'].split(';').includes(major)).flatMap(r=>r['疾病小类'].split(';')))].sort();$('disease').innerHTML='<option value="">全部具体疾病</option>'+ds.map(d=>`<option>${E(d)}</option>`).join('');if(ds.includes(prev))$('disease').value=prev}
function badge(r){const s=r['医保状态'];return s.startsWith('已纳入国家')?'<span class="tag">国家医保已匹配</span>':s.startsWith('未纳入基本')?'<span class="tag commercial">仅商保目录</span>':'<span class="tag pending">待人工复核</span>'}
function sourceRank(p){if(p['参考优先'])return -2;if(p['官方定价链已核实'])return -1;return p['价格类型']==='国家医保公开支付标准'?0:p['来源'].includes('nice.org.uk')||p['来源'].includes('ncbi.nlm.nih.gov')?0:1}
function versionDate(p){const text=p['价格日期/来源版本'],day=text.match(/20\d{2}-\d{2}-\d{2}/),month=text.match(/20\d{2}-\d{2}/),year=text.match(/20\d{2}/);return day?day[0]:month?month[0]+'-01':year?year[0]+'-01-01':'0000-00-00'}
function representative(ps){return ps.map((p,index)=>({p,index})).sort((a,b)=>sourceRank(a.p)-sourceRank(b.p)||versionDate(b.p).localeCompare(versionDate(a.p))||a.index-b.index)[0]?.p}
function pair(k,v){return `<dt>${E(k)}</dt><dd>${E(v||'待核实')}</dd>`}
function labelSection(r){const ls=r['说明书列表']||[];let out='<h3>适应症 / 功能主治</h3><div class="detailed-indication">'+E(r['适应症详细说明']||r['获批适应症/功能主治'])+'</div><p class="sub">资料版本：'+E(r['适应症版本']||r['适应症时间口径'])+'</p>';if(r['适应症补充来源'])out+='<p class="linkrow"><a target="_blank" rel="noopener" href="'+E(r['适应症补充来源'])+'">适应症补充公告</a></p>';for(const [i,u] of (r['适应症来源列表']||[]).entries())out+='<p class="linkrow"><a target="_blank" rel="noopener" href="'+E(u)+'">适应症依据 '+(i+1)+'</a></p>';out+='<h3>官方说明书与产品资料</h3><p class="label-status">'+E(r['说明书核查状态']||'尚未取得可核验的完整说明书原件')+'</p>';for(const l of ls){if(!l.url)continue;out+='<div class="label-card"><a href="'+E(l.url)+'" target="_blank" rel="noopener">'+E(l['标题']||'查看说明书')+' ↗</a><p>'+E(l['来源机构']||'')+' · '+E(l['地域']||'中国')+' · '+E(l['版本日期']||'版本日期未标')+'</p><p>'+E(l['核验状态']||'')+'</p>'+ (l['本地阅读副本']||[]).map((u,i)=>'<p><a class="btn" href="'+E(u)+'" target="_blank" rel="noopener">下载已保存的完整PDF'+(i?' '+(i+1):'')+' ↗</a></p>').join('') + ((l['原件链接列表']||[]).length?'<details><summary>厂家原件分页 / 文件链接（'+l['原件链接列表'].length+'）</summary>':'') + (l['原件链接列表']||[]).map((u,i)=>'<a class="label-original" href="'+E(u)+'" target="_blank" rel="noopener">说明书原件 '+(i+1)+' ↗</a>').join(' ') + ((l['原件链接列表']||[]).length?'</details>':'')+'</div>';}out+='<details><summary class="sub">查看原年报 / 首次批准记录</summary><div class="detailed-indication">'+E(r['获批适应症/功能主治'])+'</div><p class="sub">'+E(r['适应症时间口径'])+'</p></details>';return out;}

const formatUSD = p => p['展示金额USD'] == null ? 'USD 待确认' : (p['小额显示'] ? '<0.1 USD' : Number(p['展示金额USD']).toLocaleString('en-US', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + ' USD');
$('stats').innerHTML = [[STATS['国家医保已匹配'], '国家医保目录药品'], [STATS['价格样本数'], '公开价格记录'], [STATS['有国内外价格样本的药品数'], '同时有国内外报价的药品']].map(([n,t]) => `<div class="stat"><strong>${n}</strong><span>${t}</span></div>`).join('');
$('fxDate').textContent = FX.date;
$('fxSource').href = FX.source_url;
const years = [...new Set(DATA.map(r => r['首次中国获批年份'] || r['证据所属年份']))].sort().reverse();
$('year').innerHTML += years.map(y => `<option>${E(y)}</option>`).join('');
for (const [id,key] of [['drugKind','药物类别'],['innovation','创新属性']]) {
  const kinds = [...new Set(DATA.map(r => r[key]))];
  if (id === 'innovation' && !kinds.includes('仿制药')) kinds.push('仿制药');
  $(id).innerHTML += kinds.map(v => `<option value="${E(v)}">${E(v)}${DATA.some(r => r[key] === v) ? '' : '（暂无收录）'}</option>`).join('');
}
function priceType(p) { return p['参考优先'] ? '公开参考价格' : p['价格类型'].startsWith('医院') ? '医院公示价' : p['价格类型']; }
function priceCell(ps,region) {
  const p = representative(ps);
  if (!p) return `<td class="pricecell"><span class="sub">暂无${region}公开价格</span></td>`;
  return `<td class="pricecell"><span class="priceamount">${E(formatUSD(p))}</span> / ${E(p['计价单位'])}<span class="sub">${E(p['国家/地区'])} · ${E(p['规格'])}</span><span class="sub">${E(priceType(p))}</span>${/待|未|冲突/.test(p['单位核验状态']||'') ? '<span class="sub">计价单位待确认，请向医院核实</span>' : ''}<span class="sub">${E(p['价格日期/来源版本'])}</span><a href="${E(p['来源'])}" target="_blank" rel="noopener">价格来源</a>${ps.length > 1 ? `<span class="sub">另有 ${ps.length-1} 条报价</span>` : ''}</td>`;
}
function render() {
  categories();
  const q=$('search').value.trim().toLowerCase(),d=$('disease').value,y=$('year').value,ins=$('insurance').value,pr=$('price').value;
  filtered=scoped().filter(r => (!major || r['治疗领域关系'].split(';').includes(major)) && (!d || r['疾病小类'].split(';').includes(d)) && (!y || (r['首次中国获批年份']||r['证据所属年份'])===y)
    && (!$('drugKind').value || r['药物类别']===$('drugKind').value) && (!$('innovation').value || r['创新属性']===$('innovation').value)
    && (!q || [r['中文通用名'],r['英文通用名'],r['商品名'],r['企业/上市许可持有人'],r['获批适应症/功能主治'],r['适应症详细说明'],r['机制/靶点'],r['疾病小类'],r['药物类别'],r['创新属性']].join(' ').toLowerCase().includes(q))
    && (!ins || (ins==='national' ? r['医保状态'].startsWith('已纳入国家') : ins==='commercial' ? r['医保状态'].startsWith('未纳入基本') : r['医保状态'].includes('待人工')))
    && (!pr || (pr==='paired' ? r['国内价格']&&r['海外价格'] : pr==='domestic' ? r['国内价格'] : pr==='foreign' ? r['海外价格'] : !r['国内价格'])));
  const pages=Math.max(1,Math.ceil(filtered.length/size));page=Math.min(page,pages);
  $('resultcount').textContent=`找到 ${filtered.length} 种药品 · 点击药名查看详情`;
  $('rows').innerHTML=filtered.slice((page-1)*size,page*size).map(r => {
    const ps=priceMap.get(r.drug_id)||[],dom=ps.filter(p=>p['国家/地区']==='中国'),foreign=ps.filter(p=>p['国家/地区']!=='中国');
    const indication=r['适应症详细说明']||r['获批适应症/功能主治'];
    return `<tr><td class="name"><button class="drugname" data-id="${E(r.drug_id)}">${E(r['中文通用名'])}</button><span class="sub">${E(r['疾病小类'].replaceAll(';',' · '))}</span><span class="sub indication-preview">${E(indication.slice(0,110))}${indication.length>110?'…':''}</span><span class="sub">${E(r['企业/上市许可持有人']||'')}</span></td><td class="kindcell"><strong>${E(r['药物类别'])}</strong><span class="sub"><span class="tag">${E(r['创新属性'])}</span></span></td><td>${E(r['首次中国获批年份']||'待核实')}</td><td>${badge(r)}<span class="sub">2025版 · 2026执行</span></td>${priceCell(dom,'国内')}${priceCell(foreign,'海外')}</tr>`;
  }).join('');
  $('empty').hidden=filtered.length>0;
  $('page').textContent=`${page} / ${pages}`;$('prev').disabled=page===1;$('next').disabled=page===pages;
  document.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>show(b.dataset.id));
}
function sourceLinks(r) {
  let out='';
  for (const [key,title] of [['批准来源','批准信息'],['补充来源','补充批准信息'],['医保来源','医保目录原文'],['海外上市来源','海外上市信息']]) {
    const urls=(r[key]||'').split(/[；\n]|;(?=https?:\/\/)/).filter(u=>/^https?:\/\//.test(u));
    urls.forEach((url,i)=>out+=`<p class="linkrow"><a href="${E(url)}" target="_blank" rel="noopener">${E(title)}${urls.length>1?' '+(i+1):''}</a></p>`);
  }
  return out;
}
function priceCard(p) {
  return `<div class="pricerow"><span class="tag">${E(p['国家/地区'])}</span> <strong>${E(formatUSD(p))}</strong> / ${E(p['计价单位'])}<p>${E(p['规格'])} · ${E(priceType(p))}</p><p>${E(p['价格日期/来源版本'])}${p['协议有效期']?' · 协议期 '+E(p['协议有效期']):''}</p>${p['展示金额USD']==null?'<p>原资料币种未注明，确认后再折算。</p>':''}${p['单位核验状态']?`<p>${E(p['单位核验状态'])}</p>`:''}<details class="price-evidence"><summary>价格口径与原始报价</summary><p>原始报价：${E(p['金额'])} ${E(p['币种'])} / ${E(p['计价单位'])}</p><p>${E(p['口径说明'])}</p><p>USD金额按 ${E(FX.date)} 欧洲央行参考汇率折算，非历史报价日汇率。</p><p>${E(p['来源定位'])}</p></details>${p['海外上市公告']?`<div class="source-chain"><a href="${E(p['海外上市公告'])}" target="_blank" rel="noopener">当地上市公告</a><span>${E(p['海外上市日期']||'')}</span></div>`:''}<a href="${E(p['来源'])}" target="_blank" rel="noopener">价格来源</a></div>`;
}
function show(id) {
  const r=DATA.find(r=>r.drug_id===id),ps=[...(priceMap.get(id)||[])].sort((a,b)=>sourceRank(a)-sourceRank(b)||versionDate(b).localeCompare(versionDate(a)));
  $('drugtitle').textContent=r['中文通用名'];$('drugsubtitle').textContent=[r['英文通用名'],r['商品名']].filter(Boolean).join(' · ');
  let s='<h3>药品信息</h3><dl class="grid">';
  for (const k of ['药物类别','创新属性','治疗大类','疾病小类','企业/上市许可持有人','机制/靶点','首次中国获批年份','国内上市状态','海外上市状态']) s+=pair(k,r[k]);
  s+='</dl><details class="classification-note"><summary>药品分类依据</summary><p>'+E(r['分类依据'])+'</p><p>药物类别与创新属性是两个维度，可同时成立。“历史新药”按批准当时口径标示，不等同于现行1类创新药。</p></details>'+labelSection(r)+'<h3>医保目录</h3><dl class="grid">';
  for (const k of ['医保状态','医保目录版本','医保限定支付范围','医保协议期','医保核查方法','医保来源定位']) s+=pair(k,r[k]);
  s+='</dl><h3>公开价格（USD）</h3><p class="sub">价格按原规格与计价单位展示，不等于个人自付费用。不同地区、日期和折扣条件的报价不能直接视为实际价差。</p>';
  s+=ps.length?ps.map(priceCard).join(''):'<p>暂无可核验的公开价格。</p>';
  s+='<h3>资料来源</h3>'+sourceLinks(r)+'<p class="sub">资料更新：2026-10-23。适应症与用药要求以当地现行说明书为准。</p>';
  $('detailbody').innerHTML=s;$('detail').showModal();$('detail').scrollTop=0;
}
$('close').onclick=()=>$('detail').close();$('detail').onclick=e=>{if(e.target===$('detail'))$('detail').close()};
['search','disease','year','insurance','price','drugKind','innovation'].forEach(k=>$(k).addEventListener(k==='search'?'input':'change',()=>{page=1;render()}));
$('scope').onchange=()=>{major='';page=1;diseases();render()};
$('reset').onclick=()=>{major='';page=1;['search','year','insurance','price','disease','drugKind','innovation'].forEach(k=>$(k).value='');$('scope').value='all';diseases();render()};
$('prev').onclick=()=>{page--;render()};$('next').onclick=()=>{page++;render()};
$('export').onclick=()=>{
  const columns=['药品名称','药物类别','创新属性','适应症','国家医保','国内公开价格USD','海外公开价格USD','汇率日期'];
  const rows=filtered.map(r=>{const ps=priceMap.get(r.drug_id)||[];const summary=ps=>{const p=representative(ps);return p?`${formatUSD(p)} / ${p['计价单位']} · ${p['规格']}`:''};return [r['中文通用名'],r['药物类别'],r['创新属性'],r['适应症详细说明']||r['获批适应症/功能主治'],r['医保状态'],summary(ps.filter(p=>p['国家/地区']==='中国')),summary(ps.filter(p=>p['国家/地区']!=='中国')),FX.date]});
  const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  const blob=new Blob(['\ufeff'+[columns,...rows].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='药品查询-USD.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
if(location.hash==='#prices')$('price').value='paired';diseases();render();
