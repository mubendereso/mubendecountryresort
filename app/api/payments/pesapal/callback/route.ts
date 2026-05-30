import { after, type NextRequest, NextResponse } from "next/server";
import { scheduleDuePendingPaymentRecovery } from "@/lib/payments/recovery";

// Pesapal redirects the guest here after payment (success or cancellation).
// We relay them to the confirmation page which reads live booking state.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const reference = searchParams.get("token") ?? "";
  const cancelled = searchParams.get("cancelled") === "1";

  if (!reference) {
    return NextResponse.redirect(new URL("/book", origin));
  }

  // A guest just returned from Pesapal — a payment likely just resolved. Drain
  // the recovery queue so this (and any other stuck) booking is verified even
  // if the IPN hasn't landed yet. Runs after the redirect is sent.
  if (!cancelled) {
    after(() => scheduleDuePendingPaymentRecovery("callback"));
  }

  const dest = new URL("/book/confirmation", origin);
  dest.searchParams.set("ref", reference);
  if (cancelled) dest.searchParams.set("cancelled", "1");

  return NextResponse.redirect(dest);
}
