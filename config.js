// Supabase 前端配置 —— 部署前请替换 SUPABASE_ANON_KEY
// 安全红线：service_role 密钥（sb_secret_...）绝不可出现在此文件或任何前端代码里，
// 它绕过 RLS，一旦下发等于裸库。前端只使用 anon / publishable key。
window.APP_CONFIG = {
  SUPABASE_URL: 'https://bkuvirojzuetweondgrx.supabase.co',
  // 已填入 publishable / anon key（受 RLS 保护，可公开）。service_role 密钥不在此处。
  SUPABASE_ANON_KEY: '这里填你的Supabase key'
};
