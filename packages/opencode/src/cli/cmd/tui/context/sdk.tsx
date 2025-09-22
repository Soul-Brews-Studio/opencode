import { createContext, useContext, type ParentProps } from "solid-js"
import { createOpencodeClient } from "@opencode-ai/sdk"
import { Server } from "../../../../server/server"

function init() {
  const client = createOpencodeClient({
    baseUrl: "http://localhost:4096",
    // @ts-ignore
    fetch: async (a) => {
      // @ts-ignore
      return Server.App().fetch(a)
    },
  })
  return client
}

type SDKContext = ReturnType<typeof init>

const ctx = createContext<SDKContext>()

export function SDKProvider(props: ParentProps) {
  const value = init()
  return <ctx.Provider value={value}>{props.children}</ctx.Provider>
}

export function useSDK() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useSDK must be used within a SDKProvider")
  }
  return value
}
