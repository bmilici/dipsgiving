"use client";

import { useCallback, useEffect, useRef } from "react";

// Five9 adds F9 to window at runtime
declare global {
  interface Window {
    F9?: any;
  }
}

const INTEGRATION_ID = "642f0167b3069f011ac9b1a8";

export default function ChatPage() {
  const five9MountedRef = useRef(false);
  const notificationHookedRef = useRef(false);
  const scriptLoadedRef = useRef(false);

  /**************** LOAD FIVE9 SCRIPT ****************/

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (scriptLoadedRef.current) return;

    const script = document.createElement("script");
    script.src =
      "https://cdn.prod.us.five9.net/static/stable/chat/wrapper/index.js";
    script.async = true;
    script.onload = () => {
      scriptLoadedRef.current = true;
      console.log("Five9 script loaded");
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const waitForFive9 = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("window is undefined"));
        return;
      }

      if (window.F9?.Chat?.Wrapper) {
        resolve();
        return;
      }

      const start = Date.now();
      const timeoutMs = 15000;

      const interval = setInterval(() => {
        if (window.F9?.Chat?.Wrapper) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error("Timed out waiting for Five9 wrapper"));
        }
      }, 100);
    });
  }, []);

  /**************** NOTIFICATION HELPERS ****************/

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined") return false;
    if (!("Notification" in window)) {
      console.log("Browser does not support notifications");
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission === "denied") {
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      return result === "granted";
    } catch (e) {
      console.warn("Notification permission request failed:", e);
      return false;
    }
  }, []);

  const notifyNewChatMessage = useCallback((from?: string, text?: string) => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    // Optional: only notify if tab not focused
    if (document.hasFocus()) {
      return;
    }

    const title = from || "New chat message";
    const body = text || "You have a new message in your chat.";

    try {
      new Notification(title, { body });
    } catch (e) {
      console.warn("Unable to show notification:", e);
    }
  }, []);

  const hookIncomingMessageNotifications = useCallback(() => {
    if (typeof window === "undefined") return;
    const api = window.F9?.Chat?.Wrapper?.api;
    if (!api) return;
    if (notificationHookedRef.current) return;

    // TODO: replace with the real Five9 inbound-message event.
    //
    // Example pattern ONLY – do not use as-is until you know the actual API:
    //
    /*
    api.on("messageReceived", (event: any) => {
      if (event?.direction === "inbound") {
        const from = event.author || "Support";
        const text = event.text || "";
        notifyNewChatMessage(from, text);
      }
    });
    */

    console.log(
      "hookIncomingMessageNotifications: add api.on(<incoming-message-event>, handler) here when you have the Five9 docs."
    );

    notificationHookedRef.current = true;
  }, [notifyNewChatMessage]);

  /**************** MOUNT FIVE9 + CLICK HANDLER ****************/

  const mountFive9Embedded = useCallback(async () => {
    await waitForFive9();

    if (five9MountedRef.current) return;
    if (!window.F9?.Chat?.Wrapper) {
      console.error("Five9 Chat Wrapper not found on window");
      return;
    }

    window.F9.Chat.Wrapper.init({
      cdn: "prod",
      useBusinessHours: false,
      l10n: {
        en: {
          messenger: { customText: {} },
          systemMessages: {
            transferredToParticipant:
              "The chat has been transferred to {name}.",
            transferredToGroup:
              "The chat has been transferred to group {group}.",
          },
          captureFields: [
            { k: "name", l: "Name", p: "Enter your name..." },
            { k: "email", l: "Email Address", p: "Enter your email..." },
            {
              k: "Question",
              l: "Question",
              p: "What can we help you with today?",
            },
          ],
        },
      },
      prepopulatedFields: [{ k: "campaign", v: "UC CHAT" }],
      messenger: {
        integrationId: INTEGRATION_ID,
        embedded: true,
        embeddedContainerId: "chatWidgetContainer",
        displayStyle: "embedded",
        soundNotificationEnabled: true,
        transcriptPrintingEnabled: false,
        menuItems: {
          imageUpload: true,
          fileUpload: true,
          shareLocation: true,
        },
        browserStorage: "sessionStorage",
        customColors: {
          brandColor: "65758e",
          conversationColor: "4B5DFF",
          actionColor: "4B5DFF",
        },
      },
      clearMessagesTimeout: 3,
    });

    five9MountedRef.current = true;
  }, [waitForFive9]);

  const handleOpenClick = useCallback(async () => {
    if (typeof window === "undefined") return;

    const box = document.getElementById("chatWidgetContainer");
    if (box) {
      (box as HTMLDivElement).style.display = "block";
    }

    try {
      await mountFive9Embedded();
    } catch (e) {
      console.error(e);
      return;
    }

    const api = window.F9?.Chat?.Wrapper?.api;
    if (api?.open) {
      try {
        api.open();
      } catch (e) {
        console.warn(e);
      }
    }

    await requestNotificationPermission();
    hookIncomingMessageNotifications();
  }, [hookIncomingMessageNotifications, mountFive9Embedded, requestNotificationPermission]);

  /**************** RENDER (matches your HTML structure) ****************/

  return (
    <div
      style={{
        fontFamily: "sans-serif",
        background: "#f9f9f9",
        minHeight: "100vh",
      }}
    >
      <button
        id="clickToChat"
        onClick={handleOpenClick}
        style={{
          margin: "20px",
          padding: "10px 18px",
          border: "none",
          borderRadius: "8px",
          background: "#65758e",
          color: "#fff",
          fontSize: "16px",
          cursor: "pointer",
        }}
      >
        Click to Chat
      </button>

      <div
        id="chatWidgetContainer"
        aria-live="polite"
        style={{
          display: "none",
          position: "fixed",
          right: "16px",
          bottom: "16px",
          width: "360px",
          maxWidth: "90vw",
          height: "520px",
          maxHeight: "80vh",
          background: "#fff",
          borderRadius: "12px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
          overflow: "hidden",
          zIndex: 9999,
        }}
      />
    </div>
  );
}
