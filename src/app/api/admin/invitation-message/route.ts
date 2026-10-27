import { adminMessageHandlers } from "@/lib/rsvp/admin-message";
import { DEFAULT_INVITATION_MESSAGE } from "@/lib/invitation-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Existing private setting and fallback remain unchanged.
export const { GET, POST } = adminMessageHandlers("_adminSettings/invitationMessage", DEFAULT_INVITATION_MESSAGE);
