"""Build the patient-facing static site. Python standard library only."""
from pathlib import Path
import csv
import json
from display_data import classify, usd_fields

ROOT = Path(__file__).resolve().parents[1]
template = (ROOT / 'scripts/viewer-template.html').read_text()
exchange = json.loads((ROOT / 'data/exchange-rates.json').read_text())
drugs = json.loads((ROOT / 'data/drugs.json').read_text())
prices = json.loads((ROOT / 'data/prices.json').read_text())
for drug in drugs:
    drug.update(classify(drug))
for price in prices:
    price.update(usd_fields(price, exchange))
for name, rows in [('drugs', drugs), ('prices', prices)]:
    (ROOT / f'data/{name}.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
    with (ROOT / f'data/{name}.csv').open('w', encoding='utf-8-sig', newline='') as f:
        fields = list(dict.fromkeys(k for row in rows for k in row))
        if name == 'prices':
            preferred = ['price_id', 'drug_id', '药品名称', '国家/地区', '展示金额USD', '展示币种', '规格', '计价单位', '汇率日期', '美元换算状态']
            fields = preferred + [k for k in fields if k not in preferred]
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v for k, v in row.items()} for row in rows)
with (ROOT / 'data/coverage-by-year.csv').open(encoding='utf-8-sig', newline='') as f:
    coverage = list(csv.DictReader(f))
for key, value in [('DATA', drugs), ('PRICES', prices), ('FX', exchange),
                   ('STATS', json.loads((ROOT / 'data/statistics.json').read_text())), ('COVERAGE', coverage)]:
    template = template.replace('__' + key + '__', json.dumps(value, ensure_ascii=False).replace('<', '\\u003c'))
(ROOT / 'outputs/Drugs-List.html').write_text(template)
index = template.replace('../assets/', 'assets/').replace('../data/', 'data/')
index = index.replace('../DATA_NOTES.md', 'DATA_NOTES.md').replace('href="Drugs-List.md"', 'href="outputs/Drugs-List.md"')
(ROOT / 'index.html').write_text(index)
print('Built index.html and outputs/Drugs-List.html')
