import { Hono } from 'hono'
import type { Bindings, Variables } from '../configs/env'
import { processAndStoreImage } from '../services/imagePipeline'

const router = new Hono<{ Bindings: Bindings, Variables: Variables }>()

router.get('/image-process-test.html', (c) => c.html(`<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>圖片裁切與 R2 上傳測試</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:36px 16px;background:#f4f6fb;color:#172033;font:16px system-ui,sans-serif}main{max-width:760px;margin:auto}section{padding:22px;background:white;border:1px solid #e1e6ef;border-radius:14px}label{display:block;margin:12px 0 6px}input,select{font:inherit;padding:9px;border:1px solid #c8d0dc;border-radius:7px}button{margin-top:18px;padding:11px 17px;border:0;border-radius:8px;background:#3158d8;color:white;font:inherit;cursor:pointer}button:disabled{opacity:.5}pre{overflow:auto;padding:14px;border-radius:8px;background:#101828;color:#e5e9f2;white-space:pre-wrap;overflow-wrap:anywhere}.row{margin:14px 0}#status.error{color:#b42318}
</style></head><body><main><h1>圖片裁切與 R2 上傳測試</h1><p>選擇已完成 2 MB 壓縮的圖片，輸出會依舊 PHP 的變體規則寫入 R2。</p><section>
<label for="image">圖片</label><input id="image" type="file" accept="image/jpeg,image/png,image/webp">
<label for="type">用途 type（0–9）</label><select id="type"><option value="0">0 — blog</option><option value="1">1 — product</option><option value="2">2 — avatar</option><option value="3">3 — legacy type 3</option><option value="4">4 — edm</option><option value="5">5 — news</option><option value="6">6 — activity</option><option value="7">7 — page</option><option value="8">8 — legacy type 8</option><option value="9">9 — legacy type 9</option></select>
<div class="row"><label><input id="background" type="checkbox"> 非 avatar 類圖片在正方形縮圖使用白底補齊</label></div>
<button id="upload" disabled>處理並上傳 R2</button><p id="status" role="status"></p><pre id="result" hidden></pre></section></main>
<script>
const file=document.querySelector('#image'),button=document.querySelector('#upload'),status=document.querySelector('#status'),result=document.querySelector('#result');file.addEventListener('change',()=>{button.disabled=!file.files[0]});button.addEventListener('click',async()=>{if(!file.files[0])return;button.disabled=true;status.className='';status.textContent='處理圖片並上傳各版本中…';result.hidden=true;try{const query=new URLSearchParams({type:document.querySelector('#type').value,auto_background:String(document.querySelector('#background').checked)});const response=await fetch('/api/images/process?'+query,{method:'POST',headers:{'Content-Type':file.files[0].type},body:file.files[0]});const data=await response.json();result.textContent=JSON.stringify(data,null,2);result.hidden=false;if(!response.ok)throw new Error(data.error||'HTTP '+response.status);status.textContent='完成，已上傳 '+data.files.length+' 個 R2 物件。SHA-1: '+data.sha1}catch(error){status.className='error';status.textContent=error.message||'處理失敗'}finally{button.disabled=false}})
</script></body></html>`))

router.post('/api/images/process', async (c) => {
  const typeParam = c.req.query('type')
  const type = Number(typeParam)
  if (!typeParam || !/^\d+$/.test(typeParam) || !Number.isInteger(type) || type < 0 || type > 9) {
    return c.json({ error: 'Query parameter "type" must be an integer from 0 to 9.' }, 400)
  }

  const autoBackgroundParam = c.req.query('auto_background')
  const autoBackground = autoBackgroundParam === 'true' || autoBackgroundParam === '1'
  const bytes = await c.req.arrayBuffer()
  if (bytes.byteLength === 0) return c.json({ error: 'Image body is empty.' }, 400)
  if (bytes.byteLength > 20 * 1024 * 1024) {
    return c.json({ error: 'Image exceeds the 20 MB Cloudflare Images input limit.' }, 413)
  }

  try {
    const result = await processAndStoreImage(bytes, type, autoBackground, c.env)
    return c.json(result)
  } catch (error) {
    console.error('Image processing/upload failed:', error)
    const message = error instanceof Error ? error.message : 'Image processing failed.'
    const status = message.startsWith('Unsupported image') ? 415 : 500
    return c.json({ error: message }, status)
  }
})

export default router
