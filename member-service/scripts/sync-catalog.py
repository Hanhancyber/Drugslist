from pathlib import Path
import shutil,json,argparse
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--catalog-root',type=Path)
args=parser.parse_args()
SOURCE=args.catalog_root or (ROOT.parent if (ROOT.parent/'data/drugs.json').exists() else ROOT.parents[1]/'publish/Drugslist')
(ROOT/'public/assets').mkdir(parents=True,exist_ok=True)
(ROOT/'public/data').mkdir(parents=True,exist_ok=True)
(ROOT/'generated').mkdir(exist_ok=True)
(ROOT/'generated/catalog.html').write_text((SOURCE/'drugs.html').read_text())
(ROOT/'generated/home.html').write_text((SOURCE/'index.html').read_text())
(ROOT/'generated/drug-ids.json').write_text(json.dumps([r['drug_id'] for r in json.loads((SOURCE/'data/drugs.json').read_text())]))
for asset in ['catalog.js','catalog-order.js','catalog.css','community.js','community.css','medical2china-logo.png','innovation.js','innovation.css','home.css','home.js','innovation-world.png','medicine-library.png']:
 shutil.copyfile(SOURCE/'assets'/asset,ROOT/'public/assets'/asset)
for asset in ['drugs.csv','prices.csv','sources.csv']:
 shutil.copyfile(SOURCE/'data'/asset,ROOT/'public/data'/asset)
shutil.copyfile(SOURCE/'innovation.html',ROOT/'public/innovation.html')
shutil.copyfile(SOURCE/'drugs.html',ROOT/'public/drugs.html')
shutil.copyfile(SOURCE/'DATA_NOTES.md',ROOT/'public/DATA_NOTES.md')
print('Synced the public catalog and member UI; no private research or runtime data copied.')
