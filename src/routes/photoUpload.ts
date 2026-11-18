import { Hono } from 'hono'
import type { R2Bucket } from '@cloudflare/workers-types'
import type { Bindings, Variables } from '../configs/env'
import { processAndStoreImage } from '../services/imagePipeline'

const router = new Hono<{ Bindings: Bindings; Variables: Variables }>()
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const PROCESS_TYPE_BY_NAME: Record<string, number> = {
  blog: 0,
  product: 1,
  avatar: 2,
  banner: 3,
  icon: 8,
  edm: 4,
  news: 5,
  activity: 6,
  page: 7,
  pages: 7,
}

function parseR2Map(raw?: string): Record<string, string> {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter(([appName, binding]) =>
        /^[a-z0-9-]+$/i.test(appName) && typeof binding === 'string' && /^[A-Z][A-Z0-9_]*$/.test(binding),
      ),
    )
  } catch {
    return {}
  }
}

function getProcessType(photoType: string, suppliedType: string | null): number | null {
  const value = suppliedType ?? ( /^\d+$/.test(photoType) ? photoType : String(PROCESS_TYPE_BY_NAME[photoType.toLowerCase()] ?? '') )
  const type = Number(value)
  return Number.isInteger(type) && type >= 0 && type <= 9 ? type : null
}

function appendMetadata(
  form: FormData,
  fields: FormData,
  photoType: string,
  displayName: string,
  width: number,
  height: number,
) {
  form.append('remark', String(fields.get('remark') ?? ''))
  form.append('photoType', photoType)
  form.append('displayName', displayName)
  form.append('width', String(width))
  form.append('height', String(height))
  for (const value of fields.getAll('categoryIds[]')) {
    if (typeof value === 'string' && value) form.append('categoryIds[]', value)
  }
}

async function getImageFilename(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', bytes)
  const sha1 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${sha1}.jpg`
}

async function shrinkWithTinify(bytes: ArrayBuffer, env: Bindings): Promise<{ bytes: ArrayBuffer; url: string }> {
  const response = await fetch('https://api.tinify.com/shrink', {
    method: 'POST',
    headers: {
      Authorization: env.VITE_SHARKMKT_TINIFY_AUTHORIZATION,
      'Content-Type': 'application/octet-stream',
    },
    body: bytes,
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Tinify compression failed (${response.status}): ${detail.slice(0, 300)}`)
  }
  const result = await response.json() as { output?: { url?: string } }
  if (!result.output?.url) throw new Error('Tinify did not return an output URL.')

  const compressedResponse = await fetch(result.output.url)
  if (!compressedResponse.ok) throw new Error('Could not download the compressed image from Tinify.')
  return { bytes: await compressedResponse.arrayBuffer(), url: result.output.url }
}

/** Receives the browser's upload, processes it, then forwards it to the tenant photo API. */
router.post('/api/images/upload', async (c) => {
  const form = await c.req.formData()
  const image = form.get('image')
  const appName = String(form.get('appName') ?? '').trim().toLowerCase()
  const photoType = String(form.get('photoType') ?? '').trim()
  const displayName = String(form.get('displayName') ?? '').trim()

  if (!(image instanceof File) || !image.type.startsWith('image/')) {
    return c.json({ error: 'An image file is required in the "image" field.' }, 400)
  }
  if (!/^[a-z0-9-]{1,63}$/.test(appName)) return c.json({ error: 'A valid appName is required.' }, 400)
  if (!photoType) return c.json({ error: 'photoType is required.' }, 400)
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
    return c.json({ error: 'Only JPEG, PNG, and WebP images are supported.' }, 415)
  }

  const imageBytes = await image.arrayBuffer()
  const r2BindingName = parseR2Map(c.env.APP_R2_BINDINGS)[appName]
  const r2Bucket = r2BindingName
    ? (c.env as unknown as Record<string, unknown>)[r2BindingName] as R2Bucket | undefined
    : undefined
  if (r2BindingName && (!r2Bucket || typeof r2Bucket.put !== 'function')) {
    return c.json({ error: `R2 binding "${r2BindingName}" is configured for ${appName}, but is not bound to this Worker.` }, 500)
  }

  let uploadBytes = imageBytes
  let compressedUrl: string | undefined
  try {
    const originalImageInfo = await c.env.IMAGES.info(new Blob([imageBytes]).stream())

    if (imageBytes.byteLength > 2 * 1024 * 1024) {
      const compressed = await shrinkWithTinify(imageBytes, c.env)
      uploadBytes = compressed.bytes
      compressedUrl = compressed.url
    }

    const uploadImageFilename = await getImageFilename(uploadBytes)
    const uploadDisplayName = compressedUrl ? uploadImageFilename : displayName || uploadImageFilename
    const upstreamForm = new FormData()
    appendMetadata(
      upstreamForm,
      form,
      photoType,
      uploadDisplayName,
      originalImageInfo.width,
      originalImageInfo.height,
    )
    if (r2Bucket) {
      if (uploadBytes.byteLength > MAX_IMAGE_BYTES) {
        return c.json({ error: 'Image exceeds the 20 MB Cloudflare Images input limit after compression.' }, 413)
      }
      const processType = getProcessType(photoType, form.get('processType')?.toString() ?? null)
      if (processType === null) {
        return c.json({ error: 'For R2 uploads, photoType must map to a supported process type (0–9), or provide processType.' }, 400)
      }
      const autoBackground = ['true', '1'].includes(String(form.get('auto_background') ?? '').toLowerCase())
      await processAndStoreImage(uploadBytes, processType, autoBackground, c.env, r2Bucket)
      // Keep the compressed source URL field when present; generated variants are already in this tenant's R2 bucket.
      if (compressedUrl) upstreamForm.append('url', compressedUrl)
    } else if (compressedUrl) {
      upstreamForm.append('url', compressedUrl)
    } else {
      // The legacy URL endpoint cannot accept a local file URL. Preserve the existing file upload behavior for small files.
      upstreamForm.append('image', new File([imageBytes], image.name, { type: image.type }))
    }

    const endpoint = r2Bucket
      ? `https://api-${appName}.sharkcdn.io/api/v1/photo/create`
      : compressedUrl
        ? `https://api-${appName}.sharkcdn.io/api/v1/photo/getPhotoFromUrl`
        : `https://api-${appName}.sharkcdn.io/api/v1/photo`
    const headers = new Headers()
    headers.set('User-Agent', `Cloudflare-Workers-Custom/${c.env.GETMYAPP_KEY}`)
    const authorization = c.req.header('authorization')
    if (authorization) headers.set('Authorization', authorization)

    const upstream = await fetch(endpoint, { method: 'POST', headers, body: upstreamForm })
    const body = await upstream.text()
    if (!upstream.ok) {
      console.error('Tenant photo upload failed:', {
        endpoint,
        status: upstream.status,
        statusText: upstream.statusText,
        cfRay: upstream.headers.get('CF-Ray'),
        responseBody: body.slice(0, 8000),
      })
    }
    return new Response(body, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
    })
  } catch (error) {
    console.error('Tenant image upload failed:', error)
    const message = error instanceof Error ? error.message : 'Image upload failed.'
    return c.json({ error: message }, 500)
  }
})

export default router
