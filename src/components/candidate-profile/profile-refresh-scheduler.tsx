"use client";

import { useEffect } from "react";

import type { ProfileRefreshStatus } from "@/lib/candidate-profile/types";

const POLL_INTERVAL_MS = 30_000;

export function ProfileRefreshScheduler() {
  useEffect(() => {
    let stopped = false;
    let running = false;

    const check = async () => {
      if (stopped || running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const response = await fetch("/api/candidate-profile/status", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const status = (await response.json()) as ProfileRefreshStatus;
        if (status.pending && status.dueAt && new Date(status.dueAt).getTime() <= Date.now()) {
          await fetch("/api/candidate-profile/refresh", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ force: false }),
          });
        }
      } catch {
        // The durable pending state is retried on the next visible poll.
      } finally {
        running = false;
      }
    };

    void check();
    const interval = window.setInterval(check, POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
