// Transactional mail stays on the server. Never pass these bindings to the browser.
export const ACCOUNT_ORIGIN = 'https://drugslist-members.hanhan2.chatgpt.site';
export const emailEnabled = env => env.EMAIL_AUTH_ENABLED === 'true';
export function emailReady(env) {
  return emailEnabled(env) && typeof env.RESEND_API_KEY === 'string' && env.RESEND_API_KEY.length > 10
    && typeof env.MAIL_FROM === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.MAIL_FROM);
}
export async function sendAccountMail(env, {email, purpose, token, deliveryId}, fetcher = fetch) {
  if (!emailReady(env)) throw new Error('MailNotConfigured');
  const reset = purpose === 'reset', changed = purpose === 'changed';
  const title = changed ? 'Drugslist 密码已重置' : reset ? '重置 Drugslist 登录密码' : '验证 Drugslist 注册邮箱';
  const link = changed ? ACCOUNT_ORIGIN : `${ACCOUNT_ORIGIN}/#${reset ? 'reset' : 'verify'}=${token}`;
  const text = changed
    ? `你的 Drugslist 密码已重置，所有旧登录会话已退出。如果不是你本人操作，请立即在网站使用“忘记密码”重新保护账号。\n${link}`
    : `${title}\n\n请打开以下链接${reset ? '设置新密码' : '并输入注册时设置的密码，确认邮箱属于你'}：\n${link}\n\n链接${reset ? '30分钟' : '24小时'}内有效，只能使用一次。重发后旧链接失效。\n如果不是你本人操作，请忽略这封邮件。请勿转发此链接。`;
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: {Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': deliveryId},
    body: JSON.stringify({from: `Drugslist <${env.MAIL_FROM}>`, to: [email], subject: title, text}),
  });
  // Never log provider response bodies: they can contain recipients or sensitive links.
  if (!response.ok) throw new Error(`MailProviderHTTP${response.status}`);
  const result = await response.json();
  if (typeof result.id !== 'string' || !result.id) throw new Error('MailProviderInvalidResponse');
}
