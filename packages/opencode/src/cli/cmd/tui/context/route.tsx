import { createStore } from "solid-js/store"
import { createContext, useContext, type ParentProps } from "solid-js"

type Route =
  | {
      type: "home"
    }
  | {
      type: "session"
      sessionID: string
    }

function init() {
  const [store, setStore] = createStore<Route>(
    process.env["OPENCODE_ROUTE"]
      ? JSON.parse(process.env["OPENCODE_ROUTE"])
      : {
          type: "home",
        },
  )

  return {
    get data() {
      return store
    },
    navigate(route: Route) {
      console.log("navigate", route)
      setStore(route)
    },
  }
}

export type RouteContext = ReturnType<typeof init>

const ctx = createContext<RouteContext>()

export function RouteProvider(props: ParentProps) {
  const value = init()
  // @ts-ignore
  return <ctx.Provider value={value}>{props.children}</ctx.Provider>
}

export function useRoute() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useRoute must be used within a RouteProvider")
  }
  return value
}

export function useRouteData<T extends Route["type"]>(type: T) {
  const route = useRoute()
  return route.data as Extract<Route, { type: typeof type }>
}
