import { createStore } from "solid-js/store"
import { batch, createContext, createEffect, createMemo, useContext, type ParentProps } from "solid-js"
import { useSync } from "./sync"
import { Theme } from "./theme"
import { uniqueBy } from "remeda"
import path from "path"
import { Global } from "../../../../global"

function init() {
  const sync = useSync()

  const agents = createMemo(() => sync.data.agent.filter((x) => x.mode !== "subagent"))

  const agent = (() => {
    const [store, setStore] = createStore<{
      current: string
    }>({
      current: agents()[0].name,
    })
    return {
      current() {
        return agents().find((x) => x.name === store.current)!
      },
      move(direction: 1 | -1) {
        let next = agents().findIndex((x) => x.name === store.current) + direction
        if (next < 0) next = agents().length - 1
        if (next >= agents().length) next = 0
        const value = agents()[next]
        setStore("current", value.name)
        if (value.model)
          model.set({
            providerID: value.model.providerID,
            modelID: value.model.modelID,
          })
      },
      color(name: string) {
        const index = agents().findIndex((x) => x.name === name)
        const colors = [Theme.secondary, Theme.accent, Theme.success, Theme.warning, Theme.primary, Theme.error]
        return colors[index % colors.length]
      },
    }
  })()

  const model = (() => {
    const [store, setStore] = createStore<{
      model: Record<
        string,
        {
          providerID: string
          modelID: string
        }
      >
      recent: {
        providerID: string
        modelID: string
      }[]
    }>({
      model: {},
      recent: [],
    })

    const file = Bun.file(path.join(Global.Path.state, "model.json"))

    file
      .json()
      .then((x) => {
        setStore("recent", x.recent)
      })
      .catch(() => {})

    createEffect(() => {
      Bun.write(
        file,
        JSON.stringify({
          recent: store.recent,
        }),
      )
    })

    const fallback = createMemo(() => {
      if (store.recent.length) return store.recent[0]
      const provider = sync.data.provider[0]
      const model = Object.values(provider.models)[0]
      return {
        providerID: provider.id,
        modelID: model.id,
      }
    })

    const current = createMemo(() => {
      const a = agent.current()
      return store.model[agent.current().name] ?? (a.model ? a.model : fallback())
    })

    return {
      current,
      recent() {
        return store.recent
      },
      parsed: createMemo(() => {
        const value = current()
        const provider = sync.data.provider.find((x) => x.id === value.providerID)!
        const model = provider.models[value.modelID]
        return {
          provider: provider.name ?? value.providerID,
          model: model.name ?? value.modelID,
        }
      }),
      set(model: { providerID: string; modelID: string }, options?: { recent?: boolean }) {
        batch(() => {
          setStore("model", agent.current().name, model)
          if (options?.recent) {
            const uniq = uniqueBy([model, ...store.recent], (x) => x.providerID + x.modelID)
            if (uniq.length > 5) uniq.pop()
            setStore("recent", uniq)
          }
        })
      },
    }
  })()

  const result = {
    model,
    agent,
  }
  return result
}

type LocalContext = ReturnType<typeof init>

const ctx = createContext<LocalContext>()

export function LocalProvider(props: ParentProps) {
  const value = init()
  return <ctx.Provider value={value}>{props.children}</ctx.Provider>
}

export function useLocal() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useLocal must be used within a LocalProvider")
  }
  return value
}
