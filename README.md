# Drugslist

面向患者的药品查询网站，提供适应症、官方说明书、国家医保信息和可追溯公开价格。

**网站： https://hanhancyber.github.io/Drugslist/**

当前收录 248 条药品产品记录、167 条价格样本；114 种已有完整官方说明书（含境外版和历史版），134 种仍待补齐。40 条海外价格记录附当地上市公告和官方价格依据，覆盖 23 种药品。数据核查日期：2026-10-23。

## 在线功能

- 按药名、治疗领域、疾病、药物类别、创新属性、年份和医保搜索筛选，查看逐药详情及来源，导出 CSV。
- 页面金额统一按欧洲央行2026年10月22日参考汇率折算为 USD，保留一位小数。原始报价、计价单位和来源保留；币种不明的记录暂不折算。
- 药物类别和创新属性分别标示，历史新药按原批准口径展示，不能据国内企业身份推定仿制或原研。
- 完整说明书副本从 [版本附件](https://github.com/Hanhancyber/Drugslist/releases/tag/labels-2026-10-23) 下载；同时保留机构官网原件链接。
- AI 问答预留区，可把输入内容转为药品搜索；模型尚未接入。
- 顶部六项概览：248种药品、19个治疗领域、161种国家医保目录药品、167条公开价格记录、7种国内外均有报价的药品、114种有完整官方说明书的药品。
- 邮箱会员和评价服务已上线：[会员与评价](https://drugslist-members.hanhan2.chatgpt.site/)。GitHub 页面展示公开评分，注册、登录和发言自动进入会员服务同源页面；无需 ChatGPT 账号。
- 逐药显示均分、评价人数、留言数、1–5星分布及高低分人数；同一会员取最新评分，避免多条留言重复增加权重。支持价格、用药体验及其他分类。

## 会员服务与本地运行

生产会员服务使用 Cloudflare Workers 与持久化 D1，源码及迁移在 [member-service](member-service/README.md)。邮箱加密码即可注册，昵称选填；公开评价只显示昵称。密码以 scrypt 摘要保存，会话采用 HttpOnly Cookie，写入校验 Origin 与 CSRF，并设有限流。

```sh
cd member-service
npm ci
python3 scripts/sync-catalog.py
npm run build
node --test tests/community.test.mjs
```

首次本地运行还需按会员服务 README 初始化数据库，再 `npm start -- --port 8780`。账号与评价不保存在 GitHub Pages，也不提交到仓库。

当前尚未启用邮箱所有权验证和邮件密码找回，页面已说明。举报记录存于 D1 的 reports 表；尚未提供独立管理员界面。根目录 `server.py` 与其管理脚本是旧版本地原型，不用于当前线上会员服务，请使用 member-service 运行当前版本。

## 更新与部署

编辑 `data/` 中的公开数据（金额与币种字段保留原始报价）或 `scripts/viewer-template.html` / `assets/`，然后运行：

```sh
python3 scripts/build_site.py
```

前端修改后还需运行 `python3 member-service/scripts/sync-catalog.py` 同步会员站点的公开目录快照，通过 Sites 流程部署会员服务；其项目身份见 `member-service/.openai/hosting.json`。

提交到仓库默认分支后，GitHub Pages 从该分支根目录自动发布。`.nojekyll` 保留原始静态文件。PDF 通过版本附件单独分发，`data/label-files.json` 记录 SHA-256 与来源对应的药品 ID。

详见 [数据口径与缺口](DATA_NOTES.md)。本项目保留版本、地区、价格类型和证据缺口，不将个人体验视为药效证据；价格并非个人报销后的自付费用。说明书及来源文件的权利归其原发布机构，保留原文与出处。
