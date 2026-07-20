import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import {
  BOOKING_CONFIRMATION_SESSION_COOKIE,
  readBookingConfirmationSessionToken
} from "@/lib/booking-confirmation-session";
import { getSql } from "@/lib/db/client";
import { consumeRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CONFIRMATION_STATUS_MAX_ATTEMPTS = 30;
const CONFIRMATION_STATUS_WINDOW_SECONDS = 60;
const MAX_REFERENCE_LENGTH = 120;

type ConfirmationStatusRow = {
  status: string;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const reference = new URL(request.url).searchParams.get("ref")?.trim() ?? "";
  if (!reference || reference.length > MAX_REFERENCE_LENGTH) {
    return NextResponse.json({ message: "Booking not found." }, { status: 404 });
  }

  const sessionToken = readBookingConfirmationSessionToken(
    (await cookies()).get(BOOKING_CONFIRMATION_SESSION_COOKIE)?.value
  );
  if (!sessionToken) {
    return NextResponse.json({ message: "Booking details unavailable." }, { status: 403 });
  }

  const allowed = await consumeRateLimit(
    `confirmation-status:${sessionToken}`,
    CONFIRMATION_STATUS_MAX_ATTEMPTS,
    CONFIRMATION_STATUS_WINDOW_SECONDS,
    { failOpen: false }
  );
  if (!allowed) {
    return NextResponse.json(
      { message: "Please wait a moment before checking again." },
      { status: 429, headers: { "Retry-After": String(CONFIRMATION_STATUS_WINDOW_SECONDS) } }
    );
  }

  const sql = getSql();
  const rows = (await sql`
    SELECT status
    FROM get_storefront_booking_confirmation_by_session(${reference}, ${sessionToken}::uuid)
  `) as ConfirmationStatusRow[];

  if (!rows[0]) {
    return NextResponse.json({ message: "Booking details unavailable." }, { status: 404 });
  }

  return NextResponse.json(
    { status: rows[0].status },
    { headers: { "Cache-Control": "no-store" } }
  );
}
