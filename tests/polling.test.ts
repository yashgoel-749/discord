import test from "node:test";
import assert from "node:assert/strict";
import { RequestOrder } from "../src/lib/request-order";

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Promise is not initialized");
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test("an older response arriving last cannot replace newer visible state", async () => {
  const order = new RequestOrder();
  let displayed = "initial";
  const older = deferred<string>();
  const newer = deferred<string>();
  async function read(promise: Promise<string>) {
    const ticket = order.begin();
    const value = await promise;
    if (order.isCurrent(ticket)) displayed = value;
  }
  const first = read(older.promise);
  const second = read(newer.promise);
  newer.resolve("newer");
  await second;
  older.resolve("older");
  await first;
  assert.equal(displayed, "newer");
});
test("mutation or sign-out invalidates a read even while its body is still loading", async () => {
  const order = new RequestOrder();
  let displayed = "initial";
  const body = deferred<string>();
  const ticket = order.begin();
  const read = body.promise.then((value) => {
    if (order.isCurrent(ticket)) displayed = value;
  });
  order.invalidate();
  displayed = "mutation result";
  body.resolve("old snapshot");
  await read;
  assert.equal(displayed, "mutation result");
});
