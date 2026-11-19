"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LiveKitRoom,
  VideoConference,
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import { ConnectionState, RemoteAudioTrack, RoomEvent } from "livekit-client";
import { HeadphoneOff, Headphones, Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import type { VoiceSession as Session } from "./use-voice-session";
import "@livekit/components-styles";

function CallBar({
  session,
  onReturn,
  onLeave,
  deafened,
  busy,
  onDeafen,
  onMicrophone,
}: {
  session: Session;
  onReturn: () => void;
  onLeave: () => void;
  deafened: boolean;
  busy: boolean;
  onDeafen: () => void;
  onMicrophone: () => void;
}) {
  const connection = useConnectionState();
  const { isMicrophoneEnabled } = useLocalParticipant();
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
        disabled={busy || deafened || connection !== ConnectionState.Connected}
        onClick={onMicrophone}
      >
        {isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
      </button>
      <button
        className="icon-button voice-deafen"
        aria-label={deafened ? "Undeafen" : "Deafen"}
        aria-pressed={deafened}
        title={deafened ? "Undeafen" : "Deafen"}
        disabled={busy || connection !== ConnectionState.Connected}
        onClick={onDeafen}
      >
        {deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
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

function ConnectedCall({
  session,
  visible,
  onReturn,
  onLeave,
  onError,
}: Omit<Parameters<typeof VoiceSession>[0], "session" | "onEnded"> & { session: Session }) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [hearing, setHearing] = useState<
    { kind: "hearing" } | { kind: "deafened"; restoreMicrophone: boolean }
  >({ kind: "hearing" });
  const [busy, setBusy] = useState(false);
  const changing = useRef(false);
  const conference = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<Element | null>(null);
  const deafened = hearing.kind === "deafened";

  useEffect(() => {
    setToolbar(conference.current?.querySelector(".lk-control-bar") ?? null);
  }, []);

  useEffect(() => {
    if (!deafened) return;
    const volumes = new Map<RemoteAudioTrack, number>();
    const silence = (track: unknown) => {
      if (!(track instanceof RemoteAudioTrack) || volumes.has(track)) return;
      volumes.set(track, track.getVolume());
      track.setVolume(0);
    };
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.audioTrackPublications.values())
        silence(publication.track);
    }
    room.on(RoomEvent.TrackSubscribed, silence);
    return () => {
      room.off(RoomEvent.TrackSubscribed, silence);
      for (const [track, volume] of volumes) track.setVolume(volume);
    };
  }, [deafened, room]);

  async function changeAudio(action: "microphone" | "deafen") {
    if (changing.current || connection !== ConnectionState.Connected) return;
    changing.current = true;
    setBusy(true);
    try {
      if (action === "microphone") {
        if (!deafened) await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      } else if (hearing.kind === "deafened") {
        await localParticipant.setMicrophoneEnabled(hearing.restoreMicrophone);
        setHearing({ kind: "hearing" });
      } else {
        const restoreMicrophone = isMicrophoneEnabled;
        await localParticipant.setMicrophoneEnabled(false);
        setHearing({ kind: "deafened", restoreMicrophone });
      }
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not change voice audio");
    } finally {
      changing.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="voice-conference"
        ref={conference}
        hidden={!visible}
        onClickCapture={(event) => {
          if (
            (deafened || busy) &&
            event.target instanceof Element &&
            event.target.closest('[data-lk-source="microphone"]')
          ) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <VideoConference />
      </div>
      {toolbar &&
        createPortal(
          <button
            className="lk-button voice-deafen"
            aria-label={deafened ? "Undeafen" : "Deafen"}
            aria-pressed={deafened}
            title={deafened ? "Undeafen" : "Deafen"}
            disabled={busy || connection !== ConnectionState.Connected}
            onClick={() => void changeAudio("deafen")}
          >
            {deafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />}
            <span>{deafened ? "Undeafen" : "Deafen"}</span>
          </button>,
          toolbar,
        )}
      <CallBar
        session={session}
        onReturn={onReturn}
        onLeave={onLeave}
        deafened={deafened}
        busy={busy}
        onDeafen={() => void changeAudio("deafen")}
        onMicrophone={() => void changeAudio("microphone")}
      />
    </>
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
        <ConnectedCall
          session={session}
          visible={visible}
          onReturn={onReturn}
          onLeave={onLeave}
          onError={onError}
        />
      </LiveKitRoom>
    </div>
  );
}
