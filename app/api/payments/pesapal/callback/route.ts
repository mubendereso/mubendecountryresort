import { type NextRequest, NextResponse } from "next/server";

// Pesapal redirects the guest here after payment (success or cancellation).
// We relay them to the confirmation page which reads live booking state.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const reference = searchParams.get("token") ?? "";
  const cancelled = searchParams.get("cancelled") === "1";

  if (!reference) {
    return NextResponse.redirect(new URL("/book", origin));
  }

  // Confirmation is driven by the provider IPN and the durable recovery
  // Queue. The public storefront never performs privileged reconciliation.

  const dest = new URL("/book/confirmation", origin);
  dest.searchParams.set("ref", reference);
  if (cancelled) dest.searchParams.set("cancelled", "1");

  return NextResponse.redirect(dest);
}
