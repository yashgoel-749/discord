"use client";

import { useEffect } from "react";
import { presenceHeartbeatMs, type PresenceCommand } from "@/lib/presence";

export function useTabPresence(userId: string | null, onOpened: () => Promise<void>) {
  useEffect(() => {
    if (!userId) return;
    let tabId = crypto.randomUUID();
    let stopped = false;
    let closed = false;
    let opened = false;
    let pending = false;
    const send = async (command: PresenceCommand) => {
      const response = await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(30000),
      });
      return response.ok;
    };
    const pulse = async () => {
      if (stopped || closed || pending) return;
      pending = true;
      const id = tabId;
      try {
        const ok = await send({ type: opened ? "heartbeat" : "open", tabId: id });
        if (ok && !stopped && !closed && tabId === id && !opened) {
          opened = true;
          await onOpened();
        }
      } catch {
        // The lease expires if disconnected; the next pulse retries without changing availability.
      } finally {
        pending = false;
      }
    };
    const close = () => {
      if (closed) return;
      closed = true;
      const command: PresenceCommand = { type: "close", tabId };
      const body = JSON.stringify(command);
      if (!navigator.sendBeacon("/api/presence", new Blob([body], { type: "application/json" })))
        void fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
    };
    const resume = (event: PageTransitionEvent) => {
      if (!event.persisted || stopped) return;
      tabId = crypto.randomUUID();
      closed = false;
      opened = false;
      void pulse();
    };
    void pulse();
    const timer = window.setInterval(() => void pulse(), presenceHeartbeatMs);
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", pulse);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", pulse);
      close();
    };
  }, [userId, onOpened]);
}
