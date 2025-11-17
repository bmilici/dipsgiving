"use client";

import { useEffect } from "react";

export default function ChatPage() {
  useEffect(() => {
    // Inject Five9 script dynamically
    const script = document.createElement("script");
    script.src = "https://cdn.prod.us.five9.net/static/stable/chat/wrapper/index.js";
    script.async = true;
    document.body.appendChild(script);

    // Cleanup on unmount
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <button
        id="clickToChat"
        style={{
          padding: "10px 18px",
          borderRadius: "8px",
          background: "#65758e",
          color: "white",
          border: "none",
          cursor: "pointer",
        }}
        onClick={async () => {
          const box = document.getElementById("chatWidgetContainer");
          if (box) box.style.display = "block";

          // Five9 available?
          const waitForFive9 = () =>
            new Promise<void>((resolve) => {
              const interval = setInterval(() => {
                if (window.F9?.Chat?.Wrapper) {
                  clearInterval(interval);
                  resolve();
                }
              }, 100);
            });

          await waitForFive9();

          // Mount chat
          window.F9.Chat.Wrapper.init({
            cdn: "prod",
            messenger: {
              integrationId: "642f0167b3069f011ac9b1a8",
              embedded: true,
              embeddedContainerId: "chatWidgetContainer",
              displayStyle: "embedded",
              soundNotificationEnabled: true,
              browserStorage: "sessionStorage",
            },
          });

          const api = window.F9.Chat.Wrapper.api;
          api?.open?.();
        }}
      >
        Click to Chat
      </button>

      <div
        id="chatWidgetContainer"
        style={{
          display: "none",
          position: "fixed",
          right: "16px",
          bottom: "16px",
          width: "360px",
          height: "520px",
          background: "#fff",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
          zIndex: 9999,
        }}
      ></div>
    </div>
  );
}
