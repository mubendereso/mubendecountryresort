export function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("Missing DATABASE_URL.");
  return value;
}

const DEFAULT_SITE_ORIGIN = "https://mubendecountryresort.mubendecountryresort.workers.dev";

/**
 * The canonical public origin of the storefront (scheme + host, no trailing
 * slash). MCR-SEC-08: payment callback/IPN URLs and metadata routes must be
 * derived from this pinned value, NOT from the request `Host` header, which a
 * client can forge to register attacker-controlled URLs with Pesapal.
 */
export function getSiteOrigin(): string {
  const value = process.env.SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (value || DEFAULT_SITE_ORIGIN).replace(/\/+$/, "");
}
