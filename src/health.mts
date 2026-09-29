import type { Express } from "express"

export function registerHealthRoutes(app: Express, isReady: () => boolean) {
  app.get("/isalive", (_request, response) => {
    response.set("Cache-Control", "no-store").sendStatus(200)
  })
  app.get("/isready", (_request, response) => {
    response.set("Cache-Control", "no-store").sendStatus(isReady() ? 200 : 503)
  })
}
