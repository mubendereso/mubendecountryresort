"use server";

import { getSql } from "@/lib/db/client";

export type ContactFormState = {
  status: "idle" | "success" | "error";
  message: string;
};

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

  if (fullName.length < 2) {
    return { status: "error", message: "Please enter your full name." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Please enter a valid email address." };
  }

  if (message.length < 10) {
    return { status: "error", message: "Please include a short message." };
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
