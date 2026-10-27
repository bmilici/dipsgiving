import { adminMessageHandlers } from "@/lib/rsvp/admin-message";
import { DEFAULT_RSVP_MESSAGE } from "@/lib/rsvp-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = adminMessageHandlers("_adminSettings/rsvpMessage", DEFAULT_RSVP_MESSAGE);
