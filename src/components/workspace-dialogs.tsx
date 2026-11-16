"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Copy, Hash, Headphones, LogOut, RotateCcw, Users } from "lucide-react";
import { z } from "zod";
import {
  type AppState,
  type Command,
  type Message,
  type Server,
  type User,
  userSchema,
} from "@/lib/model";
import { Avatar, Dialog } from "./primitives";
import type { Mode } from "./use-relay";

export type Modal =
  | { kind: "createServer" }
  | { kind: "createRoom"; server: Server }
  | { kind: "join" }
  | { kind: "invite"; server: Server }
  | { kind: "profile"; user: User }
  | { kind: "settings" }
  | { kind: "edit"; message: Message }
  | { kind: "delete"; message: Message }
  | { kind: "react"; message: Message }
  | { kind: "reset" };

type Props = {
  modal: Modal;
  state: AppState;
  mode: Mode;
  busy: boolean;
  onClose: () => void;
  dispatch: (command: Command) => Promise<AppState>;
  onNavigateServer: (id: string) => void;
  onNavigateDM: (id: string) => void;
  onReset: () => void;
  onSignOut: () => void;
  notify: (text: string) => void;
};

export function WorkspaceDialog(props: Props) {
  const {
    modal,
    state,
    mode,
    busy,
    onClose,
    dispatch,
    onNavigateServer,
    onNavigateDM,
    onReset,
    onSignOut,
    notify,
  } = props;
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [roomKind, setRoomKind] = useState<"text" | "voice">("text");
  async function perform(command: Command, after?: (next: AppState) => void) {
    setError("");
    try {
      const next = await dispatch(command);
      after?.(next);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete action");
    }
  }
  async function formSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");
    switch (modal.kind) {
      case "createServer":
        return perform(
          { type: "createServer", name: value("name"), description: value("description") },
          (next) => {
            const server = next.servers.find((s) => !state.servers.some((old) => old.id === s.id));
            if (server) onNavigateServer(server.id);
            notify("Your community is ready. Make it yours.");
          },
        );
      case "createRoom":
        return perform({
          type: "createRoom",
          serverId: modal.server.id,
          name: value("name"),
          kind: roomKind,
        });
      case "join": {
        let code = value("inviteCode").trim();
        try {
          code = new URL(code).searchParams.get("invite") ?? code;
        } catch {
          /* Plain invite codes are supported. */
        }
        return perform({ type: "join", inviteCode: code }, (next) => {
          const server = next.servers.find((s) => s.inviteCode === code);
          if (server) onNavigateServer(server.id);
        });
      }
      case "edit":
        return perform({ type: "edit", messageId: modal.message.id, content: value("content") });
      case "settings": {
        const status = userSchema.shape.status.safeParse(value("status"));
        if (!status.success) {
          setError("Choose a valid status");
          return;
        }
        return perform(
          { type: "profile", name: value("name"), bio: value("bio"), status: status.data },
          () => notify("Profile updated. Looking good."),
        );
      }
      default:
        return;
    }
  }
  const errorView = error && (
    <p className="form-error" role="alert">
      {error}
    </p>
  );
  const submitButton = (text: string) => (
    <button className="primary-button" disabled={busy}>
      {busy ? "One moment…" : text}
      <ArrowRight size={17} />
    </button>
  );
  switch (modal.kind) {
    case "createServer":
      return (
        <Dialog title="Start something good." onClose={onClose}>
          <div className="modal-art">
            ✳<span>Your people. Your place.</span>
          </div>
          <p className="dialog-description">
            A cozy corner for your friends, team, or next big idea. Give it a name and make it
            yours.
          </p>
          <form onSubmit={formSubmit}>
            <label>
              Community name
              <input
                name="name"
                placeholder="The next great community"
                minLength={2}
                maxLength={48}
                required
                autoFocus
              />
            </label>
            <label>
              A little about it
              <textarea
                name="description"
                placeholder="What brings your people together?"
                maxLength={200}
                rows={3}
              />
            </label>
            {errorView}
            {submitButton("Create community")}
          </form>
        </Dialog>
      );
    case "createRoom":
      return (
        <Dialog title="Make room for more." onClose={onClose}>
          <p className="dialog-description">Create a new channel in {modal.server.name}.</p>
          <form onSubmit={formSubmit}>
            <div className="type-picker">
              <button
                type="button"
                onClick={() => setRoomKind("text")}
                className={roomKind === "text" ? "selected" : ""}
              >
                <Hash size={22} />
                <strong>Text channel</strong>
                <small>Keep the conversation going</small>
              </button>
              <button
                type="button"
                onClick={() => setRoomKind("voice")}
                className={roomKind === "voice" ? "selected" : ""}
              >
                <Headphones size={22} />
                <strong>Voice channel</strong>
                <small>Drop in and hang out</small>
              </button>
            </div>
            <label>
              Channel name
              <input
                name="name"
                placeholder="your-new-channel"
                pattern="[a-z0-9-]+"
                minLength={1}
                maxLength={48}
                required
                autoFocus
              />
              <small>Lowercase letters, numbers, and hyphens.</small>
            </label>
            {errorView}
            {submitButton("Create channel")}
          </form>
        </Dialog>
      );
    case "join":
      return (
        <Dialog title="Your next community awaits." onClose={onClose}>
          <p className="dialog-description">Have an invite? Paste the link or code below.</p>
          <form onSubmit={formSubmit}>
            <label>
              Invite link or code
              <input
                name="inviteCode"
                placeholder="Paste your invitation here"
                maxLength={500}
                required
                autoFocus
              />
            </label>
            {mode === "demo" && (
              <p className="subtle-notice">
                Demo invites are local to this browser. For shared communities, connect Neon.
              </p>
            )}
            {errorView}
            {submitButton("Join community")}
          </form>
        </Dialog>
      );
    case "invite": {
      const url = `${window.location.origin}/?invite=${encodeURIComponent(modal.server.inviteCode)}`;
      return (
        <Dialog title="Good things are better together." onClose={onClose}>
          <div className="invite-icon">
            <Users size={32} />
          </div>
          <p className="dialog-description">
            Invite your people to <strong>{modal.server.name}</strong>.
          </p>
          <label>
            Community invitation
            <div className="copy-field">
              <input value={url} readOnly aria-label="Invite link" />
              <button
                className="icon-button"
                aria-label="Copy invite link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                  } catch {
                    setError("Copy isn't available here. Select and copy the link above.");
                  }
                }}
              >
                {copied ? <Check size={19} /> : <Copy size={19} />}
              </button>
            </div>
          </label>
          {copied && <p className="success-text">Copied. Send it to someone great.</p>}
          {mode === "demo" && (
            <p className="subtle-notice">
              This invitation is a local demo. It won’t connect other browsers until a database is
              configured.
            </p>
          )}
          {errorView}
        </Dialog>
      );
    }
    case "profile":
      return (
        <Dialog title="A face in the community." onClose={onClose}>
          <div className="profile-banner" style={{ background: modal.user.color }} />
          <div className="profile-detail">
            <Avatar user={modal.user} size="large" />
            <h2>{modal.user.name}</h2>
            <span className="profile-status">
              {modal.user.status === "dnd" ? "Do not disturb" : modal.user.status}
            </span>
            <div className="profile-bio">
              <span className="eyebrow">A LITTLE ABOUT ME</span>
              <p>{modal.user.bio || "A story still being written."}</p>
            </div>
            {modal.user.id !== state.me.id && (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() =>
                  void perform({ type: "dm", userId: modal.user.id }, (next) => {
                    const room = next.rooms.find(
                      (r) => r.kind === "dm" && r.participantIds.includes(modal.user.id),
                    );
                    if (room) onNavigateDM(room.id);
                  })
                }
              >
                Say hello
                <ArrowRight size={18} />
              </button>
            )}
            {errorView}
          </div>
        </Dialog>
      );
    case "settings":
      return (
        <Dialog title="Make yourself at home." onClose={onClose}>
          <form onSubmit={formSubmit}>
            <div className="settings-user">
              <Avatar user={state.me} size="large" />
              <div>
                <strong>{state.me.name}</strong>
                <small>{state.me.email}</small>
              </div>
            </div>
            <label>
              Display name
              <input
                name="name"
                defaultValue={state.me.name}
                minLength={2}
                maxLength={48}
                required
              />
            </label>
            <label>
              About you
              <textarea name="bio" defaultValue={state.me.bio} maxLength={200} rows={3} />
            </label>
            <label>
              Availability
              <select name="status" defaultValue={state.me.status}>
                <option value="online">Online</option>
                <option value="idle">Away</option>
                <option value="dnd">Do not disturb</option>
                <option value="offline">Invisible</option>
              </select>
              <small>Availability is selected by you, not live connection tracking.</small>
            </label>
            {errorView}
            {submitButton("Save changes")}
          </form>
          <div className="settings-bottom">
            {mode === "demo" ? (
              <button className="text-button" onClick={onReset}>
                <RotateCcw size={16} /> Reset local demo
              </button>
            ) : (
              <button className="text-button danger" onClick={onSignOut}>
                <LogOut size={16} /> Sign out
              </button>
            )}
            <span>Relay v0.1 · {mode === "demo" ? "Local demo" : "Connected"}</span>
          </div>
        </Dialog>
      );
    case "edit":
      return (
        <Dialog title="A little revision." onClose={onClose}>
          <form onSubmit={formSubmit}>
            <label>
              Message
              <textarea
                name="content"
                defaultValue={modal.message.content}
                minLength={1}
                maxLength={4000}
                rows={5}
                autoFocus
                required
              />
            </label>
            {errorView}
            {submitButton("Save message")}
          </form>
        </Dialog>
      );
    case "delete":
      return (
        <Dialog title="Delete this message?" onClose={onClose}>
          <p className="dialog-description">
            This can’t be undone. The conversation will keep going, just without this message.
          </p>
          <blockquote className="delete-preview">{modal.message.content}</blockquote>
          {errorView}
          <div className="dialog-actions">
            <button className="secondary-button" onClick={onClose}>
              Keep it
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => void perform({ type: "delete", messageId: modal.message.id })}
            >
              Delete message
            </button>
          </div>
        </Dialog>
      );
    case "react":
      return (
        <Dialog title="Say it with a little feeling." onClose={onClose}>
          <div className="emoji-grid">
            {z.enum(["❤️", "🔥", "👍", "🎉", "👀", "🚀"]).options.map((emoji) => (
              <button
                key={emoji}
                disabled={busy}
                aria-label={`React with ${emoji}`}
                onClick={() => void perform({ type: "react", messageId: modal.message.id, emoji })}
              >
                {emoji}
              </button>
            ))}
          </div>
          {errorView}
        </Dialog>
      );
    case "reset":
      return (
        <Dialog title="A fresh start?" onClose={onClose}>
          <p className="dialog-description">
            This will remove your local demo messages, communities, and profile changes. Connected
            accounts aren’t affected.
          </p>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={onClose}>
              Keep my demo
            </button>
            <button
              className="danger-button"
              onClick={() => {
                try {
                  onReset();
                  onClose();
                  notify("A fresh workspace. A new beginning.");
                } catch {
                  setError("Could not reset browser storage");
                }
              }}
            >
              Reset demo
            </button>
          </div>
          {errorView}
        </Dialog>
      );
    default: {
      const exhaustive: never = modal;
      return exhaustive;
    }
  }
}
