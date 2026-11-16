"use client";

import { useState } from "react";
import {
  LiveKitRoom,
  VideoConference,
  useConnectionState,
  useLocalParticipant,
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import type { VoiceSession as Session } from "./use-voice-session";
import "@livekit/components-styles";

function CallBar({
  session,
  onReturn,
  onLeave,
  onError,
}: {
  session: Session;
  onReturn: () => void;
  onLeave: () => void;
  onError: (message: string) => void;
}) {
  const connection = useConnectionState();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [busy, setBusy] = useState(false);
  async function toggleMicrophone() {
    setBusy(true);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not change microphone");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="voice-call-bar" aria-label="Active voice call">
      <button className="voice-call-return" onClick={onReturn} aria-label="Return to voice call">
        <Volume2 size={18} />
        <span>
          <strong role="status">
            {connection === ConnectionState.Connected
              ? "Voice connected"
              : connection === ConnectionState.Reconnecting ||
                  connection === ConnectionState.SignalReconnecting
                ? "Reconnecting…"
                : "Connecting…"}
          </strong>
          <small>
            {session.serverName} / {session.room.name}
          </small>
        </span>
      </button>
      <button
        className="icon-button"
        aria-label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
        aria-pressed={!isMicrophoneEnabled}
        disabled={busy || connection !== ConnectionState.Connected}
        onClick={() => void toggleMicrophone()}
      >
        {isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
      </button>
      <button
        className="icon-button voice-disconnect"
        aria-label="Disconnect voice"
        onClick={onLeave}
      >
        <PhoneOff size={18} />
      </button>
    </section>
  );
}

export function VoiceSession({
  session,
  visible,
  onReturn,
  onLeave,
  onEnded,
  onError,
}: {
  session: Session | null;
  visible: boolean;
  onReturn: () => void;
  onLeave: () => void;
  onEnded: (session: Session) => void;
  onError: (message: string) => void;
}) {
  if (!session) return null;
  return (
    <div className={`livekit-container ${visible ? "" : "voice-background"}`}>
      <LiveKitRoom
        key={session.room.id}
        serverUrl={session.url}
        token={session.token}
        connect
        audio
        video={false}
        onDisconnected={() => onEnded(session)}
        onError={(cause) => {
          onError(cause.message);
          onEnded(session);
        }}
        data-lk-theme="default"
      >
        <div className="voice-conference" hidden={!visible}>
          <VideoConference />
        </div>
        <CallBar session={session} onReturn={onReturn} onLeave={onLeave} onError={onError} />
      </LiveKitRoom>
    </div>
  );
}
