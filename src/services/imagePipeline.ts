import type { Bindings } from '../configs/env'
import type { R2Bucket } from '@cloudflare/workers-types'

const DEFAULT_MAX_CROP_SIZE = 2048
const DEFAULT_JPEG_QUALITY = 70
const SQUARE_THUMB_SIZES = [500, 300, 200, 100, 50]
const STANDARD_THUMBS = [
  { name: 'thumb_500', width: 500, height: 500 },
  { name: 'thumb_fb_484_252', width: 484, height: 252 },
  { name: 'thumb_300', width: 300, height: 300 },
  { name: 'thumb_200', width: 200, height: 200 },
  { name: 'thumb_150', width: 150, height: 150 },
  { name: 'thumb_100', width: 100, height: 100 },
]

// Categories visible in the legacy PHP S3/R2 uploader. Types 3, 8, and 9
// were processed there but did not have an upload branch in the pasted code.
const CATEGORY_BY_TYPE: Record<number, string> = {
  0: 'blog',
  1: 'product',
  2: 'avatar',
  3: 'banner',
  4: 'edm',
  5: 'news',
  6: 'activity',
  7: 'page',
  8: 'icon',
  9: 'type-9',
}

export type ProcessImageResult = {
  sha1: string
  type: number
  category: string
  files: Array<{ variant: string; key: string }>
}

function streamOf(bytes: ArrayBuffer): ReadableStream<Uint8Array> {
  return new Blob([bytes]).stream()
}

function sha1Hex(bytes: ArrayBuffer): Promise<string> {
  return crypto.subtle.digest('SHA-1', bytes).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
  )
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function variantKey(category: string, name: string, filename: string, folderStyle: boolean): string {
  return folderStyle ? `${category}/${name}/${filename}` : `${category}/${name}_${filename}`
}

async function encodeJpeg(
  bytes: ArrayBuffer,
  env: Bindings,
  quality: number,
  transform?: { width: number; height: number; fit: 'scale-down' | 'cover' | 'pad'; background?: string },
  watermark?: { bytes: ArrayBuffer; width: number; top: number; left?: number; opacity: number },
): Promise<ArrayBuffer> {
  let image = env.IMAGES.input(streamOf(bytes))
  if (transform) image = image.transform(transform)
  if (watermark) {
    const overlay = env.IMAGES.input(streamOf(watermark.bytes)).transform({ width: watermark.width })
    image = image.draw(overlay, {
      top: watermark.top,
      ...(watermark.left === undefined ? {} : { left: watermark.left }),
      opacity: watermark.opacity,
    })
  }
  const result = await image.output({ format: 'image/jpeg', quality })
  return new Response(result.image()).arrayBuffer()
}

async function saveJpeg(bucket: R2Bucket, key: string, bytes: ArrayBuffer, sha1: string, variant: string, type: number) {
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: 'image/jpeg' },
    customMetadata: { sha1, variant, type: String(type) },
  })
}

/**
 * Reproduces the legacy CropImage output variants and stores them in R2.
 * The caller supplies the already-compressed upload; this function does not
 * apply the separate 2 MB compression step.
 */
export async function processAndStoreImage(
  sourceBytes: ArrayBuffer,
  type: number,
  autoBackground: boolean,
  env: Bindings,
  bucket: R2Bucket = env.TEST_DASHBOARD,
): Promise<ProcessImageResult> {
  const category = CATEGORY_BY_TYPE[type]
  if (!category) throw new Error('Unsupported image type. Expected type 0 through 9.')

  const sourceInfo = await env.IMAGES.info(streamOf(sourceBytes))
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(sourceInfo.format)) {
    throw new Error(`Unsupported image format: ${sourceInfo.format}`)
  }

  const sha1 = await sha1Hex(sourceBytes)
  const filename = `${sha1}.jpg`
  const maxWidth = positiveNumber(env.MAX_CROP_SIZEA, DEFAULT_MAX_CROP_SIZE)
  const maxHeight = positiveNumber(env.MAX_CROP_SIZEB, DEFAULT_MAX_CROP_SIZE)
  const quality = Math.min(100, positiveNumber(env.IMAGE_CROP_THRESHOLD, DEFAULT_JPEG_QUALITY))
  const needsHalfSize = sourceInfo.width > maxWidth || sourceInfo.height > maxHeight
  const mainWidth = needsHalfSize ? Math.max(1, Math.round(sourceInfo.width * 0.5)) : sourceInfo.width
  const mainHeight = needsHalfSize ? Math.max(1, Math.round(sourceInfo.height * 0.5)) : sourceInfo.height
  const mainTransform = { width: mainWidth, height: mainHeight, fit: 'scale-down' as const }
  const watermarkEnabled = type === 1 && ['true', '1', 'yes'].includes((env.IMAGE_WATERMARK_ENABLED ?? '').toLowerCase())
  let watermark: { bytes: ArrayBuffer; width: number; opacity: number } | undefined

  if (watermarkEnabled) {
    if (!env.IMAGE_WATERMARK_KEY) throw new Error('IMAGE_WATERMARK_KEY is required when product watermarking is enabled.')
    const watermarkObject = await bucket.get(env.IMAGE_WATERMARK_KEY)
    if (!watermarkObject) throw new Error(`Watermark object not found: ${env.IMAGE_WATERMARK_KEY}`)
    const watermarkBytes = await watermarkObject.arrayBuffer()
    const defaultWatermarkWidth = Math.round(mainWidth * 0.4)
    const configuredOpacity = Number(env.IMAGE_WATERMARK_OPACITY ?? '30')
    const opacityPercent = Number.isFinite(configuredOpacity)
      ? Math.min(100, Math.max(0, configuredOpacity))
      : 30
    watermark = {
      bytes: watermarkBytes,
      width: positiveNumber(env.IMAGE_WATERMARK_SIZE, defaultWatermarkWidth),
      opacity: opacityPercent / 100,
    }
  }

  const files: ProcessImageResult['files'] = []
  const uploadedKeys: string[] = []
  const folderStyle = ['true', '1', 'yes'].includes((env.APP_PHOTO_DIRECTOR ?? '').toLowerCase())
  const categoryKey = `${category}/${filename}`

  const putVariant = async (variant: string, key: string, bytes: ArrayBuffer) => {
    await saveJpeg(bucket, key, bytes, sha1, variant, type)
    uploadedKeys.push(key)
    files.push({ variant, key })
  }

  try {
    // Keep an unwatermarked working copy for square variants. The PHP worker
    // watermarked the regular and square sources separately.
    const baseBytes = await encodeJpeg(sourceBytes, env, quality, mainTransform)
    const mainBytes = watermark
      ? await encodeJpeg(baseBytes, env, quality, undefined, { ...watermark, top: 50, left: 0 })
      : baseBytes
    await putVariant('original', categoryKey, mainBytes)

    const squareFit = type === 2 || !autoBackground ? 'cover' : 'pad'

    for (const size of SQUARE_THUMB_SIZES) {
      const squareWatermark = watermark ? { ...watermark, top: 0 } : undefined
      const bytes = await encodeJpeg(
        baseBytes,
        env,
        quality,
        {
          width: size,
          height: size,
          fit: squareFit,
          ...(squareFit === 'pad' ? { background: '#ffffff' } : {}),
        },
        squareWatermark,
      )
      const name = `thumb_${size}square`
      await putVariant(name, variantKey(category, name, filename, folderStyle), bytes)
    }

    // The legacy worker skipped non-square thumbnail variants for type 3.
    if (type !== 3) {
      for (const thumb of STANDARD_THUMBS) {
        const bytes = await encodeJpeg(
          mainBytes,
          env,
          quality,
          { width: thumb.width, height: thumb.height, fit: 'scale-down' },
        )
        await putVariant(thumb.name, variantKey(category, thumb.name, filename, folderStyle), bytes)
      }
    }

    return { sha1, type, category, files }
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => bucket.delete(key).catch(() => undefined)))
    throw error
  }
}
