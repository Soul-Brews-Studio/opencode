import { InputRenderable, TextAttributes, BoxRenderable, type ParsedKey } from "@opentui/core"
import { createEffect, createMemo, createResource, For, Match, onMount, Switch } from "solid-js"

import { useLocal } from "../context/local"
import { Theme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { SplitBorder } from "./border"
import { useSDK } from "../context/sdk"
import { useRoute } from "../context/route"
import { useSync } from "../context/sync"
import { Identifier } from "../../../../id/id"
import { createStore, produce } from "solid-js/store"
import type { FilePart } from "@opencode-ai/sdk"
import fuzzysort from "fuzzysort"

export type PromptProps = {
  sessionID?: string
}

type Prompt = {
  input: string
  parts: Omit<FilePart, "id" | "messageID" | "sessionID">[]
}

export function Prompt(props: PromptProps) {
  let input: InputRenderable
  let anchor: BoxRenderable
  let autocomplete: AutocompleteRef

  const dialog = useDialog()
  const local = useLocal()
  const sdk = useSDK()
  const route = useRoute()
  const sync = useSync()

  const [store, setStore] = createStore<Prompt>({
    input: "",
    parts: [],
  })

  const messages = createMemo(() => {
    if (!props.sessionID) return []
    return sync.data.message[props.sessionID] ?? []
  })
  const working = createMemo(() => {
    const last = messages()[messages().length - 1]
    if (!last) return false
    if (last.role === "user") return true
    return !last.time.completed
  })

  createEffect(() => {
    if (dialog.stack.length === 0 && input) input.focus()
    if (dialog.stack.length > 0) input.blur()
  })

  return (
    <>
      <Autocomplete
        ref={(r) => (autocomplete = r)}
        anchor={() => anchor}
        input={() => input}
        setPrompt={(cb) => {
          setStore(produce(cb))
          input.cursorPosition = store.input.length
        }}
        value={store.input}
      />
      <box ref={(r) => (anchor = r)}>
        <box flexDirection="row" {...SplitBorder}>
          <box backgroundColor={Theme.backgroundElement} width={3} justifyContent="center" alignItems="center">
            <text attributes={TextAttributes.BOLD} fg={Theme.primary}>
              {">"}
            </text>
          </box>
          <box paddingTop={1} paddingBottom={2} backgroundColor={Theme.backgroundElement} flexGrow={1}>
            <input
              onInput={(value) => {
                let diff = value.length - store.input.length
                setStore(
                  produce((draft) => {
                    draft.input = value
                    for (let i = 0; i < draft.parts.length; i++) {
                      const part = draft.parts[i]
                      if (!part.source) continue
                      if (part.source.text.start >= input.cursorPosition) {
                        part.source.text.start += diff
                        part.source.text.end += diff
                      }
                      const sliced = draft.input.slice(part.source.text.start, part.source.text.end)
                      if (sliced != part.source.text.value && diff < 0) {
                        diff -= part.source.text.value.length
                        draft.input =
                          draft.input.slice(0, part.source.text.start) + draft.input.slice(part.source.text.end)
                        draft.parts.splice(i, 1)
                        input.cursorPosition = Math.max(0, part.source.text.start - 1)
                        i--
                      }
                    }
                  }),
                )
                autocomplete.onInput(value)
              }}
              value={store.input}
              onKeyDown={(e) => {
                autocomplete.onKeyDown(e)
                const old = input.cursorPosition
                setTimeout(() => {
                  const position = input.cursorPosition
                  const direction = Math.sign(old - position)
                  for (const part of store.parts) {
                    if (part.source && part.source.type === "file") {
                      if (position >= part.source.text.start && position < part.source.text.end) {
                        if (direction === 1) {
                          input.cursorPosition = Math.max(0, part.source.text.start - 1)
                        }
                        if (direction === -1) {
                          input.cursorPosition = part.source.text.end
                        }
                      }
                    }
                  }
                }, 0)
              }}
              onSubmit={async () => {
                if (autocomplete.visible) return
                if (!store.input) return
                const sessionID = props.sessionID
                  ? props.sessionID
                  : await (async () => {
                      const sessionID = await sdk.session.create({}).then((x) => x.data!.id)
                      route.navigate({
                        type: "session",
                        sessionID,
                      })
                      return sessionID
                    })()
                const messageID = Identifier.ascending("message")
                const input = store.input
                const parts = store.parts
                setStore({
                  input: "",
                  parts: [],
                })
                await sdk.session.prompt({
                  path: {
                    id: sessionID,
                  },
                  body: {
                    ...local.model.current(),
                    messageID,
                    agent: local.agent.current().name,
                    model: local.model.current(),
                    parts: [
                      {
                        id: Identifier.ascending("part"),
                        type: "text",
                        text: input,
                      },
                      ...parts.map((x) => ({
                        id: Identifier.ascending("part"),
                        ...x,
                      })),
                    ],
                  },
                })
              }}
              ref={(r) => (input = r)}
              onMouseDown={(r) => r.target?.focus()}
              focusedBackgroundColor={Theme.backgroundElement}
              cursorColor={Theme.primary}
              backgroundColor={Theme.backgroundElement}
            />
          </box>
          <box backgroundColor={Theme.backgroundElement} width={1} justifyContent="center" alignItems="center"></box>
        </box>
        <box paddingLeft={2} paddingRight={1} flexDirection="row" justifyContent="space-between">
          <Switch>
            <Match when={working()}>
              <text>working...</text>
            </Match>
            <Match when={true}>
              <text>
                enter <span style={{ fg: Theme.textMuted }}>send</span>
              </text>
            </Match>
          </Switch>
          <text>
            <span style={{ fg: Theme.textMuted }}>{local.model.parsed().provider}</span>{" "}
            <span style={{ bold: true }}>{local.model.parsed().model}</span>
          </text>
        </box>
      </box>
    </>
  )
}

type AutocompleteRef = {
  onInput: (value: string) => void
  onKeyDown: (e: ParsedKey) => void
  visible: boolean
}

function Autocomplete(props: {
  value: string
  setPrompt: (input: (prompt: Prompt) => void) => void
  anchor: () => BoxRenderable
  input: () => InputRenderable
  ref: (ref: AutocompleteRef) => void
}) {
  const sdk = useSDK()
  const [store, setStore] = createStore({
    index: 0,
    selected: 0,
    visible: false,
    position: { x: 0, y: 0, width: 0 },
  })
  const filter = createMemo(() => {
    if (!store.visible) return ""
    return props.value.substring(store.index + 1)
  })

  const [files] = createResource(
    () => [filter()],
    async () => {
      if (!store.visible) return []
      const result = await sdk.find.files({
        query: {
          query: filter(),
        },
      })
      if (result.error) return []
      return result.data ?? []
    },
    {
      initialValue: [],
    },
  )

  const options = createMemo(() => {
    const mixed = [...files().map((x) => ({ type: "file", value: x }))]
    const result = fuzzysort.go(filter(), mixed, {
      keys: ["value"],
    })
    return result.map((arr) => arr.obj)
  })

  createEffect(() => {
    filter()
    setStore("selected", 0)
  })

  function move(direction: -1 | 1) {
    if (!store.visible) return
    let next = store.selected + direction
    if (next < 0) next = files().length - 1
    if (next >= files().length) next = 0
    setStore("selected", next)
  }

  function show() {
    setStore({
      visible: true,
      index: props.input().cursorPosition,
      position: {
        x: props.anchor().x,
        y: props.anchor().y,
        width: props.anchor().width,
      },
    })
  }

  function hide() {
    setStore("visible", false)
  }

  onMount(() => {
    props.ref({
      get visible() {
        return store.visible
      },
      onInput(value: string) {
        if (value.length <= store.index) hide()
      },
      onKeyDown(e: ParsedKey) {
        if (store.visible) {
          if (e.name === "up") move(-1)
          if (e.name === "down") move(1)
          if (e.name === "escape") hide()
          if (e.name === "return") {
            const file = files()[store.selected]
            if (!file) return
            const part: Prompt["parts"][number] = {
              type: "file",
              mime: "text/plain",
              filename: file,
              url: `file://${process.cwd()}/${file}`,
              source: {
                type: "file",
                text: {
                  start: store.index,
                  end: store.index + file.length + 1,
                  value: "@" + file,
                },
                path: file,
              },
            }
            props.setPrompt((draft) => {
              const append = "@" + file + " "
              if (store.index === 0) draft.input = append
              if (store.index > 0) draft.input = draft.input.slice(0, store.index) + append
              draft.parts.push(part)
            })
            setTimeout(() => hide(), 0)
          }
        }
        if (!store.visible && e.name === "@") {
          const last = props.value.at(-1)
          if (last === " " || last === undefined) {
            show()
          }
        }
      },
    })
  })
  return (
    <box
      visible={store.visible}
      position="absolute"
      top={store.position.y - 10}
      left={store.position.x}
      width={store.position.width}
      zIndex={100}
      {...SplitBorder}
    >
      <box backgroundColor={Theme.backgroundElement} height={10}>
        <For each={options()}>
          {(option, index) => (
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={index() === store.selected ? Theme.primary : undefined}
            >
              <text fg={index() === store.selected ? Theme.background : Theme.text}>{option.value}</text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}
