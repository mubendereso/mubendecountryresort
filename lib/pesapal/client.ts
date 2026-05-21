import "server-only";

type PesapalTokenResponse = {
  token?: string;
  expiryDate?: string;
  status?: string;
  error?: { code?: string | null; message?: string | null; type?: string | null } | null;
  message?: string | null;
};

type PesapalRegisterIpnResponse = {
  ipn_id?: string;
  url?: string | null;
  status?: string | null;
  error?: { code?: string | null; message?: string | null; type?: string | null } | null;
  message?: string | null;
};

export type PesapalSubmitOrderResponse = {
  order_tracking_id?: string;
  merchant_reference?: string;
  redirect_url?: string | null;
  status?: string | null;
  message?: string | null;
  error?: { code?: string | null; message?: string | null; type?: string | null } | null;
};

type PesapalTransactionStatusResponse = {
  payment_status_description?: string | null;
  confirmation_code?: string | null;
  order_tracking_id?: string | null;
  merchant_reference?: string | null;
  amount?: string | number | null;
  payment_method?: string | null;
};

type TokenCache = { token: string; expiresAt: number };

const PESAPAL_REQUEST_TIMEOUT_MS = 10_000;
let tokenCache: TokenCache | null = null;
const ipnRegistrationCache = new Map<string, string>();

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getBaseUrl(): string {
  return process.env.PESAPAL_BASE_URL?.trim() || "https://cybqa.pesapal.com/pesapalv3";
}

function getIpnUrl(origin: string): string {
  return new URL("/api/payments/pesapal/ipn", origin).toString();
}

function getCallbackUrl(reference: string, origin: string): string {
  const url = new URL("/api/payments/pesapal/callback", origin);
  url.searchParams.set("token", reference);
  return url.toString();
}

function getCancellationUrl(reference: string, origin: string): string {
  const url = new URL("/api/payments/pesapal/callback", origin);
  url.searchParams.set("token", reference);
  url.searchParams.set("cancelled", "1");
  return url.toString();
}

export class PesapalInitiationError extends Error {
  readonly code: string | null;
  readonly providerStatus: string | null;

  constructor(message: string, code?: string | null, providerStatus?: string | null) {
    super(message);
    this.name = "PesapalInitiationError";
    this.code = code ?? null;
    this.providerStatus = providerStatus ?? null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PESAPAL_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function pesapalRequest<T>(
  path: string,
  init: RequestInit,
  options?: { authenticated?: boolean }
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const hdrs = new Headers(init.headers ?? {});
  hdrs.set("Accept", "application/json");
  hdrs.set("Content-Type", "application/json");

  if (options?.authenticated) {
    hdrs.set("Authorization", `Bearer ${await getPesapalAuthToken()}`);
  }

  const response = await fetchWithTimeout(url, { ...init, headers: hdrs });
  const rawText = await response.text();
  const payload = rawText.length > 0 ? (JSON.parse(rawText) as T) : ({} as T);

  if (!response.ok) {
    throw new Error(`Pesapal request failed (${response.status}): ${rawText || response.statusText}`);
  }

  return payload;
}

async function getPesapalAuthToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 15_000) {
    return tokenCache.token;
  }

  const response = await pesapalRequest<PesapalTokenResponse>("/api/Auth/RequestToken", {
    method: "POST",
    body: JSON.stringify({
      consumer_key: getRequiredEnv("PESAPAL_CONSUMER_KEY"),
      consumer_secret: getRequiredEnv("PESAPAL_CONSUMER_SECRET")
    })
  });

  if (!response.token) {
    throw new Error(response.error?.message ?? response.message ?? "Pesapal token request failed.");
  }

  tokenCache = { token: response.token, expiresAt: Date.now() + 4 * 60_000 };
  return response.token;
}

async function ensurePesapalIpnId(origin: string): Promise<string> {
  const cached = ipnRegistrationCache.get(origin);
  if (cached) return cached;

  const response = await pesapalRequest<PesapalRegisterIpnResponse>(
    "/api/URLSetup/RegisterIPN",
    {
      method: "POST",
      body: JSON.stringify({ url: getIpnUrl(origin), ipn_notification_type: "GET" })
    },
    { authenticated: true }
  );

  if (!response.ipn_id) {
    throw new Error(response.error?.message ?? response.message ?? "Pesapal IPN registration failed.");
  }

  ipnRegistrationCache.set(origin, response.ipn_id);
  return response.ipn_id;
}

export async function submitPesapalOrder(input: {
  reference: string;
  amountUGX: number;
  description: string;
  guestName: string;
  phone?: string | null;
  email?: string | null;
  requestOrigin: string;
}): Promise<PesapalSubmitOrderResponse> {
  const ipnId = await ensurePesapalIpnId(input.requestOrigin);
  const [firstName, ...rest] = input.guestName.trim().split(/\s+/);
  const lastName = rest.join(" ") || "-";

  const response = await pesapalRequest<PesapalSubmitOrderResponse>(
    "/api/Transactions/SubmitOrderRequest",
    {
      method: "POST",
      body: JSON.stringify({
        id: input.reference,
        currency: "UGX",
        amount: input.amountUGX,
        description: input.description,
        redirect_mode: "TOP_WINDOW",
        callback_url: getCallbackUrl(input.reference, input.requestOrigin),
        cancellation_url: getCancellationUrl(input.reference, input.requestOrigin),
        notification_id: ipnId,
        billing_address: {
          ...(input.email ? { email_address: input.email } : {}),
          ...(input.phone ? { phone_number: input.phone } : {}),
          country_code: "UG",
          first_name: firstName || "Guest",
          middle_name: "",
          last_name: lastName,
          line_1: "Mubende Country Resort",
          line_2: "",
          city: "Mubende",
          state: "",
          postal_code: "",
          zip_code: ""
        }
      })
    },
    { authenticated: true }
  );

  if (!response.order_tracking_id || !response.redirect_url) {
    throw new PesapalInitiationError(
      response.error?.message ?? response.message ?? "Pesapal did not return a redirect URL.",
      response.error?.code,
      response.status
    );
  }

  return response;
}

export type NormalizedPaymentStatus = "pending" | "paid" | "failed";

export function normalizePesapalStatus(raw: string | null | undefined): NormalizedPaymentStatus {
  const s = raw?.trim().toUpperCase();
  if (s === "COMPLETED") return "paid";
  if (s === "FAILED" || s === "REVERSED") return "failed";
  return "pending";
}

export async function getPesapalTransactionStatus(orderTrackingId: string) {
  const url = new URL(`${getBaseUrl()}/api/Transactions/GetTransactionStatus`);
  url.searchParams.set("orderTrackingId", orderTrackingId);

  const response = await fetchWithTimeout(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${await getPesapalAuthToken()}`
    }
  });

  const rawText = await response.text();
  const payload = rawText.length > 0 ? (JSON.parse(rawText) as PesapalTransactionStatusResponse) : {};

  if (!response.ok) {
    throw new Error(`Pesapal status check failed (${response.status}): ${rawText || response.statusText}`);
  }

  return {
    orderTrackingId,
    paymentStatus: normalizePesapalStatus(payload.payment_status_description),
    providerStatus: payload.payment_status_description ?? null,
    confirmationCode: payload.confirmation_code ?? null,
    merchantReference: payload.merchant_reference ?? null,
    rawResponse: payload
  };
}
