import type { PGlite } from "@electric-sql/pglite";

export function prepareSocketProtocol(db: PGlite) {
  const execute = db.execProtocolRawStream.bind(db);
  db.execProtocolRawStream = async (message, options) => {
    await execute(message, {
      ...options,
      onRawData(data) {
        // PGlite 0.4.6 emits an extra ReadyForQuery on failed Execute, before Sync.
        if (message[0] === 69 && data.length === 6 && data[0] === 90) return;
        options.onRawData?.(data);
      },
    });
  };
}
