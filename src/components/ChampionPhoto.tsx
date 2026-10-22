"use client";

import { useState } from "react";
import { testingAssetPath } from "@/lib/testingMode";

type Props = { src?: string | null; alt: string; variant?: "year" | "podium" };

function Photo({ src, alt, variant }: { src: string; alt: string; variant: Props["variant"] }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img
    src={src}
    alt={alt}
    width={variant === "year" ? 640 : 320}
    height={variant === "year" ? 400 : 200}
    loading="lazy"
    decoding="async"
    onError={() => setFailed(true)}
    className={variant === "year"
      ? "mx-auto max-h-64 w-full rounded-xl object-contain"
      : "mx-auto mb-5 h-40 w-full max-w-80 rounded-xl object-contain"}
  />;
}

/** Missing optional photos must not hide a winner or reserve an empty image box. */
export default function ChampionPhoto({ src, alt, variant = "podium" }: Props) {
  if (!src) return null;
  const localPath = src.startsWith("/testing/winners/") ? src.slice("/testing".length) : src;
  // The 2024 year photo was never supplied. Correct only the known podium typo.
  if (localPath === "/winners/2024.jpg") return null;
  const corrected = localPath === "/winners/2024-3rd.jpg"
    ? src.replace(/2024-3rd\.jpg$/, "2024-3rd.jpeg") : src;
  const resolved = testingAssetPath(corrected);
  // A different source remounts Photo and gets a fresh load attempt.
  return <Photo key={resolved} src={resolved} alt={alt} variant={variant} />;
}
