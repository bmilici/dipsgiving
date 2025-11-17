"use client";

import { useCallback, useEffect, useRef } from "react";

// Tell TypeScript that window.F9 exists (added by the Five9 script)
declare global {
  interface Window {
    F9?: any;
  }
}

const INTEGRATION_ID = "642f0167b3069f011ac9b1a8";

export default function ChatPage() {
  const five9ScriptLoadedRef = useRef(false);
  const five9MountedRef = useRef(false);
  const notificationHookedRef = useRef(false);

  // Load the Five9 script once on the client
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (five9ScriptLoadedRef.current) return;

    const script = document.createElement("script");
    script.src =
      "https://cdn.prod.us.five9.net/static/stable/chat/wrapper/index.js";
    script.async = true;
    script.onload = () => {
      five9ScriptLoadedRef.current = true;
      console.log("Five9 script loaded");
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  /************* NOTIFICATION HELPERS *************/

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
      // User has already denied, don't nag
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

  /************* FIVE9 HELPERS *************/

  const waitForFive9 = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("Window is undefined"));
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

  const hookIncomingMessageNotifications = useCallback(() => {
    if (typeof window === "undefined") return;
    const api = window.F9?.Chat?.Wrapper?.api;
    if (!api) return;

    if (notificationHookedRef.current) return;

    // TODO: Replace this with the REAL Five9 event for incoming messages.
    // The following is just an example shape – you’ll plug in the actual
    // event name & payload once you have it from the Five9 docs.

    /*
    api.on("messageReceived", (event: any) => {
      // Example checks – adjust to real payload
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

  /************* CLICK HANDLER *************/

  const handleOpenChat = useCallback(async () => {
    if (typeof window === "undefined") return;

    // Show the container
    const box = document.getElementById("chatWidgetContainer");
    if (box) {
      box.style.display = "block";
    }

    try {
      // Ensure Five9 wrapper is available
      await waitForFive9();
    } catch (e) {
      console.error(e);
      return;
    }

    if (!window.F9?.Chat?.Wrapper) {
      console.error("Five9 Chat Wrapper not found on window");
      return;
    }

    // Init Five9 once
    if (!five9MountedRef.current) {
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
    }

    const api = window.F9.Chat.Wrapper.api;
    try {
      api?.open?.();
    } catch (e) {
      console.warn("Error calling api.open()", e);
    }

    // Ask for notification permission after they open chat
    await requestNotificationPermission();

    // Wire notifications for incoming messages (once)
    hookIncomingMessageNotifications();
  }, [hookIncomingMessageNotifications, requestNotificationPermission, waitForFive9]);

  /************* RENDER *************/

  return (
    <div
      style={{
        fontFamily: "sans-serif",
        background: "#f9f9f9",
        minHeight: "100vh",
        padding: "20px",
      }}
    >
      <button
        id="clickToChat"
        onClick={handleOpenChat}
        style={{
          margin: "20px 0",
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
