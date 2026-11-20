"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { createDemo, applyDemoCommand, restoreDemo } from "@/lib/demo";
import { type AppState, type Command, stateSchema } from "@/lib/model";
import { RequestOrder } from "@/lib/request-order";
import { useTabPresence } from "./use-tab-presence";

export type Mode = "demo" | "connected";
type View = { phase: "loading" } | { phase: "signedOut" } | { phase: "ready"; state: AppState };
const storageKey = "relay-demo-v1";
const errorSchema = z.object({ error: z.string() });
export async function responseData(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error(errorSchema.safeParse(data).data?.error ?? "Request failed. Please try again.");
  return data;
}

export function useRelay(mode: Mode) {
  const [view, setView] = useState<View>({ phase: "loading" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useRef<AppState | null>(null);
  const inFlight = useRef(false);
  const order = useRef(new RequestOrder());
  const readRequest = useRef<AbortController | null>(null);

  const accept = useCallback((state: AppState) => {
    current.current = state;
    setView({ phase: "ready", state });
  }, []);
  const refresh = useCallback(async () => {
    if (mode === "demo" || inFlight.current) return;
    const ticket = order.current.begin();
    readRequest.current?.abort();
    const controller = new AbortController();
    readRequest.current = controller;
    try {
      const response = await fetch("/api/relay", {
        cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      });
      if (!order.current.isCurrent(ticket)) return;
      if (response.status === 401) {
        current.current = null;
        setView({ phase: "signedOut" });
        return;
      }
      const state = stateSchema.parse(await responseData(response));
      if (order.current.isCurrent(ticket)) {
        accept(state);
        setError("");
      }
    } catch (cause) {
      if (order.current.isCurrent(ticket) && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Could not refresh chat");
    } finally {
      if (readRequest.current === controller) readRequest.current = null;
    }
  }, [accept, mode]);

  useTabPresence(mode === "connected" && view.phase === "ready" ? view.state.me.id : null, refresh);

  useEffect(() => {
    if (mode === "demo") {
      try {
        const raw = localStorage.getItem(storageKey);
        accept(raw ? restoreDemo(JSON.parse(raw)) : createDemo());
      } catch {
        accept(createDemo());
        setError("Could not restore the demo. A fresh workspace is ready.");
      }
      const onStorage = (event: StorageEvent) => {
        if (event.key !== storageKey || !event.newValue) return;
        try {
          accept(restoreDemo(JSON.parse(event.newValue)));
        } catch {
          setError(
            "Another tab wrote an invalid demo snapshot. Your current workspace is unchanged.",
          );
        }
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden && !readRequest.current) void refresh();
    }, 3000);
    return () => {
      window.clearInterval(timer);
      order.current.invalidate();
      readRequest.current?.abort();
    };
  }, [accept, mode, refresh]);

  const dispatch = useCallback(
    async (command: Command) => {
      if (inFlight.current || !current.current)
        throw new Error("Please wait for the previous action to finish");
      inFlight.current = true;
      order.current.invalidate();
      readRequest.current?.abort();
      setBusy(true);
      try {
        let next: AppState;
        if (mode === "demo") {
          next = applyDemoCommand(current.current, command);
          try {
            localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {
            setError(
              "Browser storage is full or disabled. Changes will only last for this session.",
            );
          }
        } else {
          const response = await fetch("/api/relay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(command),
          });
          next = stateSchema.parse(await responseData(response));
        }
        accept(next);
        return next;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [accept, mode],
  );

  const reset = useCallback(() => {
    if (mode !== "demo") return;
    const seed = createDemo();
    localStorage.setItem(storageKey, JSON.stringify(seed));
    accept(seed);
  }, [accept, mode]);
  return { view, error, busy, dispatch, refresh, reset };
}
