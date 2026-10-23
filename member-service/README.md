# Drugslist 会员服务

为 Drugslist 公共药品目录提供邮箱注册、登录、逐药留言及五星评分。服务使用 Sites / Cloudflare Workers 和持久化 D1 数据库；不需要 ChatGPT 账号。

## 本地运行

需要 Node.js 22.13+（测试需支持 `node:sqlite`）与 npm。

```sh
npm ci
python3 scripts/sync-catalog.py --catalog-root /absolute/path/to/Drugslist
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config dist/server/wrangler.json --persist-to .wrangler/state
npm start -- --port 8780
```

后续模式变更使用 `npm run db:generate` 生成新迁移，再应用未执行的迁移；已部署迁移不要改写。如果旧本地数据库用 `d1 execute` 手工初始化过 0000，须按其实际状态补执行 0001，不要重建已有表。`.wrangler/` 数据库、`.sites-runtime/`、环境文件和凭证不进入源码。

```sh
node --test tests/community.test.mjs tests/email-auth.test.mjs
```

`generated/` 与 `public/` 保存公开目录的构建快照。GitHub 仓库内的 `member-service/` 默认可从父目录同步；独立 Sites checkout 可用 `--catalog-root` 指定公开目录。只复制公开目录、CSS/JS 和 CSV，不复制研究报告、PDF 原始附件或运行数据。

## 账户与评价规则

- 邮箱及10–128位密码注册，昵称选填，不填自动生成；注册后登录。启用邮件验证时，未验证会员须先完成邮箱验证才能发布评价。
- 邮箱仅本人会话可见，公开评价只显示昵称。历史会员的验证时间保持为空，不能视为已验证；开启验证后需补验证，原评价保留。
- 密码使用随机盐 scrypt；会话使用 HttpOnly、Secure（HTTPS）、SameSite=Lax Cookie，写入校验 Origin 和 CSRF，并对注册、登录、留言及举报限流。
- 每人每药每方向（价格／用药体验／其他）保留一条留言，再次提交更新原留言。
- 综合评分取每位会员最新一次非空评分；人数、1–5星分布及高低分均按去重会员计算。无评分时平均分为 null。仅留言者计入留言人数，不计入评分人数。
- 用户可编辑或移除本人的留言；其他用户可举报。`reports` 表保留举报记录，当前未提供独立管理员后台。
- GitHub Pages 只跨域读取公开评分，注册和留言跳转此服务的同源页面完成。无跨站身份 Cookie，也不向浏览器本地存储写入令牌。

## 部署

站点身份及 D1 绑定在 `.openai/hosting.json`。保留 Sites 构建集成，通过 Sites 的源码同步、版本保存和部署流程发布。生产迁移随构建部署，不手工把本地数据库复制上线。

## 邮箱验证与密码找回

已实现注册验证、重发验证、邮件找回和重置密码。生产发信需配置服务后才能启用；**部署代码不等于邮件已送达或发信域名已验证**。未配置时保留现有邮箱密码注册登录，页面明确显示验证与邮件找回尚不可用。

当前适配 Resend HTTPS API，不使用浏览器直接发信或个人邮箱连接器。需要：

1. 在自己的 Resend 账号中添加自己控制的发信域名（建议专用子域名），在域名 DNS 添加服务商实际给出的 SPF / DKIM 等记录并确认验证通过。不要为此改动原业务邮箱的根域 MX。
2. 生成仅允许发送该域邮件的 API key，在 Sites 生产环境设置 `RESEND_API_KEY`，标记为 secret；设置 `MAIL_FROM` 为该已验证域名下的纯邮箱地址，如 `accounts@your-verified-domain.example`。不要把 key 放入代码、GitHub、浏览器、hosting.json 或聊天。
3. 设置 `EMAIL_AUTH_ENABLED=true`，重新部署已保存的版本使配置生效。只有该开关和上述配置均存在时显示发信入口。开启但缺少配置时新注册失败关闭，避免创建无法验证的账号。
4. 用站点所有者指定的测试邮箱完成真实收件→验证→登录→重置密码→重新登录，并在 Resend 检查投递状态。`/api/health` 的 `email_delivery_available` 仅表示配置完整，不证明密钥有效、域名通过验证或邮件到达收件箱。未完成此项不能报告已通过线上邮件验证。

邮件链接使用固定站点 HTTPS origin、URL fragment（立即从地址栏移除）和 `no-referrer`，不接受客户端指定跳转地址。验证须输入注册密码，避免被他人预注册的邮箱在误点邮件后变成已验证账号。验证链接有效24小时，重置链接有效30分钟；只保存随机256位令牌的 SHA-256 摘要，单次消费通过 D1 原子 batch 防止并发重放。重发使同类旧链接失效；密码改变使旧令牌失效。验证/重置成功均撤销所有旧会话与未用令牌，再通过普通登录进入账号；重置会额外发送安全通知邮件。

找回密码对已存在和不存在的邮箱使用同样的202响应，查询与发送由 Workers `waitUntil` 后台执行；每个邮箱每分钟1次、每小时5次，另有 IP 限流。注册/重发会显示发送提交失败；重置邮件失败不暴露账号是否存在。日志不包含邮箱、令牌、密钥或第三方响应正文。此版本没有持久邮件队列，失败后用户可重试，运营应查看服务商投递日志和退信。

参考：[Resend Workers 接入](https://resend.com/docs/send-with-cloudflare-workers)、[域名验证](https://resend.com/docs/dashboard/domains/introduction)、[发送 API](https://resend.com/docs/api-reference/emails/send-email)、[OWASP 密码找回](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)。
