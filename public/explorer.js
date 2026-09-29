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
  const service = event.target.data("label")
  const message = [...messages.values()]
    .reverse()
    .find((item) => item.services.includes(service))
  if (message) showMessage(message)
})

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
  const name = message.payload["@event_name"]
  button.textContent =
    typeof name === "string" && name.trim()
      ? `${name} (${message.services.join(" → ") || "ingen tjenester"})`
      : `Melding ${message.sequence} (${message.services.join(" → ") || "ingen tjenester"})`
  button.addEventListener("click", () => showMessage(message))
  item.append(button)
  list.prepend(item)

  message.services.forEach((service) => {
    if (graph.getElementById(`service:${service}`).empty()) {
      graph.add({
        group: "nodes",
        data: { id: `service:${service}`, label: service },
      })
    }
  })
  for (let index = 1; index < message.services.length; index++) {
    graph.add({
      group: "edges",
      data: {
        id: `message:${message.sequence}:${index}`,
        source: `service:${message.services[index - 1]}`,
        target: `service:${message.services[index]}`,
        sequence: message.sequence,
      },
    })
  }
  if (messages.size > MAX_MESSAGES) {
    const oldest = messages.keys().next().value
    messages.delete(oldest)
    list.lastElementChild.remove()
    graph.remove(
      graph.edges().filter((edge) => edge.data("sequence") === oldest),
    )
    graph.remove(
      graph
        .nodes()
        .filter(
          (node) =>
            node.connectedEdges().empty() &&
            ![...messages.values()].some((entry) =>
              entry.services.includes(node.data("label")),
            ),
        ),
    )
  }
  if (message.services.length) {
    graph.layout({ name: "breadthfirst", directed: true, padding: 30 }).run()
  }
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
