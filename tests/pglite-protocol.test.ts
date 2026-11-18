import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { prepareSocketProtocol } from "../scripts/pglite-protocol";

function message(type: string, body: Buffer) {
  const header = Buffer.alloc(5);
  header.write(type);
  header.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([header, body]);
}

test("socket SQL errors emit ReadyForQuery only at Sync, not before rollback", async () => {
  const db = await PGlite.create();
  try {
    await db.exec("CREATE TABLE example(id int PRIMARY KEY); INSERT INTO example VALUES(1)");
    prepareSocketProtocol(db);
    const requests = [
      message(
        "P",
        Buffer.concat([Buffer.from("\0INSERT INTO example VALUES(1)\0"), Buffer.alloc(2)]),
      ),
      message("B", Buffer.alloc(8)),
      message("E", Buffer.alloc(5)),
      message("S", Buffer.alloc(0)),
    ];
    const responses: string[][] = [];
    for (const request of requests) {
      const types: string[] = [];
      await db.execProtocolRawStream(request, {
        onRawData(data) {
          for (let offset = 0; offset < data.length;) {
            types.push(String.fromCharCode(data[offset]));
            offset += 1 + new DataView(data.buffer, data.byteOffset + offset + 1, 4).getInt32(0);
          }
        },
      });
      responses.push(types);
    }
    assert.deepEqual(responses, [["1"], ["2"], ["E"], ["Z"]]);
  } finally {
    await db.close();
  }
});
