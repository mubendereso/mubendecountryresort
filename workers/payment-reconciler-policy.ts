export type NormalizedProviderPaymentStatus = "pending" | "paid" | "failed";

export function normalizeProviderPaymentStatus(
  value: string | null | undefined
): NormalizedProviderPaymentStatus {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "COMPLETED") return "paid";
  if (normalized === "FAILED" || normalized === "REVERSED") return "failed";
  return "pending";
}

export function parseUgxAmount(value: string | number | null): bigint | null {
  if (value === null) return null;
  const normalized = String(value).trim().replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  if (Math.abs(numeric - rounded) > 0.000001) return null;
  return BigInt(rounded);
}

export function replacementDelaySeconds(
  wakeAt: string,
  nowMs = Date.now()
): number {
  const wakeMs = Date.parse(wakeAt);
  if (!Number.isFinite(wakeMs)) return 30;
  return Math.max(30, Math.min(43_200, Math.ceil((wakeMs - nowMs) / 1000)));
}

export function isActiveRecoveryStatus(status: string): boolean {
  return status === "pending" || status === "processing" || status === "retrying";
}
