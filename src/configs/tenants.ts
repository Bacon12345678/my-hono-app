// types/tenant.ts
/* 定義租戶設定的結構，對應從 getMYAPP 取得的資料，
   並新增 [起用功能], [權限管理] 等欄位以利後續擴充。
   ※ 只供參考，無法存數值進去
*/

export interface TenantConfig {
  app_local: null,
  app_name: null,
  endpoint: null,
  blog_endpoint: null,
  cdn_endpoint: null,
  api_endpoint: null,
  image_endpoint: {
    avatar: null,
    blog: null,
    product: null,
    icon: null,
    edm: null,
    news: null,
    activity: null,
    pages: null,
    banner: null,
    course: null
  },
  features: {
    FAQ : true,
    FAQ_AI : false,
    EDM : false,
    BLOG : true,
    PRODUCT : false,
    CUSTOM_BLOG : false,
    BANNER : false,
  },
  ui: { theme: 'default'},
  env: 'production',
}