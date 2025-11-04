"use client";

import { useEffect, useState } from "react";
import { getClientDB } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

export default function DipListPage() {
  const [dips, setDips] = useState<any[]>([]);

  useEffect(() => {
    const db = getClientDB();
    const q = query(collection(db, "registrations"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setDips(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50 py-14">
      <div className="mx-auto max-w-5xl px-4">
        <h1 className="text-3xl font-bold text-orange-900 mb-6 text-center">
          Dip List
        </h1>
        {dips.length === 0 ? (
          <p className="text-center text-orange-700">No dips yet — check back soon!</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {dips.map((d) => (
              <div
                key={d.id}
                className="border border-orange-200 bg-orange-50 rounded-xl p-4 shadow-sm"
              >
                <h2 className="font-semibold text-orange-900">{d.dip_name}</h2>
                <p className="text-sm text-orange-800">by {d.name}</p>
                {d.notes && (
                  <p className="mt-1 text-xs text-orange-700/80">{d.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
