"use client";

import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}
