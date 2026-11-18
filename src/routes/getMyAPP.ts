// routes/getMyAPP.ts

import { Hono } from 'hono'
import { InitializeTenant } from '../services/initializeTenant'
import { Bindings, Variables } from '../configs/env'

const router = new Hono<{ Bindings: Bindings, Variables: Variables }>()  // ← 注意是 router 不是 app
router.get('kv/getMyApp/:id', async (c) => {
  try {
    const tenantId = c.req.param('id')
    const service = new InitializeTenant(c.env.KV)
    const config = await service.getConfig(tenantId, c.env as any) 

    // Worker 自己用（call 第三方 API 時）
    // config.credentials.token 直接取用
    // 給前端的部分：敏感資訊不要全傳
    return c.json(config)

  } catch (error) {
    console.error(error)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

export default router