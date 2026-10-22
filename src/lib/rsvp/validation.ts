import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export class RsvpValidationError extends Error {}

export type NewRsvpInput = {
  name: string;
  phone: string;
  party_size: number;
  bringing_dip: boolean;
  dip_name: string | null;
  notes: string | null;
};

function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RsvpValidationError("Please check the information and try again.");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new RsvpValidationError("Please check the information and try again.");
  }
  return input;
}

/** Canonical US E.164 number, without accepting extensions or letters. */
export function normalizeUsPhone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40 || !/^[+()\d.\-\s]+$/u.test(value)) return null;
  try {
    const phone = parsePhoneNumberFromString(value.trim(), { defaultCountry: "US", extract: false });
    return phone?.country === "US" && phone.isValid() && !phone.ext ? phone.number : null;
  } catch {
    return null;
  }
}

/** Identity comparison only; the display name keeps its original capitalization. */
export function normalizeGuestName(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US") : "";
}

export function normalizeDipName(value: unknown): string {
  return normalizeGuestName(value);
}

function guestName(value: unknown): string {
  if (typeof value !== "string") throw new RsvpValidationError("Please enter your name.");
  const name = value.trim().replace(/\s+/gu, " ");
  if (!name || name.length > 100) throw new RsvpValidationError("Please enter your name using 100 characters or fewer.");
  return name;
}

function dipFields(input: Record<string, unknown>): { dip_name: string; notes: string | null } {
  const dip_name = typeof input.dip_name === "string" ? input.dip_name.trim().replace(/\s+/gu, " ") : "";
  if (!dip_name || dip_name.length > 120) throw new RsvpValidationError("Please enter a dip name using 120 characters or fewer.");
  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== "string") {
    throw new RsvpValidationError("Please check your dip notes.");
  }
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > 1000) throw new RsvpValidationError("Please keep dip notes to 1,000 characters or fewer.");
  return { dip_name, notes: notes || null };
}

export function validateNewRsvp(value: unknown): NewRsvpInput {
  const input = record(value, ["name", "phone", "party_size", "bringing_dip", "dip_name", "notes"]);
  const name = guestName(input.name);
  const phone = normalizeUsPhone(input.phone);
  if (!phone) throw new RsvpValidationError("Please enter a valid phone number.");
  if (typeof input.party_size !== "number" || !Number.isInteger(input.party_size) || input.party_size < 1 || input.party_size > 20) {
    throw new RsvpValidationError("Please choose a party size from 1 to 20.");
  }
  if (typeof input.bringing_dip !== "boolean") throw new RsvpValidationError("Please check the RSVP information.");
  const dip = input.bringing_dip ? dipFields(input) : { dip_name: null, notes: null };
  return { name, phone, party_size: input.party_size, bringing_dip: input.bringing_dip, ...dip };
}

export function validateLookup(value: unknown): { phone: string } {
  const input = record(value, ["name", "phone"]);
  // Earlier clients send a name; lookup deliberately ignores that field.
  // New RSVP creation still requires and validates the registrant's name.
  const phone = normalizeUsPhone(input.phone);
  if (!phone) throw new RsvpValidationError("Please enter a valid phone number.");
  return { phone };
}

export function validateDip(value: unknown): { dip_name: string; notes: string | null } {
  return dipFields(record(value, ["dip_name", "notes"]));
}
