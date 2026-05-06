"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getClientDB } from "@/lib/firebase";

export type EventSettings = {
  eventName: string;
  eventNumberLabel: string;
  dateLabel: string;
  timeLabel: string;
  registrationOpen: boolean;
  votingOpen: boolean;
};

export const defaultEventSettings: EventSettings = {
  eventName: "5th Annual Dipsgiving",
  eventNumberLabel: "5th Annual",
  dateLabel: "TBD",
  timeLabel: "TBD",
  registrationOpen: true,
  votingOpen: false,
};

export function useEventSettings() {
  const [settings, setSettings] = useState<EventSettings>(defaultEventSettings);

  useEffect(() => {
    const db = getClientDB();
    if (!db) return;

    const unsub = onSnapshot(
      doc(db, "eventSettings", "current"),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;

        setSettings({
          eventName:
            typeof data.eventName === "string"
              ? data.eventName
              : defaultEventSettings.eventName,
          eventNumberLabel:
            typeof data.eventNumberLabel === "string"
              ? data.eventNumberLabel
              : defaultEventSettings.eventNumberLabel,
          dateLabel:
            typeof data.dateLabel === "string"
              ? data.dateLabel
              : defaultEventSettings.dateLabel,
          timeLabel:
            typeof data.timeLabel === "string"
              ? data.timeLabel
              : defaultEventSettings.timeLabel,
          registrationOpen:
            typeof data.registrationOpen === "boolean"
              ? data.registrationOpen
              : defaultEventSettings.registrationOpen,
          votingOpen:
            typeof data.votingOpen === "boolean"
              ? data.votingOpen
              : defaultEventSettings.votingOpen,
        });
      },
      (err) => {
        console.error("Event settings subscribe error:", err);
      }
    );

    return () => unsub();
  }, []);

  return settings;
}
