import "server-only";

import { getSql } from "@/lib/db/client";

/**
 * Resolve the caller's IP for rate-limit keying.
 *
 * Cloudflare injects `cf-connecting-ip` and strips any client-supplied copy,
 * so it is the trustworthy source on this stack. The `x-*` fallbacks only
 * matter for `next dev` / non-CF contexts and must NOT be trusted in prod —
 * on Workers `cf-connecting-ip` is always present.
 */
export function getClientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) {
    return cf.trim();
  }

  const real = headers.get("x-real-ip");
  if (real) {
    return real.trim();
  }

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return "unknown";
}

/**
 * Consume one hit against a rate-limit key.
 *
 * @param key            Limiter key, e.g. `booking:ip:1.2.3.4`.
 * @param max            Max hits allowed within the window.
 * @param windowSeconds  Window length in seconds.
 * @returns `true` if the request is allowed, `false` if the limit is exceeded.
 *
 * Backed by the shared Neon `consume_rate_limit` RPC (db/0011_rate_limit.sql in
 * the admin repo, already live). Fails OPEN: if the database call errors, the
 * request is allowed so a DB blip cannot take down booking/contact flows.
 */
export async function consumeRateLimit(
  key: string,
  max: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select public.consume_rate_limit(${key}, ${max}, ${windowSeconds}) as allowed
    `) as { allowed: boolean }[];
    return rows[0]?.allowed ?? true;
  } catch (error) {
    console.error("consumeRateLimit failed; allowing request (fail-open):", error);
    return true;
  }
}
