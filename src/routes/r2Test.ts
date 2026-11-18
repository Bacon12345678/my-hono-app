import { Hono } from 'hono'
import type { Bindings, Variables } from '../configs/env'

const router = new Hono<{ Bindings: Bindings, Variables: Variables }>()

router.get('/r2-test.html', (c) => c.html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Online R2 image browser</title><style>
*{box-sizing:border-box}body{margin:0;padding:28px 18px;background:#f3f5f9;color:#172033;font:15px system-ui,sans-serif}main{max-width:1200px;margin:auto}header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px}.muted{color:#667085}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px}.card{overflow:hidden;background:#fff;border:1px solid #e1e6ef;border-radius:12px}.preview{height:190px;display:grid;place-items:center;background:#eee}.preview img{max-width:100%;max-height:190px;object-fit:contain}.info{padding:12px}.key{overflow-wrap:anywhere;font-size:12px}.size{margin-top:7px;color:#667085;font-size:12px}button{padding:9px 13px;border:0;border-radius:7px;background:#3158d8;color:white;font:inherit;cursor:pointer}button:disabled{opacity:.5}#status{margin:12px 0;color:#475467}#more{display:block;margin:22px auto}.empty{padding:36px;text-align:center;background:#fff;border-radius:12px;color:#667085}
</style></head><body><main><header><div><h1>Online R2 image browser</h1><div class="muted">Live Cloudflare R2 bucket: test-dashboard</div></div><button id="refresh">Refresh</button></header><div id="status" role="status"></div><div id="grid" class="grid"></div><div id="empty" class="empty" hidden>No images found in this bucket.</div><button id="more" hidden>Load more</button></main>
<script>
const grid=document.querySelector('#grid');
const status=document.querySelector('#status');
const empty=document.querySelector('#empty');
const more=document.querySelector('#more');
let cursor='';
function formatSize(bytes){return bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(1)+' KB':(bytes/1048576).toFixed(2)+' MB'}
async function load(reset=false){
  if(reset){cursor='';grid.replaceChildren();empty.hidden=true}
  status.textContent='Loading Cloudflare R2';more.disabled=true;
  try{
    const url='/api/r2-test/objects'+(cursor?'?cursor='+encodeURIComponent(cursor):'');
    const response=await fetch(url);const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Failed to load objects');
    for(const item of data.objects){
      const imageType=String(item.contentType||'').toLowerCase().startsWith('image/');
      const extension=String(item.key).split('.').pop().toLowerCase();
      if(!imageType&&!['avif','gif','jpg','jpeg','png','svg','webp'].includes(extension))continue;
      const card=document.createElement('article');card.className='card';
      const preview=document.createElement('div');preview.className='preview';
      const img=document.createElement('img');img.loading='lazy';img.alt=item.key;
      img.src='/api/r2-test/object?key='+encodeURIComponent(item.key);
      img.onerror=()=>{preview.textContent='Image preview failed'};preview.append(img);
      const info=document.createElement('div');info.className='info';
      const key=document.createElement('div');key.className='key';key.textContent=item.key;
      const size=document.createElement('div');size.className='size';size.textContent=formatSize(item.size);
      info.append(key,size);card.append(preview,info);grid.append(card);
    }
    cursor=data.cursor||'';more.hidden=!data.truncated;more.disabled=false;
    status.textContent=grid.children.length+' images';empty.hidden=grid.children.length!==0;
  }catch(error){status.textContent=error instanceof Error?error.message:'Failed to load objects';more.disabled=false}
}
document.querySelector('#refresh').addEventListener('click',()=>load(true));
more.addEventListener('click',()=>load());
load(true);
</script></body></html>`))

router.get('/api/r2-test/objects', async (c) => {
  const cursor = c.req.query('cursor')
  const result = await c.env.TEST_DASHBOARD.list({
    limit: 1000,
    include: ['httpMetadata'],
    ...(cursor ? { cursor } : {}),
  })
  return c.json({
    objects: result.objects.map((object) => ({
      key: object.key,
      size: object.size,
      contentType: object.httpMetadata?.contentType ?? '',
    })),
    truncated: result.truncated,
    cursor: result.truncated ? result.cursor : null,
  })
})

router.get('/api/r2-test/object', async (c) => {
  const key = c.req.query('key')
  if (!key) return c.text('Missing object key', 400)
  const object = await c.env.TEST_DASHBOARD.get(key)
  if (!object) return c.text('Object not found', 404)
  return c.body(object.body, 200, {
    'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
})

export default router
