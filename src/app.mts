import express from "express"
import { fileURLToPath } from "node:url"
import { registerHealthRoutes } from "./health.mts"
import { createConsumer } from "./kafka.mts"
import { errorSummary, logger } from "./logger.mts"
import { isExcludedMessage, parseMessage, type Message } from "./messages.mts"

const MAX_MESSAGE_BYTES = 1_000_000
const clients = new Set<express.Response>()
let sequence = 0
let kafkaReady = false

function send(
  response: express.Response,
  event: string,
  data: unknown,
): boolean {
  if (
    response.destroyed ||
    response.writableEnded ||
    response.writableLength > 2 * MAX_MESSAGE_BYTES
  ) {
    response.end()
    clients.delete(response)
    return false
  }
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  return true
}

const app = express()
app.disable("x-powered-by")
registerHealthRoutes(app, () => kafkaReady)
app.use(express.static(fileURLToPath(new URL("../public/", import.meta.url))))

app.get("/events", (_request, response) => {
  response.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Content-Type-Options": "nosniff",
  })
  response.flushHeaders()
  clients.add(response)
  response.on("close", () => clients.delete(response))
})

const heartbeat = setInterval(() => {
  for (const client of clients) {
    if (
      client.destroyed ||
      client.writableEnded ||
      client.writableLength > 2 * MAX_MESSAGE_BYTES
    ) {
      client.end()
      clients.delete(client)
    } else {
      client.write(": heartbeat\n\n")
    }
  }
}, 15_000)

async function main() {
  const { consumer, topic } = createConsumer()
  consumer.on(consumer.events.GROUP_JOIN, () => {
    kafkaReady = true
    logger.info("Kafka consumer joined group")
  })
  for (const event of [
    consumer.events.REBALANCING,
    consumer.events.CRASH,
    consumer.events.DISCONNECT,
  ]) {
    consumer.on(event, () => {
      kafkaReady = false
      logger.warn({ event }, "Kafka consumer unavailable")
    })
  }
  await consumer.connect()
  try {
    await consumer.subscribe({ topic, fromBeginning: false })
    await consumer.run({
      eachMessage: async ({ message, partition }) => {
        if (message.value && message.value.length > MAX_MESSAGE_BYTES) {
          logger.warn({ partition, offset: message.offset }, "Skipped Kafka message exceeding size limit")
          return
        }
        let parsed: Message
        try {
          parsed = parseMessage(message.value, ++sequence)
        } catch (error) {
          if (
            error instanceof SyntaxError ||
            (error instanceof Error &&
              error.message.startsWith("Kafka message"))
          ) {
            logger.warn({ partition, offset: message.offset }, "Skipped invalid Kafka JSON message")
            return
          }
          throw error
        }
        if (isExcludedMessage(parsed)) return
        for (const client of clients) send(client, "message", parsed)
      },
    })
  } catch (error) {
    await consumer.disconnect()
    throw error
  }

  const port = Number(process.env.PORT || 3000)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    await consumer.disconnect()
    throw new Error("PORT must be an integer between 0 and 65535")
  }
  const host = process.env.HOST || "127.0.0.1"
  const server = app.listen(port, host, () => {
    logger.info({ port }, "Kafka explorer listening")
  })
  server.on("error", (error) => {
    logger.error({ error_type: errorSummary(error) }, "HTTP server failed")
    void consumer.disconnect()
    process.exitCode = 1
  })

  async function shutdown() {
    kafkaReady = false
    clearInterval(heartbeat)
    for (const client of clients) client.end()
    clients.clear()
    await consumer.disconnect()
    server.close()
  }
  process.once("SIGINT", () => void shutdown())
  process.once("SIGTERM", () => void shutdown())
}

main().catch((error: unknown) => {
  clearInterval(heartbeat)
  logger.error({ error_type: errorSummary(error) }, "Kafka explorer failed to start")
  process.exitCode = 1
})
