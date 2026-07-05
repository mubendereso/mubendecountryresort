import "server-only";

import { verifyTurnstileToken } from "@/lib/turnstile-core";

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
}

export function getTurnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
}

export async function verifyTurnstileFormData(
  formData: FormData,
  remoteIp: string
): Promise<boolean> {
  return verifyTurnstileToken({
    secret: process.env.TURNSTILE_SECRET_KEY,
    token: String(formData.get("cf-turnstile-response") ?? ""),
    remoteIp
  });
}
