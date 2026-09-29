import assert from "node:assert/strict"
import test from "node:test"
import { parseMessage } from "./messages.mts"

test("extracts ordered services and preserves the complete message", () => {
  const payload = {
    "@id": "event-1",
    system_participating_services: [
      { service: " sender " },
      { service: "receiver" },
      { service: "" },
      { instance: "unknown" },
    ],
  }
  const parsed = parseMessage(Buffer.from(JSON.stringify(payload)), 7)

  assert.deepEqual(parsed, {
    sequence: 7,
    payload,
    services: ["sender", "receiver"],
  })
})

test("rejects messages without JSON objects", () => {
  assert.throws(() => parseMessage(null, 1), /no value/)
  assert.throws(() => parseMessage(Buffer.from("[]"), 1), /JSON object/)
  assert.throws(() => parseMessage(Buffer.from("{"), 1), SyntaxError)
})
