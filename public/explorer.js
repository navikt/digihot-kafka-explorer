const MAX_MESSAGES = 200
const connectionStatus = document.getElementById("status")
const list = document.getElementById("messages")
const details = document.getElementById("details")
const messages = new Map()
const graph = cytoscape({
  container: document.getElementById("diagram"),
  style: [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "background-color": "#005b82",
        color: "#1b1b1b",
        "text-valign": "bottom",
        "text-margin-y": 8,
        "font-size": 13,
      },
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": "#005b82",
        "target-arrow-color": "#005b82",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
      },
    },
    {
      selector: 'node[type="message"]',
      style: {
        shape: "round-rectangle",
        "background-color": "#e6f5ed",
        "border-width": 2,
        "border-color": "#06893a",
        "text-wrap": "wrap",
        "text-max-width": 150,
      },
    },
    {
      selector: 'node[type="need"]',
      style: {
        shape: "ellipse",
        "background-color": "#fff2df",
        "border-width": 2,
        "border-color": "#b35c00",
        "text-wrap": "wrap",
        "text-max-width": 150,
      },
    },
    {
      selector: 'edge[type="cause"]',
      style: {
        "line-style": "dashed",
        "line-color": "#b35c00",
        "target-arrow-color": "#b35c00",
      },
    },
  ],
})

function showMessage(message) {
  details.textContent = JSON.stringify(message.payload, null, 2)
  details.focus()
}

graph.on("tap", "edge", (event) => {
  const message = messages.get(event.target.data("sequence"))
  if (message) showMessage(message)
})

graph.on("tap", "node", (event) => {
  const sequence = event.target.data("sequence")
  if (sequence !== undefined) {
    const message = messages.get(sequence)
    if (message) showMessage(message)
    return
  }
  const service = event.target.data("label")
  const message = [...messages.values()]
    .reverse()
    .find((item) => item.services.includes(service))
  if (message) showMessage(message)
})

function messageId(message) {
  const primary = message.payload["@id"]
  const id =
    typeof primary === "string" && primary.trim()
      ? primary
      : message.payload.eventId
  return typeof id === "string" && id.trim() ? id : null
}

function eventName(message) {
  const primary = message.payload["@event_name"]
  const name =
    typeof primary === "string" && primary.trim()
      ? primary
      : message.payload.eventName
  return typeof name === "string" && name.trim() ? name : null
}

function refreshCauses() {
  graph.remove(graph.edges().filter((edge) => edge.data("type") === "cause"))
  const byId = new Map()
  for (const message of messages.values()) {
    const id = messageId(message)
    if (id) {
      if (!byId.has(id)) byId.set(id, [])
      byId.get(id).push(message.sequence)
    }
  }
  for (const message of messages.values()) {
    const cause = message.payload["@forårsaket_av"]
    if (!cause || typeof cause !== "object" || Array.isArray(cause)) continue
    const candidates = byId.get(cause.id)
    const parent =
      candidates?.findLast((sequence) => sequence < message.sequence) ??
      candidates?.find((sequence) => sequence !== message.sequence)
    if (parent === undefined || parent === message.sequence) continue
    graph.add({
      group: "edges",
      data: {
        id: `cause:${message.sequence}`,
        source: `message:${parent}`,
        target: `message:${message.sequence}`,
        sequence: message.sequence,
        type: "cause",
      },
    })
  }
}

function addMessage(message) {
  if (
    !Number.isSafeInteger(message?.sequence) ||
    !message.payload ||
    typeof message.payload !== "object" ||
    Array.isArray(message.payload) ||
    !Array.isArray(message.services) ||
    !message.services.every(
      (service) => typeof service === "string" && service.length > 0,
    )
  ) {
    connectionStatus.textContent = "Mottok en ugyldig melding fra serveren."
    return
  }

  messages.set(message.sequence, message)
  const item = document.createElement("li")
  const button = document.createElement("button")
  button.type = "button"
  const name = eventName(message)
  button.textContent =
    name
      ? `${name} (${message.services.join(" → ") || "ingen tjenester"})`
      : `Melding ${message.sequence} (${message.services.join(" → ") || "ingen tjenester"})`
  button.addEventListener("click", () => showMessage(message))
  item.append(button)
  list.prepend(item)

  const needs = message.payload["@behov"]
  const needNames = Array.isArray(needs)
    ? needs.filter((need) => typeof need === "string" && need.trim())
    : []
  const solutions = message.payload["@løsning"]
  const solvedNames =
    solutions && typeof solutions === "object" && !Array.isArray(solutions)
      ? Object.keys(solutions).filter((need) => needNames.includes(need))
      : []
  const label =
    needNames.length > 0
      ? `Behov: ${needNames.join(", ")}${solvedNames.length ? `\nLøst: ${solvedNames.join(", ")}` : ""}`
      : name
        ? `Hendelse: ${name}`
        : `Melding ${message.sequence}`
  graph.add({
    group: "nodes",
    data: {
      id: `message:${message.sequence}`,
      label,
      sequence: message.sequence,
      type: needNames.length > 0 ? "need" : "message",
    },
  })
  message.services.forEach((service) => {
    if (graph.getElementById(`service:${service}`).empty()) {
      graph.add({
        group: "nodes",
        data: { id: `service:${service}`, label: service },
      })
    }
  })
  message.services.forEach((service, index) => {
    graph.add({
      group: "edges",
      data: {
        id: `message:${message.sequence}:${index}`,
        source: index === 0 ? `service:${service}` : `message:${message.sequence}`,
        target: index === 0 ? `message:${message.sequence}` : `service:${service}`,
        sequence: message.sequence,
      },
    })
  })
  if (messages.size > MAX_MESSAGES) {
    const oldest = messages.keys().next().value
    messages.delete(oldest)
    list.lastElementChild.remove()
    graph.remove(
      graph.edges().filter((edge) => edge.data("sequence") === oldest),
    )
    graph.remove(graph.getElementById(`message:${oldest}`))
  }
  refreshCauses()
  if (messages.size === MAX_MESSAGES) {
    graph.remove(
      graph
        .nodes()
        .filter(
          (node) =>
            node.data("sequence") === undefined &&
            node.connectedEdges().empty() &&
            ![...messages.values()].some((entry) =>
              entry.services.includes(node.data("label")),
            ),
        ),
    )
  }
  graph.layout({ name: "breadthfirst", directed: true, padding: 30 }).run()
}

const events = new EventSource("/events")
events.onopen = () => {
  connectionStatus.textContent = "Tilkoblet. Venter på nye meldinger."
}
events.onerror = () => {
  connectionStatus.textContent = "Forbindelsen er brutt. Prøver å koble til igjen."
}
events.addEventListener("message", (event) => {
  let message
  try {
    message = JSON.parse(event.data)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    connectionStatus.textContent = "Mottok ugyldig JSON fra serveren."
    return
  }
  addMessage(message)
})
