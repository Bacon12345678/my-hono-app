// services/initializeTenant.ts
/*
  此檔案負責讀取/建立KV的getMYAPP設定。
*/
export interface Env {
  "GETMYAPP_KEY" : string; // 這裡的名字要跟你在 Secret Store 設定的一模一樣
}

import { KVNamespace } from '@cloudflare/workers-types/experimental'

//　初始租戶getMYAPP設定
export class InitializeTenant {
  constructor(private kv: KVNamespace) {}

  // 初始化設定GetMYAPP環境的private KV key，並呼叫初始化DB Endpoint
  private async buildKVKey(tenantId: string): Promise<string> {
    const KVkey = `${tenantId}:getMYAPP`;
    return KVkey;
  }

  // 初始化 private DB Endpoint
  private buildEndpoint(tenantId: string): string {
    return `https://api-${tenantId}.sharkcdn.io/api/v1/environment/getMYAPP`;
  }

  // 取得KV getMYAPP, 無資料則建立
  async getConfig(tenantId: string, env: Env): Promise<any> {

    // 0. 建立 kv key
    const cacheKey = await this.buildKVKey(tenantId);

    // 1. 先查 KV 快取
    const cached = await this.kv.get<any>(cacheKey, { type: 'json' })

    if (cached) return cached
 
    // 2. 從 DB 抓 getMYAPP
    const config = await this.buildConfig(tenantId, env)

    // 3. 存回 KV
    await this.kv.put(cacheKey, JSON.stringify(config))

    return config
  }

  // 未來要將api (dbEndpoint)系統化管理，先暫時寫死
  // const [originData, thirdPartyData] = await Promise.all([
  //   EnvAPI.getFromOrigin(dbEndpoint),
  // ])

  // 從DB抓getMYAPP，並回傳完整any
  private async buildConfig(tenantId: string, env: Env): Promise<any> {

    const endpoint = this.buildEndpoint(tenantId);

    const myKey = env.GETMYAPP_KEY;

    // 建立一個 Headers 物件來管理標頭
    const headers = new Headers();
    
    // Cloudflare Workers 允許你在發出請求前，先建立預設的 User-Agent 
    // 或者你可以帶入空字串，Worker 會自動帶入預設值
    // 這裡我們直接自定義，並把 Key 串在後面：
    headers.set('User-Agent', `Cloudflare-Workers-Custom/${myKey}`);

    console.log('Finished setting header')

    try {
      const res = await fetch(endpoint,{
        method: 'GET',
        headers: headers
      });

      if (res.status !== 200) {
        throw new Error(`Failed to fetch getMYAPP for tenant ${tenantId}: ${res.status} ${res.statusText}`);
      }

      const rawText = await res.text(); // 先拿原始文字
  
      console.log("[Debug] Raw Text from server:", rawText);
      
      // 手動解析，這行會噴錯，但至少你上面看得到 rawText 長怎樣
      return JSON.parse(rawText);
    } catch (err) {
      console.error(`Failed to fetch getMYAPP for tenant ${tenantId}:`, err);
      throw new Error('Failed to build tenant config');
    }
  }

  // 未來 Phase 2：強制刷新快取
  async invalidateCache(tenantId: string) {
    const cacheKey = await this.buildKVKey(tenantId);
    await this.kv.delete(cacheKey)
  }
}


if (import.meta.main) {
  console.log('This module is meant to be imported, not run directly.')
} else {
  
}