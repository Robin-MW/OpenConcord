// Deterministic bounded stdio line framing. Input bytes are not commands.
export function createLineFramer({ maxLine, onLine, onError }) {
  if (!Number.isSafeInteger(maxLine) || maxLine < 1 ||
      typeof onLine !== "function" || typeof onError !== "function") {
    throw new TypeError("Invalid line framer configuration");
  }
  let incoming = Buffer.alloc(0);
  let discarding = false;
  return Object.freeze({
    push(chunk) {
      if (!Buffer.isBuffer(chunk)) throw new TypeError("Expected Buffer");
      let offset = 0;
      while (offset < chunk.length) {
        const end = chunk.indexOf(10, offset);
        const limit = end === -1 ? chunk.length : end;
        const part = chunk.subarray(offset, limit);
        if (!discarding) {
          if (incoming.length + part.length > maxLine + 1) {
            incoming = Buffer.alloc(0);
            discarding = true;
            onError("Message too large");
          } else {
            incoming = Buffer.concat([incoming, part]);
          }
        }
        offset = end === -1 ? chunk.length : end + 1;
        if (end !== -1) {
          if (!discarding) {
            const line = incoming.at(-1) === 13 ? incoming.subarray(0, -1) : incoming;
            if (line.length > maxLine) onError("Message too large");
            else onLine(line);
          }
          incoming = Buffer.alloc(0);
          discarding = false;
        }
      }
    }
  });
}
