import { ecsFormat } from "@elastic/ecs-pino-format"
import pino from "pino"

const safeErrors = new Set([
  "KAFKA_BROKERS and KAFKA_RAPID_TOPIC are required",
  "Kafka certificate, private key and CA must all be provided (as values or *_PATH variables)",
  "PORT must be an integer between 0 and 65535",
])

export function errorSummary(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown error"
  if (safeErrors.has(error.message)) return error.message
  return error.constructor.name
}

export function createLogger(destination: { write(message: string): void } = process.stdout) {
  return pino(
    {
      ...ecsFormat({ serviceName: "digihot-kafka-explorer", apmIntegration: false }),
      base: null,
    },
    destination,
  )
}

export const logger = createLogger()
