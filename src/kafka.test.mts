import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { kafkaConfig } from "./kafka.mts"

const baseEnv = {
  KAFKA_BROKERS: "broker-1:9092, broker-2:9092",
  KAFKA_RAPID_TOPIC: "team.rapid",
}

test("uses Nais inline PEM credentials without treating them as paths", () => {
  const result = kafkaConfig({
    ...baseEnv,
    KAFKA_CERTIFICATE: "client certificate",
    KAFKA_PRIVATE_KEY: "client key",
    KAFKA_CA: "CA certificate",
    KAFKA_CERTIFICATE_PATH: "/nonexistent-certificate",
  })

  assert.deepEqual(result.config.brokers, ["broker-1:9092", "broker-2:9092"])
  assert.deepEqual(result.config.ssl, {
    cert: "client certificate",
    key: "client key",
    ca: ["CA certificate"],
    rejectUnauthorized: true,
  })
  assert.equal(result.topic, "team.rapid")
  assert.equal(result.groupId, "digihot-kafka-explorer")
})

test("reads Nais *_PATH variables when inline credentials are absent", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "kafka-config-"))
  t.after(() => rmSync(directory, { recursive: true }))
  const certificatePath = join(directory, "certificate")
  const privateKeyPath = join(directory, "key")
  const caPath = join(directory, "ca")
  writeFileSync(certificatePath, "certificate PEM")
  writeFileSync(privateKeyPath, "key PEM")
  writeFileSync(caPath, "CA PEM")

  const result = kafkaConfig({
    ...baseEnv,
    KAFKA_CERTIFICATE_PATH: certificatePath,
    KAFKA_PRIVATE_KEY_PATH: privateKeyPath,
    KAFKA_CA_PATH: caPath,
    KAFKA_CONSUMER_GROUP_ID: "explorer-test",
  })
  assert.deepEqual(result.config.ssl, {
    cert: "certificate PEM",
    key: "key PEM",
    ca: ["CA PEM"],
    rejectUnauthorized: true,
  })
  assert.equal(result.groupId, "explorer-test")
})

test("allows plaintext only when no Kafka TLS credentials are configured", () => {
  assert.equal(kafkaConfig(baseEnv).config.ssl, undefined)
  assert.throws(
    () => kafkaConfig({ ...baseEnv, KAFKA_CERTIFICATE: "certificate" }),
    /certificate, private key and CA/,
  )
  assert.throws(
    () => kafkaConfig({ ...baseEnv, KAFKA_PRIVATE_KEY_PATH: "/key" }),
    /certificate, private key and CA/,
  )
  assert.throws(
    () =>
      kafkaConfig({
        ...baseEnv,
        KAFKA_CERTIFICATE_PATH: "/missing",
        KAFKA_PRIVATE_KEY: "key",
        KAFKA_CA: "ca",
      }),
    /ENOENT/,
  )
})
