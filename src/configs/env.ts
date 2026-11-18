// configs/env.ts
/* DB, KV, D1 等存取環境變數設定 */
import { D1Database, KVNamespace } from '@cloudflare/workers-types/experimental'
import type { R2Bucket } from '@cloudflare/workers-types'

type ImageInfo = { format: string; fileSize: number; width: number; height: number }
type ImageTransformOptions = {
  width?: number
  height?: number
  fit?: 'scale-down' | 'contain' | 'pad' | 'squeeze' | 'cover' | 'crop'
  background?: string
}
type ImageDrawOptions = {
  top?: number
  left?: number
  opacity?: number
}
type ImageResult = {
  image(): ReadableStream<Uint8Array>
  contentType(): string
}
type ImageTransformer = {
  transform(options: ImageTransformOptions): ImageTransformer
  draw(image: ReadableStream<Uint8Array> | ImageTransformer, options?: ImageDrawOptions): ImageTransformer
  output(options: { format: 'image/jpeg'; quality?: number }): Promise<ImageResult>
}
type ImagesBinding = {
  info(image: ReadableStream<Uint8Array>): Promise<ImageInfo>
  input(image: ReadableStream<Uint8Array>): ImageTransformer
}

export type Bindings = {
  KV : KVNamespace
  GETMYAPP_KEY: string
  TEST_DASHBOARD: R2Bucket
  /** JSON map of appName to an R2 binding name configured on this Worker. */
  APP_R2_BINDINGS?: string
  IMAGES: ImagesBinding
  IMAGE_WATERMARK_KEY?: string
  IMAGE_WATERMARK_ENABLED?: string
  IMAGE_WATERMARK_SIZE?: string
  IMAGE_WATERMARK_OPACITY?: string
  APP_PHOTO_DIRECTOR?: string
  MAX_CROP_SIZEA?: string
  MAX_CROP_SIZEB?: string
  IMAGE_CROP_THRESHOLD?: string
  // DB: D1Database
  // R2: R2Bucket
  VITE_FAQ_API_URL: string
  VITE_FAQ_API_KEY: string
  VITE_SHARKMKT_TINIFY_AUTHORIZATION: string
  VITE_AI_TRANSLATE_API_URL: string
  VITE_AI_TRANSLATE_API_KEY: string
}

export type Variables = {
  tenantId: string
}
