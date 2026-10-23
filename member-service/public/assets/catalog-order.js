/* Editorial browsing order. This is not a sales, efficacy, or treatment ranking.
   Representatives span established international products and major local innovations.
   Stable source order is retained within the remaining medicines. */
const CATALOG_FEATURED_IDS = [
  'DL-4E01135DC8', // 泽布替尼
  'DL-95372CF593', // 西达基奥仑赛
  'DL-42482FD7C9', // 呋喹替尼
  'DL-4ABB2607D4', // 特瑞普利单抗
  'DL-5A0E51431F', // 替雷利珠单抗
  'DL-BD10B6B4F3', // 托莱西单抗
  'DL-106E278272', // 伊努西单抗
  'DL-4A017180E7', // 瑞卡西单抗
  'DL-2569501B91', // 泰它西普
  'DL-50C9274C8E', // 多格列艾汀
  'DL-4557C9E06B', // 仑卡奈单抗
  'DL-EA6A45D5A5', // 罗沙司他
  'DL-40C007FCAA', // 依沃西单抗
  'DL-61DA4A3125', // 吡咯替尼
  'DL-55B8F94452', // 信迪利单抗
  'DL-AE1A07CEAE', // 卡瑞利珠单抗
  'DL-11C7BFB3F4', // 维迪西妥单抗
  'DL-7AD42E6167', // 卡度尼利单抗
  'DL-5835437ADA', // 阿美替尼
  'DL-BE5855842B', // 伏美替尼
  'DL-42B1EE727F', // 舒沃替尼
  'DL-56FA14B988', // 奥雷巴替尼
  'DL-68A831ACF4', // 阿利沙坦酯
  'DL-1685F6E35A', // 玛仕度肽
  'DL-E22AEDAD6C', // 艾米替诺福韦
  'DL-0EC26638F9', // 奥磷布韦
  'DL-3677D7D3BD', // 艾诺韦林
  'DL-6DBEED1BF7', // 艾玛昔替尼
  'DL-8AFE4AB34A', // 丁苯酞
  'DL-866BD7E95F', // 康柏西普
  'DL-54830EC8C1', // 司普奇拜单抗
  'DL-DF0827BE2C', // 夫那奇珠单抗
  'DL-93F143A71E', // 伊普可泮
  'DL-88859128B1', // 海曲泊帕
  'DL-ADD32D3169', // 环泊酚
  'DL-5FD830727A', // 瑞马唑仑
  'DL-C3D9136081', // 艾瑞昔布
  'DL-99A15B1BBA', // 双环醇
  'DL-6F29DCDD07'  // 戊肝疫苗
];
const catalogFeaturedRank = new Map(CATALOG_FEATURED_IDS.map((id, index) => [id, index]));
function compareCatalogDrugs(a, b) {
  return Number(a['药物类别'] === '中成药') - Number(b['药物类别'] === '中成药')
    || (catalogFeaturedRank.get(a.drug_id) ?? 10000) - (catalogFeaturedRank.get(b.drug_id) ?? 10000);
}
