"""Rebuild the static site from the published, source-linked data. Python stdlib only."""
from pathlib import Path
import csv
import json

ROOT = Path(__file__).resolve().parents[1]
template = (ROOT / 'scripts/viewer-template.html').read_text()
with (ROOT / 'data/coverage-by-year.csv').open(encoding='utf-8-sig', newline='') as f:
    coverage = list(csv.DictReader(f))
for key, value in [('DATA', json.loads((ROOT / 'data/drugs.json').read_text())),
                   ('PRICES', json.loads((ROOT / 'data/prices.json').read_text())),
                   ('STATS', json.loads((ROOT / 'data/statistics.json').read_text())),
                   ('COVERAGE', coverage)]:
    template = template.replace('__' + key + '__', json.dumps(value, ensure_ascii=False).replace('</', '<\\/'))
(ROOT / 'outputs/Drugs-List.html').write_text(template)
# Keep the full page at the project root and the original URL for existing links.
index = template.replace('../assets/', 'assets/').replace('../data/', 'data/')
index = index.replace('../DATA_NOTES.md', 'DATA_NOTES.md').replace('href="Drugs-List.md"', 'href="outputs/Drugs-List.md"')
(ROOT / 'index.html').write_text(index)
print('Built index.html and outputs/Drugs-List.html')
