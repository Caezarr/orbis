"use client";
import { useEffect, useRef } from "react";
/** Approximate active review time: visible, focused, and interacted within 60s. */
export function useTaskEffort(taskId: string, enabled: boolean) {
  const flushRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!enabled) return;
    const sessionId = crypto.randomUUID();
    let activeMs = 0,
      last = performance.now(),
      interaction = last;
    const touch = () => {
      interaction = performance.now();
    };
    const tick = () => {
      const now = performance.now();
      if (!document.hidden && document.hasFocus() && now - interaction < 60000)
        activeMs += Math.min(now - last, 1500);
      last = now;
    };
    const flush = async () => {
      tick();
      await fetch(`/api/v1/tasks/${encodeURIComponent(taskId)}/effort`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, activeMs: Math.round(activeMs) }),
        keepalive: true,
      }).then(
        () => {},
        () => {},
      );
    };
    flushRef.current = flush;
    for (const name of ["pointerdown", "keydown", "scroll"])
      window.addEventListener(name, touch, { passive: true });
    const visibility = () => {
      void flush();
    };
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(tick, 1000),
      report = setInterval(() => void flush(), 15000);
    return () => {
      clearInterval(timer);
      clearInterval(report);
      void flush();
      flushRef.current = async () => {};
      document.removeEventListener("visibilitychange", visibility);
      for (const name of ["pointerdown", "keydown", "scroll"])
        window.removeEventListener(name, touch);
    };
  }, [taskId, enabled]);
  return () => flushRef.current();
}
