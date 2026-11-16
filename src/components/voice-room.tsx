"use client";

import { useState } from "react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import { Headphones, Mic, Video, MonitorUp, ArrowRight } from "lucide-react";
import { z } from "zod";
import type { Room } from "@/lib/model";
import { responseData, type Mode } from "./use-relay";
import "@livekit/components-styles";

const admissionSchema = z.object({ token: z.string(), url: z.string() });
export function VoiceRoom({ room, mode }: { room: Room; mode: Mode }) {
  const [admission, setAdmission] = useState<z.infer<typeof admissionSchema> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function join() {
    if (mode === "demo") {
      setError(
        "This is a local demo. Connect Neon and LiveKit to talk with real people—no microphone is used in demo mode.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.id }),
      });
      setAdmission(admissionSchema.parse(await responseData(response)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join voice");
    } finally {
      setBusy(false);
    }
  }
  if (admission)
    return (
      <div className="livekit-container">
        <LiveKitRoom
          serverUrl={admission.url}
          token={admission.token}
          connect
          audio
          video={false}
          onDisconnected={() => setAdmission(null)}
          onError={(cause) => {
            setError(cause.message);
            setAdmission(null);
          }}
          data-lk-theme="default"
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
    );
  return (
    <section className="voice-empty">
      <div className="voice-art">
        <Headphones size={64} strokeWidth={1.5} />
        <span>✦</span>
        <i />
      </div>
      <span className="eyebrow">LESS TYPING. MORE CONNECTING.</span>
      <h1>Pull up a chair.</h1>
      <p>
        Welcome to <strong>{room.name}</strong>. Drop in for a conversation,
        <br />
        share your screen, or simply hang out.
      </p>
      <div className="voice-capabilities">
        <span>
          <Mic size={18} /> Voice
        </span>
        <span>
          <Video size={18} /> Video
        </span>
        <span>
          <MonitorUp size={18} /> Screen sharing
        </span>
      </div>
      <button className="primary-button" onClick={join} disabled={busy}>
        {busy ? "Connecting…" : "Join conversation"}
        <ArrowRight size={18} />
      </button>
      {error && (
        <p className="voice-notice" role="alert">
          {error}
        </p>
      )}
      <small>
        {mode === "demo"
          ? "LOCAL DEMO · VOICE IS NOT CONNECTED"
          : "Your microphone is requested only when you join."}
      </small>
    </section>
  );
}
