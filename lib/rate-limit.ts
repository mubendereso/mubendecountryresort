import "server-only";

import { getSql } from "@/lib/db/client";

const RATE_LIMIT_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RATE_LIMIT_PRUNE_SAMPLE_RATE = 0.01;
const RATE_LIMIT_PRUNE_OLDER_THAN_SECONDS = 24 * 60 * 60;

let lastPruneAttemptAt = 0;

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

async function maybePruneRateLimits(): Promise<void> {
  const now = Date.now();
  if (now - lastPruneAttemptAt < RATE_LIMIT_PRUNE_INTERVAL_MS) return;
  if (Math.random() > RATE_LIMIT_PRUNE_SAMPLE_RATE) return;

  lastPruneAttemptAt = now;

  try {
    const sql = getSql();
    await sql`select public.prune_rate_limits(${RATE_LIMIT_PRUNE_OLDER_THAN_SECONDS})`;
  } catch (error) {
    console.error("pruneRateLimits failed:", error);
  }
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
  windowSeconds: number,
  options?: { failOpen?: boolean }
): Promise<boolean> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select public.consume_rate_limit(${key}, ${max}, ${windowSeconds}) as allowed
    `) as { allowed: boolean }[];
    await maybePruneRateLimits();
    return rows[0]?.allowed ?? true;
  } catch (error) {
    const failOpen = options?.failOpen ?? true;
    console.error(
      `consumeRateLimit failed; ${failOpen ? "allowing" : "blocking"} request:`,
      error
    );
    return failOpen;
  }
}
