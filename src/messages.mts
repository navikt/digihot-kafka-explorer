export type Message = {
  sequence: number
  payload: Record<string, unknown>
  services: string[]
}

export function parseMessage(value: Buffer | null, sequence: number): Message {
  if (!value) {
    throw new Error("Kafka message has no value")
  }
  const parsed: unknown = JSON.parse(value.toString("utf8"))
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Kafka message must contain a JSON object")
  }

  const payload = parsed as Record<string, unknown>
  const participating = payload.system_participating_services
  const services = Array.isArray(participating)
    ? participating.flatMap((entry: unknown) => {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry))
          return []
        const service = (entry as Record<string, unknown>).service
        return typeof service === "string" && service.trim()
          ? [service.trim()]
          : []
      })
    : []

  return { sequence, payload, services }
}
