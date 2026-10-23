# Drugslist 会员服务

为 Drugslist 公共药品目录提供邮箱注册、登录、逐药留言及五星评分。服务使用 Sites / Cloudflare Workers 和持久化 D1 数据库；不需要 ChatGPT 账号。

## 本地运行

需要 Node.js 22.13+（测试需支持 `node:sqlite`）与 npm。

```sh
npm ci
python3 scripts/sync-catalog.py --catalog-root /absolute/path/to/Drugslist
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_mushy_justin_hammer.sql
npm start -- --port 8780
```

首次初始化本地数据库时执行上述 SQL 一次。后续模式变更使用 `npm run db:generate` 生成新迁移；已部署迁移不要改写。`.wrangler/` 数据库、`.sites-runtime/`、环境文件和凭证不进入源码。

```sh
node --test tests/community.test.mjs
```

`generated/` 与 `public/` 保存公开目录的构建快照。GitHub 仓库内的 `member-service/` 默认可从父目录同步；独立 Sites checkout 可用 `--catalog-root` 指定公开目录。只复制公开目录、CSS/JS 和 CSV，不复制研究报告、PDF 原始附件或运行数据。

## 账户与评价规则

- 邮箱及10–128位密码注册，昵称选填，不填自动生成；注册后直接登录。
- 邮箱仅本人会话可见，公开评价只显示昵称。尚未启用邮件所有权验证及邮件找回密码，不应把邮箱视为已验证身份。
- 密码使用随机盐 scrypt；会话使用 HttpOnly、Secure（HTTPS）、SameSite=Lax Cookie，写入校验 Origin 和 CSRF，并对注册、登录、留言及举报限流。
- 每人每药每方向（价格／用药体验／其他）保留一条留言，再次提交更新原留言。
- 综合评分取每位会员最新一次非空评分；人数、1–5星分布及高低分均按去重会员计算。无评分时平均分为 null。仅留言者计入留言人数，不计入评分人数。
- 用户可编辑或移除本人的留言；其他用户可举报。`reports` 表保留举报记录，当前未提供独立管理员后台。
- GitHub Pages 只跨域读取公开评分，注册和留言跳转此服务的同源页面完成。无跨站身份 Cookie，也不向浏览器本地存储写入令牌。

## 部署

站点身份及 D1 绑定在 `.openai/hosting.json`。保留 Sites 构建集成，通过 Sites 的源码同步、版本保存和部署流程发布。生产迁移随构建部署，不手工把本地数据库复制上线。
