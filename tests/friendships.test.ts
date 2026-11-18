import test from "node:test";
import assert from "node:assert/strict";
import { transitionFriendship, type FriendshipAction } from "../src/lib/friendships";
import { type Friendship } from "../src/lib/model";

const act = (action: FriendshipAction, current: Friendship | null, actorId = "a", peerId = "b") =>
  transitionFriendship({ actorId, peerId, current, action });
test("requests, duplicates, acceptance and mutual auto-accept", () => {
  const pending = act("friendRequest", null);
  assert.equal(pending?.status, "pending");
  assert.throws(() => act("friendRequest", pending), /Request already sent/);
  assert.equal(act("friendRequest", pending, "b", "a")?.status, "accepted");
  const accepted = act("friendAccept", pending, "b", "a");
  assert.equal(accepted?.status, "accepted");
  assert.throws(() => act("friendRequest", accepted), /Already friends/);
  assert.equal(act("friendRemove", accepted), null);
});
test("only the recipient can accept/decline and only the sender can cancel", () => {
  const pending = act("friendRequest", null);
  assert.throws(() => act("friendAccept", pending), /No incoming/);
  assert.throws(() => act("friendDecline", pending), /No incoming/);
  assert.throws(() => act("friendCancel", pending, "b", "a"), /No outgoing/);
  assert.equal(act("friendDecline", pending, "b", "a"), null);
  assert.equal(act("friendCancel", pending), null);
  assert.throws(() => act("friendAccept", pending, "outsider", "a"), /not yours/);
  assert.throws(() => act("friendRequest", null, "a", "a"), /yourself/);
});
test("blocking replaces requests/friendship; independent blocks cannot undo each other", () => {
  const accepted = act("friendRequest", act("friendRequest", null), "b", "a");
  const blocked = act("block", accepted);
  assert.deepEqual(blocked?.blockedBy, ["a"]);
  assert.throws(() => act("friendRequest", blocked, "b", "a"), /cannot contact/);
  assert.throws(() => act("unblock", blocked, "b", "a"), /have not blocked/);
  const both = act("block", blocked, "b", "a");
  assert.deepEqual(both?.blockedBy, ["a", "b"]);
  const stillBlocked = act("unblock", both);
  assert.equal(stillBlocked?.status, "blocked");
  assert.deepEqual(stillBlocked?.blockedBy, ["b"]);
  assert.equal(act("unblock", stillBlocked, "b", "a"), null);
  assert.deepEqual(act("block", act("block", null))?.blockedBy, ["a"]);
});
