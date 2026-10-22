/** Match the existing RSVP event fallback without rewriting legacy records. */
export function getCurrentEventName(data: Record<string, unknown> | undefined): string {
  return typeof data?.eventName === "string" && data.eventName.trim()
    ? data.eventName.trim()
    : "5th Annual Dipsgiving";
}
