import { createMemo, useContext, type ParentProps } from "solid-js"
import { useSync } from "./sync"
import { Keybind } from "../../../../util/keybind"
import { pipe, mapValues } from "remeda"
import type { KeybindsConfig } from "@opencode-ai/sdk"
import { createContext } from "solid-js"
import type { ParsedKey, Renderable } from "@opentui/core"
import { createStore } from "solid-js/store"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { Instance } from "../../../../project/instance"

export function init() {
  const sync = useSync()
  const keybinds = createMemo(() => {
    return pipe(
      DEFAULT_KEYBINDS,
      (val) => Object.assign(val, sync.data.config.keybinds),
      mapValues((value) => Keybind.parse(value)),
    )
  })
  const [store, setStore] = createStore({
    leader: false,
  })
  const renderer = useRenderer()

  let focus: Renderable | null
  let timeout: NodeJS.Timeout
  function leader(active: boolean) {
    if (active) {
      setStore("leader", true)
      focus = renderer.currentFocusedRenderable
      focus?.blur()
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        if (!store.leader) return
        leader(false)
      }, 2000)
      return
    }

    if (!active) {
      if (focus && !renderer.currentFocusedRenderable) {
        focus.focus()
      }
      setStore("leader", false)
    }
  }

  useKeyboard(async (evt) => {
    if (!store.leader && result.match("leader", evt)) {
      leader(true)
      return
    }

    if (store.leader && evt.name) {
      setImmediate(() => {
        leader(false)
      })
    }

    if (result.match("app_exit", evt)) {
      await Instance.disposeAll()
      renderer.destroy()
    }
  })

  const result = {
    get all() {
      return keybinds()
    },
    get leader() {
      return store.leader
    },
    match(key: keyof KeybindsConfig, evt: ParsedKey) {
      const keybind = keybinds()[key]
      if (!keybind) return false
      const parsed: Keybind.Info = {
        ctrl: evt.ctrl,
        name: evt.name,
        shift: evt.shift,
        leader: store.leader,
        option: evt.option,
      }
      for (const key of keybind) {
        if (Keybind.match(key, parsed)) {
          return true
        }
      }
    },
    print(key: keyof KeybindsConfig) {
      const first = keybinds()[key]?.at(0)
      if (!first) return ""
      return Keybind.toString(first)
    },
  }
  return result
}

type Context = ReturnType<typeof init>
const context = createContext<Context>()

export function KeybindProvider(props: ParentProps) {
  const value = init()
  return <context.Provider value={value}>{props.children}</context.Provider>
}

export function useKeybind() {
  const result = useContext(context)
  if (!result) throw new Error("KeybindProvider not found")
  return result
}

const DEFAULT_KEYBINDS: KeybindsConfig = {
  leader: "ctrl+x",
  app_help: "<leader>h",
  app_exit: "ctrl+c,<leader>q",
  editor_open: "<leader>e",
  theme_list: "<leader>t",
  project_init: "<leader>i",
  tool_details: "<leader>d",
  thinking_blocks: "<leader>b",
  session_export: "<leader>x",
  session_new: "<leader>n",
  session_list: "<leader>l",
  session_share: "<leader>s",
  session_unshare: "none",
  session_interrupt: "esc",
  session_compact: "<leader>c",
  session_child_cycle: "ctrl+right",
  session_child_cycle_reverse: "ctrl+left",
  messages_page_up: "pgup",
  messages_page_down: "pgdown",
  messages_half_page_up: "ctrl+alt+u",
  messages_half_page_down: "ctrl+alt+d",
  messages_first: "ctrl+g",
  messages_last: "ctrl+alt+g",
  messages_copy: "<leader>y",
  messages_undo: "<leader>u",
  messages_redo: "<leader>r",
  model_list: "<leader>m",
  command_list: "ctrl+p",
  model_cycle_recent: "f2",
  model_cycle_recent_reverse: "shift+f2",
  agent_list: "<leader>a",
  agent_cycle: "tab",
  agent_cycle_reverse: "shift+tab",
  input_clear: "ctrl+c",
  input_paste: "ctrl+v",
  input_submit: "enter",
  input_newline: "shift+enter,ctrl+j",
}
