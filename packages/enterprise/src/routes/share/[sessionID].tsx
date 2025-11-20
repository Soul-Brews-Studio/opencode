import { FileDiff, Message, Part, Session, SessionStatus } from "@opencode-ai/sdk"
import { SessionTimeline } from "@opencode-ai/ui/session-timeline"
import { SessionReview } from "@opencode-ai/ui/session-review"
import { DataProvider } from "@opencode-ai/ui/context"
import { createAsync, query, RouteDefinition, useParams } from "@solidjs/router"
import { Show } from "solid-js"
import { Share } from "~/core/share"

const getData = query(async (sessionID) => {
  const data = await Share.data(sessionID)
  const result: {
    session: Session[]
    session_diff: {
      [sessionID: string]: FileDiff[]
    }
    session_status: {
      [sessionID: string]: SessionStatus
    }
    message: {
      [sessionID: string]: Message[]
    }
    part: {
      [messageID: string]: Part[]
    }
  } = {
    session: [],
    session_diff: {
      [sessionID]: [],
    },
    session_status: {
      [sessionID]: {
        type: "idle",
      },
    },
    message: {},
    part: {},
  }

  for (const item of data) {
    switch (item.type) {
      case "session":
        result.session.push(item.data)
        break
      case "session_diff":
        result.session_diff[sessionID] = item.data
        break
      case "session_status":
        result.session_status[sessionID] = item.data
        break
      case "message":
        result.message[item.data.sessionID] = result.message[item.data.sessionID] ?? []
        result.message[item.data.sessionID].push(item.data)
        break
      case "part":
        result.part[item.data.messageID] = result.part[item.data.messageID] ?? []
        result.part[item.data.messageID].push(item.data)
        break
    }
  }
  return result
}, "getShareData")

export const route = {
  preload: ({ params }) => getData(params.sessionID),
} satisfies RouteDefinition

export default function () {
  const params = useParams()
  const data = createAsync(async () => {
    if (!params.sessionID) return
    return getData(params.sessionID)
  })
  return (
    <Show when={data()}>
      {(data) => (
        <DataProvider data={data()}>
          <div class="relative bg-background-base size-full overflow-x-hidden flex flex-col">
            <div class="@container select-text flex flex-col flex-1 min-h-0 overflow-y-hidden">
              <div class="w-full flex-1 min-h-0 flex">
                <div class="relative shrink-0 px-6 py-3 flex flex-col gap-6 flex-1 min-h-0 w-full max-w-xl mx-auto">
                  <SessionTimeline sessionID={params.sessionID!} expanded />
                </div>
                <Show when={data().session_diff[params.sessionID!]?.length}>
                  <div class="relative grow px-6 py-3 flex-1 min-h-0 border-l border-border-weak-base">
                    <SessionReview diffs={data().session_diff[params.sessionID!]} />
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </DataProvider>
      )}
    </Show>
  )
}
