import assert from "node:assert/strict"
import test from "node:test"
import { createLogger, errorSummary } from "./logger.mts"

test("Pino writes ECS-compatible JSON lines", () => {
  const lines: string[] = []
  const logger = createLogger({
    write: (line) => {
      lines.push(line)
    },
  })
  logger.warn({ partition: 2, offset: "15" }, "Skipped invalid Kafka JSON message")

  assert.equal(lines.length, 1)
  assert.equal(lines[0].endsWith("\n"), true)
  const entry = JSON.parse(lines[0])
  assert.match(entry["@timestamp"], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
  assert.equal(entry["log.level"], "warn")
  assert.equal(entry["service.name"], "digihot-kafka-explorer")
  assert.equal(entry["event.dataset"], "digihot-kafka-explorer")
  assert.equal(typeof entry["ecs.version"], "string")
  assert.equal(entry["host.hostname"], undefined)
  assert.equal(entry["process.pid"], undefined)
  assert.equal(entry.message, "Skipped invalid Kafka JSON message")
  assert.equal(entry.partition, 2)
  assert.equal(entry.offset, "15")
})

test("does not expose arbitrary error messages or stacks", () => {
  const error = new Error("credential and sensitive payload")
  assert.equal(errorSummary(error), "Error")
  const lines: string[] = []
  const logger = createLogger({
    write: (line) => {
      lines.push(line)
    },
  })
  logger.error({ error_type: errorSummary(error) }, "Kafka explorer failed to start")
  assert.equal(lines[0].includes("credential and sensitive payload"), false)
  assert.equal(lines[0].includes("stack"), false)
  assert.equal(
    errorSummary(new Error("KAFKA_BROKERS and KAFKA_RAPID_TOPIC are required")),
    "KAFKA_BROKERS and KAFKA_RAPID_TOPIC are required",
  )
  assert.equal(errorSummary("private data"), "Unknown error")
})
