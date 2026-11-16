"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { Room } from "@/lib/model";
import { responseData, type Mode } from "./use-relay";

const admissionSchema = z.object({ token: z.string(), url: z.string() });
export type VoiceSession = z.infer<typeof admissionSchema> & {
  room: Room;
  serverName: string;
};

export function useVoiceSession(mode: Mode) {
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);

  const leave = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setJoiningRoomId(null);
    setSession(null);
    setError("");
  }, []);

  const ended = useCallback((session: VoiceSession) => {
    setSession((current) => (current === session ? null : current));
  }, []);

  useEffect(() => () => request.current?.abort(), []);

  async function join(room: Room, serverName: string) {
    setError("");
    if (mode === "demo") {
      setError(
        "This is a local demo. Connect Neon and LiveKit to talk with real people—no microphone is used in demo mode.",
      );
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setJoiningRoomId(room.id);
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.id }),
        signal: controller.signal,
      });
      const admission = admissionSchema.parse(await responseData(response));
      if (!controller.signal.aborted) setSession({ ...admission, room, serverName });
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Could not join voice");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setJoiningRoomId(null);
      }
    }
  }

  return { session, joiningRoomId, error, join, leave, ended };
}
