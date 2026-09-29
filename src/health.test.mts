import assert from "node:assert/strict"
import { once } from "node:events"
import test from "node:test"
import express from "express"
import { registerHealthRoutes } from "./health.mts"

test("liveness stays healthy while readiness follows Kafka state", async (t) => {
  let ready = false
  const app = express()
  registerHealthRoutes(app, () => ready)
  const server = app.listen(0, "127.0.0.1")
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  )
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Expected a TCP address")
  const baseUrl = `http://127.0.0.1:${address.port}`

  const alive = await fetch(`${baseUrl}/isalive`)
  assert.equal(alive.status, 200)
  assert.equal(alive.headers.get("cache-control"), "no-store")
  assert.equal((await fetch(`${baseUrl}/isready`)).status, 503)
  ready = true
  assert.equal((await fetch(`${baseUrl}/isready`)).status, 200)
  ready = false
  assert.equal((await fetch(`${baseUrl}/isready`)).status, 503)
  assert.equal((await fetch(`${baseUrl}/isalive`)).status, 200)
})
