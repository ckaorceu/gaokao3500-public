// Supabase 前端配置 —— 部署前请替换 SUPABASE_ANON_KEY
// 安全红线：service_role 密钥（sb_secret_...）绝不可出现在此文件或任何前端代码里，
// 它绕过 RLS，一旦下发等于裸库。前端只使用 anon / publishable key。
window.APP_CONFIG = {
  SUPABASE_URL: 'https://bkuvirojzuetweondgrx.supabase.co',
  // 已填入 publishable / anon key（受 RLS 保护，可公开）。service_role 密钥不在此处。
  SUPABASE_ANON_KEY: 'sb_publishable_WfXxsJWCh5i8zQgnrYgrEg_qXo6_KRP'
};

// Cloudflare Turnstile（人机验证）：占位 sitekey 时前端自动跳过验证（渐进式上线）。
// 已接入真实 Site Key；Secret Key 配置在 Supabase 后台（Auth → Providers → CAPTCHA），
// 由 Supabase 服务端校验，前端只传 Turnstile token，无需自建 Worker。
window.CF_TURNSTILE_SITEKEY = '0x4AAAAAAEEPzgDpkGl6Id-l';
