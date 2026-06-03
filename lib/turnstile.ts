import "server-only";

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;

type TurnstileSiteverifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

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
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;

  const token = String(formData.get("cf-turnstile-response") ?? "").trim();
  if (!token || token.length > MAX_TURNSTILE_TOKEN_LENGTH) return false;

  try {
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: remoteIp === "unknown" ? undefined : remoteIp,
        idempotency_key: crypto.randomUUID()
      })
    });

    if (!response.ok) return false;
    const result = (await response.json()) as TurnstileSiteverifyResponse;
    return result.success === true;
  } catch (error) {
    console.error("Turnstile verification failed:", error);
    return false;
  }
}
