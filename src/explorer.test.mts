import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"

test("draws producers, readers and message causes, and opens the full payload", () => {
  const elements = new Map<string, FakeElement>()
  class FakeElement {
    textContent = ""
    type = ""
    children: FakeElement[] = []
    listeners = new Map<string, () => void>()
    focused = false

    append(child: FakeElement) {
      this.children.push(child)
    }

    prepend(child: FakeElement) {
      this.children.unshift(child)
    }

    get lastElementChild() {
      const parent = this
      return {
        remove() {
          parent.children.pop()
        },
      }
    }

    addEventListener(name: string, listener: () => void) {
      this.listeners.set(name, listener)
    }

    focus() {
      this.focused = true
    }
  }

  type GraphElement = {
    data: (key: string) => unknown
    connectedEdges: () => Collection
  }
  type Collection = GraphElement[] & { empty: () => boolean }
  const nodes = new Map<string, Record<string, unknown>>()
  const edges = new Map<string, Record<string, unknown>>()
  const listeners = new Map<string, (event: { target: GraphElement }) => void>()
  function collection(values: GraphElement[]): Collection {
    return Object.assign(values, { empty: () => values.length === 0 })
  }
  function element(data: Record<string, unknown>): GraphElement {
    return {
      data: (key) => data[key],
      connectedEdges: () =>
        collection(
          [...edges.values()]
            .filter(
              (edge) => edge.source === data.id || edge.target === data.id,
            )
            .map(element),
        ),
    }
  }
  const graph = {
    getElementById: (id: string) =>
      collection(nodes.has(id) ? [element(nodes.get(id)!)] : []),
    add: ({
      group,
      data,
    }: {
      group: string
      data: Record<string, unknown>
    }) => {
      ;(group === "nodes" ? nodes : edges).set(data.id as string, data)
    },
    edges: () => collection([...edges.values()].map(element)),
    nodes: () => collection([...nodes.values()].map(element)),
    remove: (items: GraphElement[]) => {
      for (const item of items) {
        nodes.delete(item.data("id") as string)
        edges.delete(item.data("id") as string)
      }
    },
    layout: () => ({ run: () => {} }),
    on: (
      name: string,
      selector: string,
      listener: (event: { target: GraphElement }) => void,
    ) => listeners.set(`${name}:${selector}`, listener),
  }
  let stream: {
    onopen: () => void
    onerror: () => void
    listeners: Map<string, (event: { data: string }) => void>
  }
  class FakeEventSource {
    listeners = new Map<string, (event: { data: string }) => void>()
    onopen = () => {}
    onerror = () => {}

    constructor(url: string) {
      assert.equal(url, "/events")
      stream = this
    }

    addEventListener(
      name: string,
      listener: (event: { data: string }) => void,
    ) {
      this.listeners.set(name, listener)
    }
  }
  const script = readFileSync(
    new URL("../public/explorer.js", import.meta.url),
    "utf8",
  )
  runInNewContext(script, {
    document: {
      getElementById: (id: string) => {
        if (!elements.has(id)) elements.set(id, new FakeElement())
        return elements.get(id)
      },
      createElement: () => new FakeElement(),
    },
    cytoscape: () => graph,
    EventSource: FakeEventSource,
  })

  assert.equal(elements.get("messages")!.children.length, 0)
  stream!.onopen()
  assert.match(elements.get("status")!.textContent, /Tilkoblet/)
  const payload = {
    "@id": "first",
    system_participating_services: [
      { service: "a" },
      { service: "b" },
      { service: "c" },
    ],
  }
  stream!.listeners.get("message")!({
    data: JSON.stringify({ sequence: 1, payload, services: ["a", "b", "c"] }),
  })
  assert.deepEqual([...nodes.keys()], [
    "message:1",
    "service:a",
    "service:b",
    "service:c",
  ])
  assert.deepEqual(
    [...edges.values()].map(({ source, target }) => [source, target]),
    [
      ["service:a", "message:1"],
      ["message:1", "service:b"],
      ["message:1", "service:c"],
    ],
  )
  elements.get("messages")!.children[0].children[0].listeners.get("click")!()
  assert.equal(
    elements.get("details")!.textContent,
    JSON.stringify(payload, null, 2),
  )
  assert.equal(elements.get("details")!.focused, true)
  listeners.get("tap:node")!({ target: element(nodes.get("message:1")!) })
  assert.equal(
    elements.get("details")!.textContent,
    JSON.stringify(payload, null, 2),
  )

  const child = {
    "@id": "second",
    "@event_name": "behov",
    "@behov": ["Dokument"],
    "@løsning": { Dokument: { status: "ok" } },
    "@forårsaket_av": { id: "first", event_name: "first_event" },
  }
  stream!.listeners.get("message")!({
    data: JSON.stringify({ sequence: 2, payload: child, services: ["b", "c"] }),
  })
  assert.equal(nodes.get("message:2")!.label, "Behov: Dokument\nLøst: Dokument")
  assert.equal(nodes.get("message:2")!.type, "need")
  assert.deepEqual(
    [edges.get("cause:2")!.source, edges.get("cause:2")!.target],
    ["message:1", "message:2"],
  )
  listeners.get("tap:edge")!({ target: element(edges.get("cause:2")!) })
  assert.equal(elements.get("details")!.textContent, JSON.stringify(child, null, 2))

  stream!.listeners.get("message")!({
    data: JSON.stringify({
      sequence: 3,
      payload: { "@id": "third", "@forårsaket_av": { id: "fourth" } },
      services: [],
    }),
  })
  assert.equal(edges.has("cause:3"), false)
  stream!.listeners.get("message")!({
    data: JSON.stringify({
      sequence: 4,
      payload: { "@id": "fourth", "@event_name": "complete" },
      services: ["c"],
    }),
  })
  assert.equal(nodes.get("message:4")!.label, "Hendelse: complete")
  assert.deepEqual(
    [edges.get("message:4:0")!.source, edges.get("message:4:0")!.target],
    ["service:c", "message:4"],
  )
  assert.deepEqual(
    [edges.get("cause:3")!.source, edges.get("cause:3")!.target],
    ["message:4", "message:3"],
  )

  stream!.listeners.get("message")!({
    data: JSON.stringify({
      sequence: 5,
      payload: { "@id": "first" },
      services: ["b"],
    }),
  })
  assert.equal(edges.get("cause:2")!.source, "message:1")
  stream!.listeners.get("message")!({
    data: JSON.stringify({ sequence: 6, payload: {}, services: [] }),
  })
  assert.equal(nodes.get("message:6")!.label, "Melding 6")

  for (let sequence = 7; sequence <= 206; sequence++) {
    stream!.listeners.get("message")!({
      data: JSON.stringify({
        sequence,
        payload: { sequence },
        services: ["b", "c"],
      }),
    })
  }
  assert.equal(elements.get("messages")!.children.length, 200)
  assert.equal(edges.has("message:1:1"), false)
  assert.equal(edges.has("cause:2"), false)
  assert.equal(edges.has("cause:3"), false)
  assert.equal(nodes.has("message:1"), false)
  assert.equal(nodes.has("service:a"), false)
  assert.equal(nodes.has("message:206"), true)
  stream!.onerror()
  assert.match(elements.get("status")!.textContent, /Prøver å koble til igjen/)
})
