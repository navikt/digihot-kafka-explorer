import assert from "node:assert/strict"
import test from "node:test"
import { isExcludedMessage, parseMessage } from "./messages.mts"

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

test("excludes dp-rapidhose system events and hm-bigquery-sink-hendelse", () => {
  for (const eventName of [
    "app_status",
    "ping",
    "pong",
    "application_ready",
    "application_stop",
    "application_up",
    "application_down",
    "application_not_ready",
    "aktivitetslogg",
    "hm-bigquery-sink-hendelse",
  ]) {
    const message = parseMessage(
      Buffer.from(JSON.stringify({ "@event_name": eventName })),
      1,
    )
    assert.equal(isExcludedMessage(message), true, eventName)
  }
})

test("keeps ordinary and unnamed messages", () => {
  for (const payload of [
    { "@event_name": "behov" },
    { "@event_name": "søknad_innsendt" },
    { "@event_name": "hm-bigquery-sink-hendelse-2" },
    { "@event_name": 123 },
    {},
  ]) {
    const message = parseMessage(Buffer.from(JSON.stringify(payload)), 1)
    assert.equal(isExcludedMessage(message), false, JSON.stringify(payload))
  }
})

test("filters eventName when @event_name is missing or invalid", () => {
  for (const payload of [
    { eventName: "hm-bigquery-sink-hendelse" },
    { "@event_name": "", eventName: "application_ready" },
    { "@event_name": null, eventName: "ping" },
  ]) {
    const message = parseMessage(Buffer.from(JSON.stringify(payload)), 1)
    assert.equal(isExcludedMessage(message), true)
  }

  const message = parseMessage(
    Buffer.from(
      JSON.stringify({
        "@event_name": "søknad_innsendt",
        eventName: "hm-bigquery-sink-hendelse",
      }),
    ),
    1,
  )
  assert.equal(isExcludedMessage(message), false)
})
