"use client";

export async function adminRequest(path: string, input?: Record<string, unknown>) {
  const response = await fetch(`/api/admin/${path}`, {
    method: input ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    ...(input ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "session") window.dispatchEvent(new Event("dipsgiving-admin-expired"));
    throw new Error(typeof result.error === "string" ? result.error : "This request could not be processed.");
  }
  return result;
}
