/** 從 Host 解析 tenant；開發時允許 ?__tenant 覆寫 */
export function resolveTenant(c): string | null {
  const url = new URL(c.req.url)

  const host = c.req.header('host') || url.hostname

  const m = host.match(/^dashboard-([a-z0-9-_]+)\.sharkcdn\.io$/i)

  return sanitizeTenant(m?.[1] ?? null)
  
  // 2) Host 解析：dashboard-<tenant>.sharkcdn.io
  const host = req.headers.get("host") || url.hostname;
  const m = host.match(/^dashboard-([a-z0-9-_]+)\.sharkcdn\.io$/i);
  return sanitizeTenant(m?.[1] ?? null);
}

function sanitizeTenant(t: string | null | undefined): string | null {
  if (!t) return null;
  const s = t.toLowerCase().replace(/[^a-z0-9-_]/g, "");
  return s || null;
}

