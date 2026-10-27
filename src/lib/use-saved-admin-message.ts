"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminRequest } from "@/lib/rsvp/admin-client";
import { MAX_INVITATION_MESSAGE_LENGTH, type InvitationMessageSettings } from "@/lib/invitation-message";

function settings(value: unknown): InvitationMessageSettings {
  const data = value as Partial<InvitationMessageSettings> | null;
  if (!data || typeof data.message !== "string" || !data.message.trim() || data.message.length > MAX_INVITATION_MESSAGE_LENGTH ||
      !Number.isSafeInteger(data.revision) || Number(data.revision) < 0) throw new Error("The saved message could not be loaded. Please try again.");
  return { message: data.message, revision: Number(data.revision) };
}

export function useSavedAdminMessage(path: "rsvp-message") {
  const [draft, setDraftState] = useState("");
  const [saved, setSaved] = useState<InvitationMessageSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef("");
  const savedRef = useRef<InvitationMessageSettings | null>(null);
  const active = useRef(false);
  const loadVersion = useRef(0);
  const loadingRef = useRef(true);
  const savePending = useRef(false);
  const dirty = saved !== null && draft !== saved.message;
  const isDirty = useCallback(() => savedRef.current !== null && draftRef.current !== savedRef.current.message, []);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    loadingRef.current = true;
    setLoading(true); setError(null);
    try {
      const result = settings(await adminRequest(path));
      if (!active.current || version !== loadVersion.current) return;
      draftRef.current = result.message; savedRef.current = result;
      setDraftState(result.message); setSaved(result);
    } catch (failure) {
      if (active.current && version === loadVersion.current) setError(failure instanceof Error ? failure.message : "Could not load the saved message.");
    } finally {
      if (active.current && version === loadVersion.current) { loadingRef.current = false; setLoading(false); }
    }
  }, [path]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => { active.current = false; };
  }, [load]);

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      event.preventDefault(); event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      if (!isDirty() || !(event.target instanceof Element)) return;
      const link = event.target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target || link.origin !== window.location.origin) return;
      if (!window.confirm("You have unsaved RSVP message changes. Leave without saving?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [isDirty]);

  function setDraft(value: string) {
    if (loadingRef.current || !savedRef.current) return;
    draftRef.current = value; setDraftState(value);
  }

  function reload() {
    if (savePending.current || loadingRef.current) return;
    if (isDirty() && !window.confirm("Replace your unsaved message with the saved version?")) return;
    void load();
  }

  async function save() {
    const previous = savedRef.current;
    if (savePending.current || loadingRef.current || !previous) return;
    const message = draftRef.current;
    if (!message.trim() || message.length > MAX_INVITATION_MESSAGE_LENGTH) {
      setError("Enter a message of up to 4,000 characters before saving."); return;
    }
    if (message === previous.message) return;
    savePending.current = true; setSaving(true); setError(null);
    try {
      const result = settings(await adminRequest(path, { message, revision: previous.revision }));
      if (result.message !== message || result.revision <= previous.revision) throw new Error("Could not confirm the message was saved. Your edits are kept; try again.");
      if (!active.current) return;
      savedRef.current = result; setSaved(result);
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : "Could not save the message. Your edits are kept; try again.");
    } finally { savePending.current = false; if (active.current) setSaving(false); }
  }

  return { draft, setDraft, saved, loading, saving, error, dirty, save, reload,
    ready: !loading && saved !== null, getDraft: () => draftRef.current };
}
