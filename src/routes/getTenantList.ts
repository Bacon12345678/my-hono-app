// routes/getTenantList.ts

import { Hono } from 'hono'
import { Bindings, Variables } from '../configs/env'

const router = new Hono<{ Bindings: Bindings, Variables: Variables }>()

router.get('/kv/tenantList', async (c) => {
  try {
    const raw = await c.env.KV.get('tenant_list')
    if (!raw) return c.json({ tenants: [] })

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = raw
    }

    return c.json({ tenants: parsed })
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

export default router