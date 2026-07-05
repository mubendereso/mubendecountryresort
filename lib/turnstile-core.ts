const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;

type TurnstileSiteverifyResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

type VerifyTurnstileTokenOptions = {
  secret: string | undefined;
  token: string;
  remoteIp: string;
  fetchImpl?: typeof fetch;
  createIdempotencyKey?: () => string;
};

export async function verifyTurnstileToken({
  secret: rawSecret,
  token: rawToken,
  remoteIp,
  fetchImpl = fetch,
  createIdempotencyKey = () => crypto.randomUUID()
}: VerifyTurnstileTokenOptions): Promise<boolean> {
  const secret = rawSecret?.trim();
  if (!secret) return false;

  const token = rawToken.trim();
  if (!token || token.length > MAX_TURNSTILE_TOKEN_LENGTH) return false;

  try {
    const response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: remoteIp === "unknown" ? undefined : remoteIp,
        idempotency_key: createIdempotencyKey()
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
