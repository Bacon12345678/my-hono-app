```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

## Tenant image upload

The Worker accepts `POST /api/images/upload` as `multipart/form-data` with
`image`, `appName`, `photoType`, `remark`, and optional `displayName` and
`categoryIds[]` fields. The forwarded form includes the original image's
`width` and `height`. `displayName` defaults to the SHA-1 filename of the bytes
sent for upload (for example, `389c8a672cb1fabaadf5f74703929eb24329e2c7.jpg`).
For images compressed by Tinify, it uses the compressed image's filename.
For tenant buckets, add each bucket as an R2 binding in `wrangler.jsonc` and
map the tenant name to that binding in `APP_R2_BINDINGS`. For example:

```jsonc
{
  "r2_buckets": [
    { "binding": "R2_SHOP_A", "bucket_name": "shop-a-images" },
    { "binding": "R2_SHOP_B", "bucket_name": "shop-b-images" }
  ],
  "vars": {
    "APP_R2_BINDINGS": "{\"shop-a\":\"R2_SHOP_A\",\"shop-b\":\"R2_SHOP_B\"}"
  }
}
```

For R2 tenants, `photoType` can be one of `blog`, `product`, `avatar`, `banner`,
`icon`, `edm`, `news`, `activity`, `page`, or a numeric processing type from 0 to 9. A separate
`processType` field can be sent when the API's `photoType` value is not one of
those processing names. `auto_background` is optional.

The Worker compresses files larger than 2 MiB, stores generated variants in the
tenant bucket, and calls that tenant's `api/v1/photo/creat` endpoint. Tenants
without an R2 mapping use `getPhotoFromUrl` for Tinify-compressed images; smaller
files continue through the existing `api/v1/photo` file upload endpoint because
they do not have a Tinify URL.

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```


```KV key
[tenant]:[category/getMYAPP/tag]
