"use server";

import { headers } from "next/headers";
import { getSql } from "@/lib/db/client";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";

export type ContactFormState = {
  status: "idle" | "success" | "error";
  message: string;
};

// MCR-SEC-10: field length caps (prevent storage abuse of contact_submissions)
// and a per-IP throttle (prevent spam floods). Caps are generous for genuine
// enquiries.
const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 200;
const MAX_PHONE_LENGTH = 40;
const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 4000;
const CONTACT_IP_MAX_ATTEMPTS = 5;
const CONTACT_IP_WINDOW_SECONDS = 600; // 10 minutes

function normalizeOptional(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export async function submitContactFormAction(
  _previousState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = normalizeOptional(formData.get("phone"));
  const subject = normalizeOptional(formData.get("subject"));
  const message = String(formData.get("message") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();

  if (website.length > 0) {
    return {
      status: "success",
      message: "Thank you. We have received your enquiry."
    };
  }

  // MCR-SEC-10: per-IP throttle before validation / DB write.
  const clientIp = getClientIp(await headers());
  const allowed = await consumeRateLimit(
    `contact:ip:${clientIp}`,
    CONTACT_IP_MAX_ATTEMPTS,
    CONTACT_IP_WINDOW_SECONDS,
    { failOpen: false }
  );
  if (!allowed) {
    return {
      status: "error",
      message: "Too many submissions. Please wait a few minutes and try again."
    };
  }

  if (fullName.length < 2) {
    return { status: "error", message: "Please enter your full name." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Please enter a valid email address." };
  }

  if (message.length < 10) {
    return { status: "error", message: "Please include a short message." };
  }

  // MCR-SEC-10: length caps to prevent storage abuse.
  if (
    fullName.length > MAX_NAME_LENGTH ||
    email.length > MAX_EMAIL_LENGTH ||
    (phone?.length ?? 0) > MAX_PHONE_LENGTH ||
    (subject?.length ?? 0) > MAX_SUBJECT_LENGTH ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return { status: "error", message: "One or more fields are too long." };
  }

  try {
    const sql = getSql();
    await sql`
      INSERT INTO contact_submissions (
        full_name,
        email,
        phone,
        subject,
        message
      )
      VALUES (
        ${fullName},
        ${email},
        ${phone},
        ${subject},
        ${message}
      )
    `;

    return {
      status: "success",
      message: "Thank you. We have received your enquiry."
    };
  } catch (error) {
    console.error("Failed to submit contact enquiry", error);
    return {
      status: "error",
      message: "We could not send your enquiry. Please call or WhatsApp us directly."
    };
  }
}
