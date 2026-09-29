import { readFileSync } from "node:fs"
import { Kafka, logLevel } from "kafkajs"
import { logger } from "./logger.mts"

function credential(value: string | undefined, path: string | undefined): string {
  if (value) return value
  if (path) return readFileSync(path, "utf8")
  throw new Error("Missing Kafka TLS credential")
}

export function kafkaConfig(env: NodeJS.ProcessEnv) {
  const brokers = env.KAFKA_BROKERS?.split(",")
    .map((broker) => broker.trim())
    .filter(Boolean)
  const topic = env.KAFKA_RAPID_TOPIC
  if (!brokers?.length || !topic) {
    throw new Error("KAFKA_BROKERS and KAFKA_RAPID_TOPIC are required")
  }

  const certificate = env.KAFKA_CERTIFICATE || env.KAFKA_CERTIFICATE_PATH
  const privateKey = env.KAFKA_PRIVATE_KEY || env.KAFKA_PRIVATE_KEY_PATH
  const ca = env.KAFKA_CA || env.KAFKA_CA_PATH
  if (
    [certificate, privateKey, ca].some(Boolean) &&
    ![certificate, privateKey, ca].every(Boolean)
  ) {
    throw new Error(
      "Kafka certificate, private key and CA must all be provided (as values or *_PATH variables)",
    )
  }

  return {
    config: {
      clientId: "digihot-kafka-explorer",
      brokers,
      logLevel: logLevel.WARN,
      logCreator: () => ({ level }: { level: logLevel }) => {
        if (level === logLevel.ERROR) {
          logger.error({ component: "kafkajs" }, "KafkaJS client log")
        } else if (level === logLevel.WARN) {
          logger.warn({ component: "kafkajs" }, "KafkaJS client log")
        } else {
          logger.info({ component: "kafkajs" }, "KafkaJS client log")
        }
      },
      ...(certificate && privateKey && ca
        ? {
            ssl: {
              cert: credential(env.KAFKA_CERTIFICATE, env.KAFKA_CERTIFICATE_PATH),
              key: credential(env.KAFKA_PRIVATE_KEY, env.KAFKA_PRIVATE_KEY_PATH),
              ca: [credential(env.KAFKA_CA, env.KAFKA_CA_PATH)],
              rejectUnauthorized: true,
            },
          }
        : {}),
    },
    groupId: env.KAFKA_CONSUMER_GROUP_ID || "digihot-kafka-explorer",
    topic,
  }
}

export function createConsumer() {
  const { config, groupId, topic } = kafkaConfig(process.env)
  const kafka = new Kafka(config)

  return {
    consumer: kafka.consumer({ groupId }),
    topic,
  }
}
