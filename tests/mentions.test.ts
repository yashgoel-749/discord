import test from "node:test";
import assert from "node:assert/strict";
import { mentionParts } from "../src/lib/mentions";
import { createDemo } from "../src/lib/demo";

test("mentions resolve usernames, retain punctuation and do not resolve emails or display names", () => {
  const users = createDemo().users;
  const parts = mentionParts(
    "Hi @MIA.CHEN. Ask @james.wilson! Email a@mia.chen, @Mia Chen, @unknown.name",
    users,
  );
  assert.deepEqual(
    parts.filter((part) => part.kind === "mention").map((part) => part.user.id),
    ["mia", "james"],
  );
  assert.equal(
    parts.map((part) => (part.kind === "text" ? part.text : `@${part.user.username}`)).join(""),
    "Hi @mia.chen. Ask @james.wilson! Email a@mia.chen, @Mia Chen, @unknown.name",
  );
});
test("invalid or partial usernames do not create mentions", () => {
  const users = createDemo().users;
  for (const text of ["@mia.chen_", "@mia..chen", "@mia.chen.extra", "@@mia.chen"])
    assert.ok(mentionParts(text, users).every((part) => part.kind === "text"));
});
