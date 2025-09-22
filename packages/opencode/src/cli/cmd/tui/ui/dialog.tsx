import { useKeyHandler, useTerminalDimensions } from "@opentui/solid"
import { createContext, For, Show, useContext, type JSX, type ParentProps } from "solid-js"
import { Theme } from "../context/theme"
import { RGBA } from "@opentui/core"
import { createStore, produce } from "solid-js/store"

const Border = {
  topLeft: "┃",
  topRight: "┃",
  bottomLeft: "┃",
  bottomRight: "┃",
  horizontal: "",
  vertical: "┃",
  topT: "+",
  bottomT: "+",
  leftT: "+",
  rightT: "+",
  cross: "+",
}
export function Dialog(
  props: ParentProps<{
    size?: "medium" | "large"
  }>,
) {
  const dimensions = useTerminalDimensions()

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      alignItems="center"
      position="absolute"
      paddingTop={dimensions().height / 4}
      left={0}
      top={0}
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
    >
      <box
        customBorderChars={Border}
        width={props.size === "large" ? 80 : 60}
        maxWidth={dimensions().width - 2}
        backgroundColor={Theme.backgroundPanel}
        borderColor={Theme.border}
        paddingTop={1}
      >
        {props.children}
      </box>
    </box>
  )
}

function init() {
  const [store, setStore] = createStore({
    stack: [] as JSX.Element[],
    size: "medium" as "medium" | "large",
  })

  useKeyHandler((evt) => {
    if (evt.name === "escape") {
      setStore("stack", store.stack.slice(0, -1))
    }
  })

  return {
    push(input: JSX.Element) {
      setStore(
        "stack",
        produce((val) => val.push(input)),
      )
    },
    clear() {
      setStore("size", "medium")
      setStore("stack", [])
    },
    replace(input: JSX.Element) {
      setStore("size", "medium")
      setStore("stack", [input])
    },
    get stack() {
      return store.stack
    },
    get size() {
      return store.size
    },
    setSize(size: "medium" | "large") {
      setStore("size", size)
    },
  }
}

export type DialogContext = ReturnType<typeof init>

const ctx = createContext<DialogContext>()

export function DialogProvider(props: ParentProps) {
  const value = init()
  return (
    <ctx.Provider value={value}>
      {props.children}
      <box position="absolute">
        <For each={value.stack}>
          {(item, index) => (
            <Show when={index() === 0}>
              <Dialog size={value.size}>{item}</Dialog>
            </Show>
          )}
        </For>
      </box>
    </ctx.Provider>
  )
}

export function useDialog() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useDialog must be used within a DialogProvider")
  }
  return value
}
