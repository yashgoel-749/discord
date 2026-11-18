"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Bell,
  BellOff,
  Bookmark,
  ChevronDown,
  Compass,
  Hash,
  Headphones,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
  UserPlus,
  X,
  LoaderCircle,
  CircleHelp,
  Check,
  Volume2,
} from "lucide-react";
import { commandSchema, type Message, type Room, type User } from "@/lib/model";
import { Avatar, Brand, Dialog } from "./primitives";
import { useRelay, type Mode } from "./use-relay";
import { AuthScreen, authClient } from "./auth-screen";
import { WorkspaceDialog, type Modal } from "./workspace-dialogs";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { VoiceRoom } from "./voice-room";
import { VoiceSession } from "./voice-session";
import { useVoiceSession } from "./use-voice-session";
import { useVoicePresence, VoiceMembers } from "./voice-members";
import { PeopleScreen } from "./people-screen";

function serverStyle(color: string): CSSProperties & { "--server-color": string } {
  return { "--server-color": color };
}
function bannerStyle(color: string): CSSProperties & { "--banner-color": string } {
  return { "--banner-color": color };
}

export function RelayApp({ mode }: { mode: Mode }) {
  const relay = useRelay(mode);
  const voice = useVoiceSession(mode);
  const [serverId, setServerId] = useState<string | null>(mode === "demo" ? "studio" : null);
  const [roomId, setRoomId] = useState(mode === "demo" ? "general" : "");
  const [peopleOpen, setPeopleOpen] = useState(mode === "connected");
  const voicePresence = useVoicePresence({
    mode,
    viewerId: relay.view.phase === "ready" ? relay.view.state.me.id : null,
    serverId,
  });
  const [modal, setModal] = useState<Modal | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [muted, setMuted] = useState<string[]>([]);
  const [reply, setReply] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const inviteHandled = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const notify = useCallback((text: string) => setToast(text), []);
  const incomingSeen = useRef<{ userId: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    if (relay.view.phase !== "ready") {
      incomingSeen.current = null;
      return;
    }
    const { state } = relay.view;
    if (incomingSeen.current?.userId === state.me.id) {
      const fresh = state.incoming.filter((request) => !incomingSeen.current?.ids.has(request.id));
      if (fresh.length)
        notify(
          fresh.length === 1
            ? `New friend request from @${state.users.find((user) => user.id === fresh[0].userId)?.username ?? "someone"}`
            : `${fresh.length} new friend requests`,
        );
    }
    incomingSeen.current = {
      userId: state.me.id,
      ids: new Set(state.incoming.map((request) => request.id)),
    };
  }, [relay.view, notify]);
  const replyUsed = useCallback(() => setReply(""), []);
  useEffect(() => {
    if (relay.view.phase !== "ready") voice.leave();
  }, [relay.view.phase, voice.leave]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === "Escape") {
        setSidebarOpen(false);
        setMembersOpen(false);
        setSearch("");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (relay.view.phase !== "ready" || inviteHandled.current) return;
    inviteHandled.current = true;
    const inviteCode = new URLSearchParams(window.location.search).get("invite");
    if (!inviteCode) return;
    void relay
      .dispatch({ type: "join", inviteCode })
      .then((next) => {
        const server = next.servers.find((s) => s.inviteCode === inviteCode);
        if (server) {
          setServerId(server.id);
          setRoomId(
            next.rooms.find((r) => r.serverId === server.id && r.kind === "text")?.id ?? "",
          );
        }
        notify("You're in. Welcome to the community!");
        window.history.replaceState({}, "", "/");
      })
      .catch((cause) =>
        notify(cause instanceof Error ? cause.message : "Invite could not be opened"),
      );
  }, [relay.view.phase, relay.dispatch, notify]);

  function navigateServer(id: string | null) {
    setPeopleOpen(id === null);
    setServerId(id);
    setRoomId("");
    setSearch("");
    setSavedOnly(false);
    setSidebarOpen(false);
  }
  function navigateRoom(room: Room) {
    setPeopleOpen(false);
    setRoomId(room.id);
    setSearch("");
    setSavedOnly(false);
    setSidebarOpen(false);
  }
  function navigateDM(id: string) {
    navigateServer(null);
    setPeopleOpen(false);
    setRoomId(id);
  }

  if (relay.view.phase === "signedOut") return <AuthScreen onSignedIn={relay.refresh} />;
  if (relay.view.phase === "loading")
    return (
      <div className="loading-screen">
        <Brand />
        <LoaderCircle className="spin" size={26} />
        <p>{relay.error || "Making room for you…"}</p>
        {relay.error && (
          <button className="primary-button" onClick={() => void relay.refresh()}>
            Try again
          </button>
        )}
      </div>
    );

  const state = relay.view.state;
  const server = state.servers.find((s) => s.id === serverId);
  const rooms = state.rooms.filter(
    (r) =>
      (server ? r.serverId === server.id : r.kind === "dm") &&
      (r.kind !== "dm" ||
        !r.participantIds.some((id) => state.blocked.some((person) => person.userId === id))),
  );
  const room =
    rooms.find((r) => r.id === roomId) ?? rooms.find((r) => r.kind !== "voice") ?? rooms[0];
  const roomMessages = state.messages.filter(
    (m) => m.roomId === room?.id && !state.blocked.some((person) => person.userId === m.authorId),
  );
  const dms = state.rooms.filter(
    (r) =>
      r.kind === "dm" &&
      !r.participantIds.some((id) => state.blocked.some((person) => person.userId === id)),
  );
  const members = server
    ? state.users.filter((u) => server.memberIds.includes(u.id))
    : state.users.filter((u) => room?.participantIds.includes(u.id));
  const onlineMembers = members.filter((u) => u.status !== "offline");
  const offlineMembers = members.filter((u) => u.status === "offline");
  const ownServer = server?.ownerId === state.me.id;

  async function react(message: Message, emoji: string) {
    const command = commandSchema.safeParse({ type: "react", messageId: message.id, emoji });
    if (!command.success) return;
    try {
      await relay.dispatch(command.data);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not add reaction");
    }
  }
  async function send(content: string) {
    if (!room) return;
    try {
      await relay.dispatch({ type: "send", roomId: room.id, content });
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Message couldn't be sent. Your draft is safe.",
      );
      throw cause;
    }
  }
  async function startDM(user: User) {
    try {
      const next = await relay.dispatch({ type: "dm", userId: user.id });
      const conversation = next.rooms.find(
        (r) => r.kind === "dm" && r.participantIds.includes(user.id),
      );
      if (conversation) navigateDM(conversation.id);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not start conversation");
    }
  }
  function renderChannel(channel: Room) {
    const presence = voicePresence(channel.id);
    return (
      <div key={channel.id}>
        <button
          aria-label={channel.name}
          className={`channel-item ${room?.id === channel.id ? "selected" : ""}`}
          onClick={() => navigateRoom(channel)}
        >
          {channel.kind === "voice" ? <Volume2 size={19} /> : <Hash size={19} />}
          <span>{channel.name}</span>
          {channel.kind === "voice" && presence.phase === "ready" && (
            <span className="voice-member-count" aria-hidden="true">
              {presence.members.length}
            </span>
          )}
          {channel.id === room?.id && <span className="channel-active-dot" />}
        </button>
        {channel.kind === "voice" && (
          <VoiceMembers channelName={channel.name} presence={presence} />
        )}
      </div>
    );
  }
  function renderMember(user: User) {
    return (
      <button
        className={`member ${user.status === "offline" ? "member-offline" : ""}`}
        key={user.id}
        onClick={() => setModal({ kind: "profile", user })}
      >
        <Avatar user={user} size="small" />
        <span>
          <strong>
            {user.name}
            {user.id === state.me.id && <small> you</small>}
          </strong>
          <small className="public-username">@{user.username}</small>
          <small>
            {user.status === "dnd"
              ? "In the zone"
              : user.status === "idle"
                ? "Taking a little break"
                : user.status === "offline"
                  ? "Offline"
                  : user.bio || "Around and about"}
          </small>
        </span>
        {user.id === server?.ownerId && (
          <span className="owner-mark" title="Community owner">
            ♛
          </span>
        )}
      </button>
    );
  }
  function renderDMPerson(user: User) {
    const dm = dms.find((conversation) => conversation.participantIds.includes(user.id));
    return (
      <div
        className={`dm-person-row ${!peopleOpen && room?.id === dm?.id ? "selected" : ""}`}
        key={user.id}
      >
        <button className="dm-item" onClick={() => setModal({ kind: "profile", user })}>
          <Avatar user={user} size="small" />
          <span>
            {user.name}
            <small className="public-username">@{user.username}</small>
          </span>
        </button>
        <button
          className="icon-button"
          aria-label={`Message @${user.username}`}
          disabled={relay.busy}
          onClick={() => (dm ? navigateDM(dm.id) : void startDM(user))}
        >
          <MessageCircle size={17} />
        </button>
      </div>
    );
  }

  return (
    <div className={`relay-shell ${voice.session ? "has-voice-call" : ""}`}>
      <nav className="server-rail" aria-label="Communities">
        <button
          className={`rail-home ${!server ? "selected" : ""}`}
          title="Direct messages"
          aria-label="Direct messages"
          onClick={() => navigateServer(null)}
        >
          <Brand compact />
        </button>
        <span className="rail-divider" />
        <div className="rail-servers">
          {state.servers.map((item) => (
            <button
              key={item.id}
              className={`server-icon ${server?.id === item.id ? "selected" : ""}`}
              style={serverStyle(item.color)}
              onClick={() => navigateServer(item.id)}
              title={item.name}
              aria-label={item.name}
            >
              <span>{item.icon}</span>
              <i />
            </button>
          ))}
          <button
            className="rail-action"
            title="Create community"
            aria-label="Create community"
            onClick={() => setModal({ kind: "createServer" })}
          >
            <Plus size={24} />
          </button>
          <button
            className="rail-action"
            title="Join community"
            aria-label="Join community"
            onClick={() => setModal({ kind: "join" })}
          >
            <Compass size={23} />
          </button>
        </div>
        <div className="rail-bottom">
          <button className="rail-help" aria-label="About Relay" onClick={() => setHelpOpen(true)}>
            <CircleHelp size={21} />
          </button>
          <button
            className="rail-profile"
            aria-label="Your settings"
            onClick={() => setModal({ kind: "settings" })}
          >
            <Avatar user={state.me} size="small" />
          </button>
        </div>
      </nav>

      {sidebarOpen && (
        <button
          className="navigation-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`channel-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
        aria-label="Channels"
      >
        <header className="community-header">
          <button
            onClick={() =>
              server
                ? setModal({ kind: "invite", server })
                : notify("Your direct messages. Just between you and your people.")
            }
          >
            <span>{server?.name ?? "Your conversations"}</span>
            <ChevronDown size={17} />
          </button>
        </header>
        <div className="sidebar-scroll">
          {server ? (
            <>
              <div className="community-banner" style={bannerStyle(server.color)}>
                <span>
                  MAKE YOURSELF
                  <br />
                  <strong>at home.</strong>
                </span>
                <i className="banner-sun">✳</i>
                <i className="banner-circle" />
                <i className="banner-arch" />
              </div>
              <div className="community-summary">
                <span className="community-badge">
                  <span /> {mode === "demo" ? "DEMO COMMUNITY" : "YOUR COMMUNITY"}
                </span>
                <p>{server.description || "A space for your people and your ideas."}</p>
              </div>
              <button
                className="invite-button"
                onClick={() => setModal({ kind: "invite", server })}
              >
                <UserPlus size={16} />
                <span>Invite your people</span>
                <Plus size={15} />
              </button>
              {server.id === "studio" && (
                <div className="channel-group">
                  <div className="group-heading">
                    <span>START HERE</span>
                  </div>
                  {rooms
                    .filter((r) => r.kind === "text" && ["welcome", "announcements"].includes(r.id))
                    .map(renderChannel)}
                </div>
              )}
              <div className="channel-group">
                <div className="group-heading">
                  <span>{server.id === "studio" ? "THE STUDIO" : "TEXT CHANNELS"}</span>
                  {ownServer && (
                    <button
                      className="icon-button"
                      aria-label="Create text channel"
                      onClick={() => setModal({ kind: "createRoom", server })}
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </div>
                {rooms
                  .filter(
                    (r) =>
                      r.kind === "text" &&
                      (server.id !== "studio" || !["welcome", "announcements"].includes(r.id)),
                  )
                  .map(renderChannel)}
              </div>
              <div className="channel-group">
                <div className="group-heading">
                  <span>ROOM TO TALK</span>
                  {ownServer && (
                    <button
                      className="icon-button"
                      aria-label="Create voice channel"
                      onClick={() => setModal({ kind: "createRoom", server })}
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </div>
                {rooms.filter((r) => r.kind === "voice").map(renderChannel)}
                {!rooms.some((r) => r.kind === "voice") && (
                  <p className="sidebar-small">No voice channels yet.</p>
                )}
              </div>
              <div className="sidebar-note">
                <Sparkles size={17} />
                <p>
                  Good people.
                  <br />
                  <strong>Great possibilities.</strong>
                </p>
              </div>
            </>
          ) : (
            <>
              <button
                className="friends-link"
                onClick={() => {
                  setPeopleOpen(true);
                  setSidebarOpen(false);
                }}
              >
                <Users size={19} /> Your people{" "}
                <span aria-label="Pending requests">
                  {state.incoming.length + state.outgoing.length}
                </span>
              </button>
              <div className="channel-group">
                <div className="group-heading">
                  <span>FRIENDS</span>
                  <button
                    className="icon-button"
                    aria-label="New direct message"
                    onClick={() => setMembersOpen(!membersOpen)}
                  >
                    <Plus size={15} />
                  </button>
                </div>
                {state.users
                  .filter((user) => state.friends.some((friend) => friend.userId === user.id))
                  .map(renderDMPerson)}
                {!state.friends.length && (
                  <p className="sidebar-small">
                    Good conversations start with a hello. Choose a person below.
                  </p>
                )}
              </div>
              <div className="channel-group">
                <div className="group-heading">
                  <span>COMMUNITY PEOPLE</span>
                </div>
                {state.users
                  .filter(
                    (user) =>
                      user.id !== state.me.id &&
                      !state.friends.some((friend) => friend.userId === user.id) &&
                      !state.blocked.some((person) => person.userId === user.id) &&
                      state.servers.some((community) => community.memberIds.includes(user.id)),
                  )
                  .map(renderDMPerson)}
              </div>
            </>
          )}
        </div>
        <footer className="user-panel">
          <button
            className="user-panel-person"
            aria-label="Edit your profile"
            onClick={() => setModal({ kind: "settings" })}
          >
            <Avatar user={state.me} size="small" />
            <span>
              <strong>{state.me.name}</strong>
              <small>
                {mode === "demo"
                  ? "Local demo"
                  : state.me.status === "dnd"
                    ? "Do not disturb"
                    : state.me.status}
              </small>
            </span>
          </button>
          <button
            className="icon-button"
            aria-label="Account settings"
            onClick={() => setModal({ kind: "settings" })}
          >
            <Settings size={19} />
          </button>
        </footer>
      </aside>

      <main className="main-workspace">
        <header className="workspace-header">
          <div className="channel-title">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu size={22} />
            </button>
            {room?.kind === "voice" ? (
              <Volume2 size={23} />
            ) : room?.kind === "dm" ? (
              <MessageCircle size={22} />
            ) : (
              <Hash size={23} />
            )}
            <h2>{peopleOpen && !server ? "Your people" : (room?.name ?? "Your space")}</h2>
            <span className="topic-divider" />
            <p>{room?.topic ?? "A little space for big ideas"}</p>
          </div>
          <div className="header-tools">
            {room?.kind !== "voice" && (
              <>
                <button
                  className={`icon-button desktop-tool ${muted.includes(room?.id ?? "") ? "active" : ""}`}
                  aria-label={
                    muted.includes(room?.id ?? "") ? "Unmute channel" : "Mute channel locally"
                  }
                  onClick={() => {
                    if (!room) return;
                    setMuted((previous) =>
                      previous.includes(room.id)
                        ? previous.filter((id) => id !== room.id)
                        : [...previous, room.id],
                    );
                    notify(
                      "Channel preference updated for this session. Push notifications are not connected yet.",
                    );
                  }}
                >
                  {muted.includes(room?.id ?? "") ? <BellOff size={19} /> : <Bell size={19} />}
                </button>
                <button
                  className={`icon-button ${savedOnly ? "active" : ""}`}
                  aria-label="Show saved messages"
                  aria-pressed={savedOnly}
                  onClick={() => setSavedOnly(!savedOnly)}
                >
                  <Bookmark size={19} />
                </button>
              </>
            )}
            <button
              className={`icon-button members-toggle ${membersOpen ? "active" : ""}`}
              aria-label="Toggle members"
              aria-expanded={membersOpen}
              onClick={() => setMembersOpen(!membersOpen)}
            >
              <Users size={21} />
            </button>
            <div className="search-box">
              <Search size={15} />
              <input
                ref={searchInput}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search"
                aria-label="Search messages"
              />
              <span>⌘ K</span>
              {search && (
                <button aria-label="Clear search" onClick={() => setSearch("")}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </header>
        <div className="workspace-body">
          <section className="conversation" aria-label="Conversation">
            <div className="workspace-status">
              <span className="status-left">
                <span className="tiny-green-dot" />
                {mode === "demo" ? "YOUR LOCAL PLAYGROUND" : "YOUR COMMUNITY SPACE"}
              </span>
              <span>
                {mode === "demo"
                  ? "Demo · changes stay in this browser"
                  : "Shared chat · refreshes every 3 seconds"}
                <Sparkles size={13} />
              </span>
            </div>
            {relay.error && (
              <div className="connection-error" role="alert">
                {relay.error}
                <button onClick={() => void relay.refresh()}>Retry</button>
              </div>
            )}
            <VoiceSession
              session={voice.session}
              visible={!peopleOpen && room?.id === voice.session?.room.id}
              onReturn={() => {
                if (!voice.session) return;
                navigateServer(voice.session.room.serverId);
                navigateRoom(voice.session.room);
              }}
              onLeave={voice.leave}
              onEnded={voice.ended}
              onError={notify}
            />
            {peopleOpen && !server ? (
              <PeopleScreen
                state={state}
                busy={relay.busy}
                dispatch={relay.dispatch}
                onProfile={(user) => setModal({ kind: "profile", user })}
                onMessage={(user) => void startDM(user)}
                notify={notify}
              />
            ) : room ? (
              room.kind === "voice" ? (
                voice.session?.room.id !== room.id && (
                  <VoiceRoom
                    room={room}
                    mode={mode}
                    busy={voice.joiningRoomId !== null}
                    error={voice.error}
                    switching={voice.session !== null}
                    onJoin={() => void voice.join(room, server?.name ?? "Community")}
                  />
                )
              ) : (
                <>
                  <MessageList
                    messages={roomMessages}
                    users={state.users}
                    me={state.me}
                    room={room}
                    search={search}
                    saved={saved}
                    savedOnly={savedOnly}
                    onReact={(message) => setModal({ kind: "react", message })}
                    onEdit={(message) => setModal({ kind: "edit", message })}
                    onDelete={(message) => setModal({ kind: "delete", message })}
                    onReply={(user) => setReply(user.username)}
                    onSave={(message) => {
                      setSaved((previous) =>
                        previous.includes(message.id)
                          ? previous.filter((id) => id !== message.id)
                          : [...previous, message.id],
                      );
                    }}
                    onUser={(user) => setModal({ kind: "profile", user })}
                    onToggleReaction={(message, emoji) => void react(message, emoji)}
                  />
                  <Composer
                    room={room}
                    busy={relay.busy}
                    reply={reply}
                    onReplyUsed={replyUsed}
                    onSend={send}
                  />
                </>
              )
            ) : (
              <div className="home-empty">
                <div className="home-empty-art">✳</div>
                <span className="eyebrow">YOUR PEOPLE, ONE PLACE</span>
                <h1>
                  Something good
                  <br />
                  starts here<span>.</span>
                </h1>
                <p>
                  Create a community, join your friends,
                  <br />
                  or start a conversation with someone new.
                </p>
                <button
                  className="primary-button"
                  onClick={() => setModal({ kind: "createServer" })}
                >
                  Create your community
                  <ArrowRight size={18} />
                </button>
                <button className="text-button" onClick={() => setModal({ kind: "join" })}>
                  Have an invite? Join a community
                </button>
              </div>
            )}
          </section>
          <aside
            className={`members-panel ${membersOpen ? "members-open" : ""}`}
            aria-label="Community members"
          >
            <div className="members-panel-heading">
              <span>THE PEOPLE MAKE THE PLACE</span>
              <button
                className="icon-button members-close"
                aria-label="Close members"
                onClick={() => setMembersOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="members-list">
              <div className="member-group-heading">
                AROUND & ABOUT <span>{onlineMembers.length}</span>
              </div>
              {onlineMembers.map(renderMember)}
              {offlineMembers.length > 0 && (
                <>
                  <div className="member-group-heading offline-heading">
                    OFFLINE <span>{offlineMembers.length}</span>
                  </div>
                  {offlineMembers.map(renderMember)}
                </>
              )}
              {mode === "demo" && (
                <p className="presence-note">
                  Demo members & availability are examples, not live users.
                </p>
              )}
            </div>
            <div className="community-card">
              <div className="community-card-symbol">✦</div>
              <span className="eyebrow">BETTER TOGETHER</span>
              <h3>
                A small space.
                <br />A big sense of belonging.
              </h3>
              <p>The best communities start with good people. Invite yours.</p>
              <button
                onClick={() =>
                  server ? setModal({ kind: "invite", server }) : setModal({ kind: "createServer" })
                }
              >
                {server ? "Share an invite" : "Create a community"}
                <ArrowRight size={15} />
              </button>
              <div className="card-squiggle" />
            </div>
            <div className="members-footer">
              <Brand />
              <span>Stay a little. Make something.</span>
            </div>
          </aside>
        </div>
      </main>
      {modal && (
        <WorkspaceDialog
          key={modal.kind}
          modal={modal}
          state={state}
          mode={mode}
          busy={relay.busy}
          dispatch={relay.dispatch}
          onClose={() => setModal(null)}
          onNavigateServer={(id) => navigateServer(id)}
          onNavigateDM={navigateDM}
          onReset={() => {
            if (modal.kind === "reset") {
              relay.reset();
              navigateServer("studio");
              setRoomId("general");
              setSaved([]);
            } else setModal({ kind: "reset" });
          }}
          onSignOut={() => {
            void authClient
              .signOut()
              .then((result) => {
                if (result.error) throw new Error(result.error.message ?? "Could not sign out");
                voice.leave();
                setModal(null);
                void relay.refresh();
              })
              .catch(() => notify("Could not sign out. Please try again."));
          }}
          notify={notify}
        />
      )}
      {helpOpen && (
        <Dialog title="About Relay" onClose={() => setHelpOpen(false)}>
          <section className="help-content">
            <Brand />
            <h2>Your people, one place.</h2>
            <p>
              Relay is an independent, Discord-inspired community app. This first version brings
              together channels, conversations, reactions, invites, and optional LiveKit voice.
            </p>
            <p>
              {mode === "demo"
                ? "You're in a local demo. Your messages and changes stay in this browser. Connect Neon for shared chat and real accounts."
                : "You're connected to shared chat. Availability is user-selected. Message updates arrive every few seconds."}
            </p>
            <p className="subtle-notice">
              Attachments, granular roles, moderation, email recovery, and push notifications are
              not included in this first release.
            </p>
            <button className="primary-button" onClick={() => setHelpOpen(false)}>
              Sounds good
              <Check size={18} />
            </button>
          </section>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Sparkles size={18} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
