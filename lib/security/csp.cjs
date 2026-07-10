function toHttpsSource(hostname) {
  const normalized = hostname?.trim().toLowerCase();
  if (!normalized) return null;
  if (!/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?::\d{1,5})?$/.test(normalized)) {
    return null;
  }
  return `https://${normalized}`;
}

function buildStorefrontContentSecurityPolicy({
  isDevelopment = false,
  r2PublicHostname
} = {}) {
  const customR2Source = toHttpsSource(r2PublicHostname);
  const imageSources = ["'self'", "data:", "blob:", "https://images.unsplash.com", "https://*.r2.dev"];
  if (customR2Source && !imageSources.includes(customR2Source)) imageSources.push(customR2Source);

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
    "font-src 'self' data:",
    `connect-src 'self' https://challenges.cloudflare.com${isDevelopment ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ];

  if (!isDevelopment) directives.push("upgrade-insecure-requests");
  return `${directives.join("; ")};`;
}

module.exports = { buildStorefrontContentSecurityPolicy };
