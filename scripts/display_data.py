"""Patient-facing categories and USD reference amounts; source facts stay unchanged."""
from decimal import Decimal, ROUND_HALF_UP

KIND_NAMES = {'化学药品': '化学药', '治疗用生物制品': '生物药', '预防用生物制品': '疫苗', '中药': '中成药'}


def classify(drug):
    raw = drug.get('注册创新类别', '')
    if '生物类似药' in raw:
        attribute = '生物类似药'
    elif '仿制药' in raw:
        attribute = '仿制药'
    elif '改良型' in raw:
        attribute = '改良型新药'
    elif '历史' in raw:
        attribute = '历史新药'
    elif '创新药' in raw or raw in ('化学药1类', '中药1.1类', '中药1.2类'):
        attribute = '创新药'
    else:
        attribute = '待核实'
    return {'药物类别': KIND_NAMES.get(drug.get('药品类型'), '待核实'),
            '创新属性': attribute, '分类依据': raw, '分类来源': drug.get('批准来源', '')}


def usd_fields(price, exchange):
    currency = price.get('币种')
    rates = exchange['units_per_eur']
    if currency not in rates:
        return {'展示金额USD': None, '展示币种': 'USD', '美元换算状态': '原币种待确认，暂不换算',
                '汇率日期': exchange['date'], '汇率来源': exchange['source_url']}
    amount = Decimal(str(price['金额']))
    factor = Decimal(str(rates['USD'])) / Decimal(str(rates[currency]))
    precise = amount * factor
    rounded = precise.quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)
    return {'展示金额USD': float(rounded), '展示币种': 'USD', 'USD换算系数': str(factor),
            '美元换算状态': '参考汇率折算', '小额显示': bool(precise > 0 and rounded == 0),
            '汇率日期': exchange['date'], '汇率来源': exchange['source_url']}
