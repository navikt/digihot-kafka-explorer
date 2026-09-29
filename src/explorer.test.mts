import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"

test("shows only incoming messages, links consecutive services and opens the full payload", () => {
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
  assert.deepEqual([...nodes.keys()], ["service:a", "service:b", "service:c"])
  assert.deepEqual(
    [...edges.values()].map(({ source, target }) => [source, target]),
    [
      ["service:a", "service:b"],
      ["service:b", "service:c"],
    ],
  )
  elements.get("messages")!.children[0].children[0].listeners.get("click")!()
  assert.equal(
    elements.get("details")!.textContent,
    JSON.stringify(payload, null, 2),
  )
  assert.equal(elements.get("details")!.focused, true)
  listeners.get("tap:edge")!({ target: element(edges.get("message:1:1")!) })
  assert.equal(
    elements.get("details")!.textContent,
    JSON.stringify(payload, null, 2),
  )

  for (let sequence = 2; sequence <= 201; sequence++) {
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
  assert.equal(nodes.has("service:a"), false)
  stream!.onerror()
  assert.match(elements.get("status")!.textContent, /Prøver å koble til igjen/)
})
