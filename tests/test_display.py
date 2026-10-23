import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from display_data import classify, usd_fields


class DisplayData(unittest.TestCase):
    def setUp(self):
        self.fx=json.loads((ROOT/'data/exchange-rates.json').read_text())

    def test_reference_direction_and_rounding(self):
        # Each of these amounts equals EUR 10, or USD 11.205 before rounding.
        for currency, amount in [('CNY',74.786),('GBP',8.377),('JPY',1759.7),('CAD',15.725)]:
            self.assertEqual(usd_fields({'金额':amount,'币种':currency},self.fx)['展示金额USD'],11.2)
        self.assertEqual(usd_fields({'金额':1.25,'币种':'USD'},self.fx)['展示金额USD'],1.3)

    def test_unknown_currency_is_not_assumed(self):
        price={'金额':1000,'币种':'币种待确认'}
        result=usd_fields(price,self.fx)
        self.assertIsNone(result['展示金额USD'])
        self.assertEqual(price,{'金额':1000,'币种':'币种待确认'})
        tiny=usd_fields({'金额':0.01,'币种':'CNY'},self.fx)
        self.assertTrue(tiny['小额显示'])

    def test_classification_dimensions_and_historical_limit(self):
        new=classify({'药品类型':'中药','注册创新类别':'中药1.2类'})
        self.assertEqual((new['药物类别'],new['创新属性']),('中成药','创新药'))
        self.assertEqual(classify({'药品类型':'化学药品','注册创新类别':'历史化学药1类'})['创新属性'],'历史新药')
        self.assertEqual(classify({'药品类型':'化学药品','注册创新类别':'报告明确创新药/历史新药；历史类别见证据'})['创新属性'],'待核实')
        self.assertEqual(classify({'药品类型':'化学药品','注册创新类别':'4类仿制药'})['创新属性'],'仿制药')
        self.assertEqual(classify({'药品类型':'治疗用生物制品','注册创新类别':'生物类似药'})['创新属性'],'生物类似药')

    def test_all_published_prices_have_consistent_display_values(self):
        rows=json.loads((ROOT/'data/prices.json').read_text())
        for p in rows:
            expected=usd_fields(p,self.fx)
            self.assertEqual(p['展示金额USD'],expected['展示金额USD'],p['price_id'])
        self.assertEqual(sum(p['展示金额USD'] is not None for p in rows),174)


if __name__=='__main__':unittest.main()
