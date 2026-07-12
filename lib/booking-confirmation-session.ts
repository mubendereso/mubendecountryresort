export const BOOKING_CONFIRMATION_SESSION_COOKIE = "mcr_confirmation_session";
export const BOOKING_CONFIRMATION_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readBookingConfirmationSessionToken(value: string | undefined): string | null {
  const token = value?.trim();
  return token && UUID_PATTERN.test(token) ? token : null;
}
