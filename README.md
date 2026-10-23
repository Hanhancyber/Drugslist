# Drugslist

面向患者的药品查询网站，提供适应症、官方说明书、国家医保信息和可追溯公开价格。

**网站： https://hanhancyber.github.io/Drugslist/**

当前收录 258 条药品产品记录、175 条价格样本；117 种已有完整官方说明书（含境外版和历史版），141 种仍待补齐。40 条海外价格记录附当地上市公告和官方价格依据，覆盖 23 种药品。数据核查日期：2026-10-23。

## 在线功能

- 按药名、治疗领域、疾病、药物类别、创新属性、年份、医保和价格覆盖搜索筛选，查看逐药详情及来源，导出 CSV。
- 页面金额统一按欧洲央行2026年10月22日参考汇率折算为 USD，保留一位小数。原始报价、计价单位和来源保留；币种不明的记录暂不折算。
- 药物类别和创新属性分别标示，历史新药按原批准口径展示，不能据国内企业身份推定仿制或原研。
- 完整说明书副本从 [版本附件](https://github.com/Hanhancyber/Drugslist/releases/tag/labels-2026-10-23) 下载；同时保留机构官网原件链接。
- AI 问答预留区，可把输入内容转为药品搜索；模型尚未接入。
- GitHub Pages 为静态站点，线上会员注册与评价暂未开放。仓库包含可本地运行的注册、登录、评价、举报和管理员处理后端。

## 本地运行

需要 Python 3.10 或更新版本，无额外依赖。

```sh
python3 server.py --port 8774
```

打开 http://127.0.0.1:8774/ 。本地应用支持会员注册与登录、逐药价格/用药体验/其他评价、本人评价删除和举报。账号与评价保存于 `runtime/members.sqlite3`，不会进入 Git。密码采用加盐 PBKDF2 摘要，会话采用 HttpOnly Cookie，写入校验 CSRF。服务当前仅绑定本机；未提供密码找回功能。

```sh
python3 -m unittest discover -s tests -v
python3 scripts/review_admin.py --help
```

## 更新与部署

编辑 `data/` 中的公开数据（金额与币种字段保留原始报价）或 `scripts/viewer-template.html` / `assets/`，然后运行：

```sh
python3 scripts/build_site.py
```

提交到仓库默认分支后，GitHub Pages 从该分支根目录自动发布。`.nojekyll` 保留原始静态文件。PDF 通过版本附件单独分发，`data/label-files.json` 记录 SHA-256 与来源对应的药品 ID。

详见 [数据口径与缺口](DATA_NOTES.md)。本项目保留版本、地区、价格类型和证据缺口，不将个人体验视为药效证据；价格并非个人报销后的自付费用。说明书及来源文件的权利归其原发布机构，保留原文与出处。
