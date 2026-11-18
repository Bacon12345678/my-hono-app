import { Hono } from 'hono'
import { Bindings, Variables } from '../configs/env'

const router = new Hono<{ Bindings: Bindings, Variables: Variables }>()

router.get('/tinify-test.html', (c) => c.html(`<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tinify 圖片測試</title>
  <style>
    * { box-sizing: border-box }
    body { margin: 0; padding: 36px 16px; background: #f4f6fb; color: #172033; font: 16px system-ui, sans-serif }
    main { max-width: 740px; margin: auto }
    h1 { margin: 0 0 8px; font-size: 28px }
    p { color: #586174 }
    section { padding: 22px; background: white; border: 1px solid #e1e6ef; border-radius: 14px }
    label { display: grid; place-items: center; min-height: 170px; padding: 20px; border: 2px dashed #b9c4d6; border-radius: 10px; text-align: center; cursor: pointer }
    label.over, label:hover { border-color: #4263eb; background: #f5f7ff }
    input { display: none }
    button { margin-top: 18px; padding: 11px 17px; border: 0; border-radius: 8px; background: #3158d8; color: white; font: inherit; cursor: pointer }
    button:disabled { opacity: .5; cursor: wait }
    #preview, #result-image { display: block; max-width: 100%; max-height: 220px; margin-top: 16px; border-radius: 8px }
    pre { overflow: auto; max-height: 320px; padding: 14px; border-radius: 8px; background: #101828; color: #e5e9f2; white-space: pre-wrap; overflow-wrap: anywhere }
    #message.error { color: #b42318 }
  </style>
</head>
<body>
  <main>
    <h1>Tinify 圖片測試</h1>
    <p>選擇或拖放 PNG、JPEG、WebP 圖片，上傳至 Tinify 測試 API。API 回應會儲存到 R2。</p>
    <section>
      <label id="drop" for="file"><span><strong>拖放圖片到這裡</strong><br>或點擊選取圖片</span></label>
      <input id="file" type="file" accept="image/png,image/jpeg,image/webp">
      <p id="file-info"></p>
      <img id="preview" alt="上傳圖片預覽" hidden>
      <button id="send" type="button" disabled>上傳並測試</button>
      <p id="message" role="status"></p>
      <div id="result" hidden>
        <h2>API 回應</h2>
        <a id="output-link" target="_blank" rel="noreferrer" hidden>開啟壓縮後圖片</a>
        <img id="result-image" alt="壓縮後圖片預覽" hidden>
        <pre id="response"></pre>
      </div>
    </section>
  </main>
  <script>
    const input = document.querySelector('#file')
    const drop = document.querySelector('#drop')
    const send = document.querySelector('#send')
    const message = document.querySelector('#message')
    let selected
    let previewUrl
    function choose(file) {
      if (!file) return
      if (!file.type.startsWith('image/')) {
        message.textContent = '請選擇圖片檔案。'
        message.className = 'error'
        return
      }
      selected = file
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      previewUrl = URL.createObjectURL(file)
      document.querySelector('#preview').src = previewUrl
      document.querySelector('#preview').hidden = false
      document.querySelector('#file-info').textContent = file.name + ' · ' + (file.size / 1024).toFixed(1) + ' KB · ' + file.type
      document.querySelector('#result').hidden = true
      message.textContent = ''
      message.className = ''
      send.disabled = false
    }
    input.addEventListener('change', () => choose(input.files[0]))
    drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('over') })
    drop.addEventListener('dragleave', () => drop.classList.remove('over'))
    drop.addEventListener('drop', (event) => { event.preventDefault(); drop.classList.remove('over'); choose(event.dataTransfer.files[0]) })
    send.addEventListener('click', async () => {
      if (!selected) return
      send.disabled = true
      message.textContent = '上傳並等待 Tinify 回應中…'
      message.className = ''
      try {
        const res = await fetch('/api/tinify/shrink/test', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: selected })
        const text = await res.text()
        let data
        try { data = JSON.parse(text) } catch { data = text }
        document.querySelector('#response').textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
        document.querySelector('#result').hidden = false
        const outputUrl = data && typeof data === 'object' ? data.output?.url : null
        const link = document.querySelector('#output-link')
        const image = document.querySelector('#result-image')
        link.hidden = !outputUrl
        image.hidden = !outputUrl
        if (outputUrl) { link.href = outputUrl; image.src = outputUrl }
        if (!res.ok) throw new Error('Tinify 回傳 HTTP ' + res.status)
        message.textContent = '完成（HTTP ' + res.status + '）。回應已存入 R2 的 tinify-test/ 路徑。'
      } catch (error) {
        message.textContent = error.message || '上傳失敗，請稍後再試。'
        message.className = 'error'
      } finally { send.disabled = false }
    })
  </script>
</body>
</html>`))

// Test endpoint: proxy the Tinify response, save its body to R2, then return it.
router.post('/api/tinify/shrink/test', async (c) => {
  try {
    const body = await c.req.arrayBuffer()

    const tinifyRes = await fetch('https://api.tinify.com/shrink', {
      method: 'POST',
      headers: {
        Authorization: c.env.VITE_SHARKMKT_TINIFY_AUTHORIZATION,
        'Content-Type': 'application/octet-stream',
      },
      body,
    })

    const responseBody = await tinifyRes.text()
    const contentType = tinifyRes.headers.get('content-type') || 'application/json'
    const objectKey = `tinify-test/${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`

    await c.env.TEST_DASHBOARD.put(objectKey, responseBody, {
      httpMetadata: { contentType },
      customMetadata: {
        upstreamStatus: String(tinifyRes.status),
      },
    })

    return new Response(responseBody, {
      status: tinifyRes.status,
      headers: { 'content-type': contentType },
    })
  } catch (error) {
    console.error('Tinify test proxy error:', error)
    return c.json({ message: 'Tinify test proxy error' }, 500)
  }
})

export default router
