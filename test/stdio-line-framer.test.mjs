import test from "node:test";
import assert from "node:assert/strict";
import { createLineFramer } from "../src/stdio-line-framer.mjs";

function harness(maxLine = 65536) {
  const lines = [], errors = [];
  const framer = createLineFramer({
    maxLine, onLine: bytes => lines.push(bytes.toString("utf8")),
    onError: code => errors.push(code)
  });
  return { framer, lines, errors };
}
test("exact-limit LF frame accepted, oversized LF denied", () => {
  const { framer, lines, errors } = harness();
  framer.push(Buffer.from("x".repeat(65536) + "\n"));
  assert.deepEqual(lines, ["x".repeat(65536)]);
  framer.push(Buffer.from("x".repeat(65537) + "\n"));
  assert.deepEqual(errors, ["Message too large"]);
});
test("exact-limit CRLF split across separate push calls is accepted", () => {
  const { framer, lines, errors } = harness();
  framer.push(Buffer.from("x".repeat(65536)));
  framer.push(Buffer.from("\r"));
  assert.equal(lines.length, 0);
  framer.push(Buffer.from("\n"));
  assert.deepEqual(lines, ["x".repeat(65536)]);
  assert.deepEqual(errors, []);
});
test("an oversized unterminated frame is dropped and next frame recovered", () => {
  const { framer, lines, errors } = harness(8);
  framer.push(Buffer.from("x".repeat(100)));
  assert.deepEqual(errors, ["Message too large"]);
  framer.push(Buffer.from("more\nOK\n"));
  assert.deepEqual(lines, ["OK"]);
});
test("multiple frames in one chunk and one frame across chunks", () => {
  const { framer, lines } = harness(8);
  framer.push(Buffer.from("A\nB\r\nC"));
  framer.push(Buffer.from("D\n"));
  assert.deepEqual(lines, ["A", "B", "CD"]);
});
