"""Build the sourced China innovation guide without external dependencies."""
import json,re
from html import escape as E
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'data/innovation.json').read_text())
fx=json.loads((ROOT/'data/exchange-rates.json').read_text())
sources={s['id']:{**s,'number':i+1} for i,s in enumerate(data['sources'])}
def usd(n,currency='CNY'):
 return n * float(fx['units_per_eur']['USD'])/float(fx['units_per_eur'][currency]) / 100000000
def cite(key):
 s=sources[key]
 return f'<a class="cite" href="{E(s["url"])}" target="_blank" rel="noopener" aria-label="来源 {s["number"]}：{E(s["title"])}">[{s["number"]}]</a>'
def refs(keys): return ' '.join(cite(k) for k in keys)
def translated_money(s):
 return re.sub(r'人民币 ([\d.]+) 亿元',lambda m:f'{usd(float(m[1])*100000000):.1f} 亿 USD',s)
drugs=[]
for i,d in enumerate(data['drugs']):
 link=f'<a class="catalog-link" href="drugs.html?drug={E(d["id"])}">说明书与价格 ↗</a>' if d['id'] else f'<a class="catalog-link" href="{E(sources[d["refs"][0]]["url"])}" target="_blank" rel="noopener">查看监管资料 ↗</a>'
 drugs.append(f'''<article class="feature-drug" data-therapy="{E(d['field'])}" aria-label="{E(d['name'])}"><div class="feature-drug-top"><span class="feature-number">{i+1:02d}</span><span class="market-status {'domestic' if d['status']=='中国已获批' else ''}">{E(d['status'])}</span></div><span class="drug-category">{E(d['field'])} / {E(d['mechanism'])}</span><h3>{E(d['name'])}</h3><p class="drug-global-name">{E(d['english'])}</p><p class="origin-company">{E(d['company'])}</p><p class="drug-story">{E(d['intro'])}</p><div class="drug-evidence"><div><h4>适用范围</h4><p>{E(d['use'])}</p></div><details><summary>临床证据与阅读要点</summary><p>{E(d['evidence'])}</p>{refs(d['refs'])}</details></div><div class="drug-signal"><strong>{E(d['signal'])}</strong><span>{E(d['signalLabel'])}</span></div><div class="feature-drug-foot">{link}<details class="reference-note"><summary>参考来源</summary>{refs(d['refs'])}</details></div></article>''')
companies=[]
for d in data['companies']:
 amount=f'{usd(d["amount"],d["currency"]):.1f}'
 original=f'{d["amount"]/100000000:,.3f} 亿 {d["currency"]}'
 companies.append(f'''<article class="company-card"><span class="company-focus">{E(d['focus'])}</span><h3>{E(d['name'])}</h3><p class="company-en">{E(d['en'])}</p><div class="company-finance"><span>{E(d['basis'])}</span><strong>{'约 ' if d.get('approx') else ''}{amount}<small>亿 USD</small></strong></div><p class="company-products"><span>代表产品</span>{E(d['products'])}</p><p class="company-global">{E(d['global'])}</p><details><summary>财务细分与原始口径</summary><ul>{''.join('<li>'+E(translated_money(h))+'</li>' for h in d['highlights'])}</ul><p>上方收入原值：{E(original)}。人民币原币细分金额请见企业原始披露。</p></details><details class="company-sources reference-note"><summary>年度披露与监管来源</summary>{refs(d['refs'])}</details></article>''')
series=data['pipeline']['china'][1:]
points=[(40+i*86,190-v/8000*160) for i,(_,v) in enumerate(series)]
chart='<svg class="pipeline-chart" viewBox="0 0 520 230" role="img" aria-label="中国境内在研药物从2020年2590个增至2025年7041个"><title>中国境内在研药物，2020—2025</title>'
for tick in [0,4000,8000]:
 y=190-tick/8000*160
 chart+=f'<line x1="34" y1="{y}" x2="480" y2="{y}" stroke="#deebf4"/><text x="4" y="{y-5}" class="axis-label">{tick:,}</text>'
chart+=f'<path d="M40,190 '+ ' '.join(f'L{x},{y}' for x,y in points)+' L470,190Z" fill="#e7f2fa"/>'
chart+='<polyline points="'+' '.join(f'{x},{y}' for x,y in points)+'" fill="none" stroke="#368bbd" stroke-width="3"/>'
for (year,v),(x,y) in zip(series,points):
 chart+=f'<circle cx="{x}" cy="{y}" r="4" fill="#2177af"/><text x="{x}" y="{y-12}" text-anchor="middle" class="point-label">{v:,}</text><text x="{x}" y="215" text-anchor="middle" class="year-label">{year}</text>'
chart+='</svg>'
table='<table class="pipeline-data"><thead><tr><th>年份</th><th>中国境内在研药物</th></tr></thead><tbody>'+''.join(f'<tr><td>{year}</td><td>{v:,}</td></tr>' for year,v in data['pipeline']['china'])+'</tbody></table>'
html=(ROOT/'scripts/innovation-template.html').read_text()
replacements={'__PIPELINE_CHART__':chart,'__PIPELINE_TABLE__':table,'__RD_USD__':f'{usd(121330000000):.1f}','__DRUGS__':''.join(drugs),'__COMPANIES__':''.join(companies),'__FX_DATE__':fx['date'],'__FX_SOURCE__':fx['source_url'],'__SOURCE_COUNT__':str(len(sources)), '__SOURCES__':''.join(f'<li><a href="{E(s["url"])}" target="_blank" rel="noopener">{E(s["title"])}</a><span>{E(s["date"])}</span></li>' for s in sources.values())}
for k,v in replacements.items(): html=html.replace(k,v)
html=re.sub(r'__REF_(\w+)__',lambda m:cite(m[1]),html)
assert not re.search(r'__[A-Z_]+__',html)
(ROOT/'innovation.html').write_text(html)
print(f'Built innovation.html with {len(drugs)} medicine profiles, {len(companies)} companies and {len(sources)} sources.')
