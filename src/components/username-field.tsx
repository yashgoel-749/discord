"use client";

import { useEffect, useState } from "react";
import {
  usernameSchema,
  usernameAvailabilitySchema,
  usernameChangeAllowedAt,
  type AppState,
} from "@/lib/model";
import { responseData, type Mode } from "./use-relay";

type Availability =
  { phase: "checking" } | { phase: "available" } | { phase: "error"; message: string };
export function UsernameField({ state, mode }: { state: AppState; mode: Mode }) {
  const [value, setValue] = useState(state.me.username);
  const [result, setResult] = useState<{ value: string; availability: Availability } | null>(null);
  const parsed = usernameSchema.safeParse(value);
  const allowedAt = usernameChangeAllowedAt(state.me.usernameChangedAt);
  const locked = allowedAt !== null && Date.now() < new Date(allowedAt).getTime();
  useEffect(() => {
    const input = usernameSchema.safeParse(value);
    if (!input.success || input.data === state.me.username) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const available =
          mode === "demo"
            ? !state.users.some((user) => user.id !== state.me.id && user.username === input.data)
            : usernameAvailabilitySchema.parse(
                await responseData(
                  await fetch(`/api/username?username=${encodeURIComponent(input.data)}`, {
                    cache: "no-store",
                    signal: controller.signal,
                  }),
                ),
              ).available;
        if (!controller.signal.aborted)
          setResult({
            value,
            availability: available
              ? { phase: "available" }
              : { phase: "error", message: "That username is already taken" },
          });
      } catch {
        if (!controller.signal.aborted)
          setResult({
            value,
            availability: { phase: "error", message: "Could not check availability. Try again." },
          });
      }
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, mode, state.me.id, state.me.username, state.users]);
  const availability: Availability = !parsed.success
    ? { phase: "error", message: parsed.error.issues[0].message }
    : parsed.data === state.me.username
      ? { phase: "available" }
      : result?.value === value
        ? result.availability
        : { phase: "checking" };
  return (
    <label>
      Username
      <input
        name="username"
        aria-label="Username"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        minLength={3}
        maxLength={20}
        required
        readOnly={locked}
        aria-describedby="username-feedback"
      />
      <small
        id="username-feedback"
        role="status"
        className={availability.phase === "error" ? "form-error" : ""}
      >
        {locked
          ? `Next change allowed: ${new Date(allowedAt).toLocaleString()}`
          : availability.phase === "error"
            ? availability.message
            : availability.phase === "checking"
              ? "Checking availability…"
              : parsed.success && parsed.data === state.me.username
                ? "Your current username"
                : "Available"}
      </small>
      {!locked && <small>You can change your username once every 14 days.</small>}
    </label>
  );
}
