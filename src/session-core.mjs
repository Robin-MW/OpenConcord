// Synthetic protocol fixture only. No shell, network, sockets or credential handling.
export class SessionError extends Error {
  constructor(code) { super(code); this.name = "SessionError"; this.code = code; }
}
const required = (s) => {
  if (typeof s !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(s))
    throw new SessionError("INVALID_ID");
  return s;
};
export class SessionCore {
  constructor({ sessionId, ownerId, clock = () => Date.now(), leaseMs = 30000, capacity = 64, transport } = {}) {
    this.sessionId = required(sessionId);
    this.ownerId = required(ownerId);
    if (typeof clock !== "function" || !Number.isSafeInteger(leaseMs) || leaseMs < 1
      || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4096
      || typeof transport?.input !== "function") throw new SessionError("INVALID_CONFIG");
    this.clock = clock; this.leaseMs = leaseMs; this.capacity = capacity;
    this.transport = transport;
    this.clients = new Set([ownerId]);
    this.pending = new Set();
    this.controller = { actorId: ownerId, until: clock() + leaseMs };
    this.events = []; this.sequence = 0; this.receipts = new Map();
    this.emit("SESSION_CREATED", ownerId);
  }
  emit(type, actorId, details = {}) {
    const item = Object.freeze({ sequence: ++this.sequence, type, actorId, ...details });
    this.events.push(item);
    if (this.events.length > this.capacity) this.events.shift();
    return item;
  }
  attach(actorId) {
    required(actorId); this.clients.add(actorId);
    this.emit("ATTACHED", actorId);
    return this.snapshot(actorId, this.sequence - 1);
  }
  snapshot(actorId, after = 0) {
    required(actorId);
    if (!this.clients.has(actorId)) throw new SessionError("NOT_ATTACHED");
    if (!Number.isSafeInteger(after) || after < 0 || after > this.sequence)
      throw new SessionError("INVALID_CURSOR");
    const oldest = this.events[0]?.sequence ?? this.sequence + 1;
    return Object.freeze({ sessionId: this.sessionId, sequence: this.sequence,
      gap: after < oldest - 1, events: this.events.filter(e => e.sequence > after),
      controller: this.activeController() });
  }
  activeController() {
    if (this.controller && this.controller.until <= this.clock()) this.controller = null;
    return this.controller ? Object.freeze({ ...this.controller }) : null;
  }
  requestControl(actorId) {
    this.requireAttached(actorId);
    this.pending.add(actorId); this.emit("CONTROL_REQUESTED", actorId);
  }
  grantControl(actorId, targetId) {
    this.requireAttached(actorId); this.requireAttached(targetId);
    if (actorId !== this.ownerId && this.activeController()?.actorId !== actorId)
      throw new SessionError("NOT_AUTHORIZED");
    if (!this.pending.has(targetId)) throw new SessionError("NO_REQUEST");
    this.pending.delete(targetId);
    this.controller = { actorId: targetId, until: this.clock() + this.leaseMs };
    this.emit("CONTROL_GRANTED", actorId, { targetId });
  }
  releaseControl(actorId) {
    this.requireAttached(actorId);
    if (actorId !== this.ownerId && this.activeController()?.actorId !== actorId)
      throw new SessionError("NOT_AUTHORIZED");
    this.controller = null;
    this.emit("CONTROL_RELEASED", actorId);
  }
  revoke(actorId, targetId) {
    this.requireAttached(actorId); required(targetId);
    if (actorId !== this.ownerId) throw new SessionError("NOT_AUTHORIZED");
    this.pending.delete(targetId);
    if (this.controller?.actorId === targetId) this.controller = null;
    this.clients.delete(targetId);
    this.emit("REVOKED", actorId, { targetId });
  }
  async input(actorId, requestId, text) {
    this.requireAttached(actorId); required(requestId);
    if (typeof text !== "string" || text.length === 0 || text.length > 4096)
      throw new SessionError("INVALID_INPUT");
    const key = actorId + ":" + requestId;
    if (this.receipts.has(key)) {
      const prior = this.receipts.get(key);
      if (prior.text !== text) throw new SessionError("REPLAY_PAYLOAD_MISMATCH");
      return Object.freeze({ ...prior.receipt, replayed: true });
    }
    if (this.activeController()?.actorId !== actorId) throw new SessionError("NOT_CONTROLLER");
    // Fence synchronous input attempts; the injected transport is fake in M1.
    const receipt = Object.freeze({ requestId, actorId, sessionId: this.sessionId,
      sequence: this.sequence + 1, replayed: false });
    this.receipts.set(key, { text, receipt });
    try { await this.transport.input(text); }
    catch (error) {
      this.emit("INPUT_UNCERTAIN", actorId, { requestId });
      throw new SessionError("INPUT_UNCERTAIN_NO_RETRY");
    }
    this.emit("INPUT_ACCEPTED", actorId, { requestId }); // Never put input text in events.
    return receipt;
  }
  requireAttached(actorId) {
    required(actorId);
    if (!this.clients.has(actorId)) throw new SessionError("NOT_ATTACHED");
  }
}
