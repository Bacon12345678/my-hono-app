/* 目前還沒用到 */

import { KVNamespace } from "@cloudflare/workers-types";
import { sha256 } from "../utils/sha256";

const CONFIG = {
  APP_NAME: 'sharkmkt',
  BASE_URL: (appName: string) => `https://api-${appName}.sharkcdn.io`,
  TTL: 3600 
};

async function getCacheKey(endpoint: string, tenant: string): Promise<string> {
  // 將 tenant 加入 hash key 才能區分不同租戶的快取
  return await sha256(`${tenant}${endpoint}`);
}

export const EnvAPI = {
  endpoint: `/api/v1/environment/getMYAPP`,

  // 1. 從遠端抓取 (Origin)
  async getFromOrigin(tenant: string, myKey: string) {
    const url = `https://api-sharkmkt.sharkcdn.io/api/v1/environment/getMYAPP`;
    const headers = new Headers();
    headers.set('User-Agent', `Cloudflare-Workers-Custom/${myKey}`);
    const res = await fetch(url, { headers });
    return await res.json();
  },

  // 2. Hono 路由呼叫的進入點
  async get(c: any) {
    const kv = c.env.SHARKTECH_DASHBOARD; 
    const tenant = c.req.query('tenant') || 'sharkmkt'; // 預設租戶名稱
    
    const key = await getCacheKey(this.endpoint, tenant);
    // await kv.put(key, JSON.stringify(data), { expirationTtl: CONFIG.TTL });
    // // // 注意：呼叫同物件內的 function 要加 this

    
    let value = await kv.get(key);
    
    // if (!value) {
    //   await this.update(c);
    //   value = await kv.get(key);
    // }

    // // 修正點：這裡必須用 this.getFromOrigin
    // const data = await this.getFromOrigin(tenant);
    
    // await kv.put(key, JSON.stringify(data), { expirationTtl: CONFIG.TTL });
    return value;
  },

  // 3. 更新邏輯
  async update(c: any) {

    const updatedData = await this.getFromOrigin('sharkmkt', c.env.GETMYAPP_KEY);

    const kv = c.env.SHARKTECH_DASHBOARD;
    const tenant = c.req.query('sharkmkt') || '';
   
    const key = await getCacheKey(this.endpoint, tenant);


    const res = await kv.put(key, JSON.stringify(updatedData), { expirationTtl: CONFIG.TTL });
    
    return updatedData;
  },
};
