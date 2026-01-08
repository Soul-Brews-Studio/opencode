import { createMemo, Show } from "solid-js"
import { A, useNavigate, useParams } from "@solidjs/router"
import { useLayout } from "@/context/layout"
import { useCommand } from "@/context/command"
import { useSync } from "@/context/sync"
import { getFilename } from "@opencode-ai/util/path"
import { base64Decode, base64Encode } from "@opencode-ai/util/encode"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { Select } from "@opencode-ai/ui/select"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { same } from "@/utils/same"

export function SessionHeader() {
  const layout = useLayout()
  const params = useParams()
  const navigate = useNavigate()
  const command = useCommand()
  const sync = useSync()

  const projectDirectory = createMemo(() => base64Decode(params.dir ?? ""))

  const sessions = createMemo(() => (sync.data.session ?? []).filter((s) => !s.parentID))
  const currentSession = createMemo(() => sync.data.session.find((s) => s.id === params.id))
  const parentSession = createMemo(() => {
    const current = currentSession()
    if (!current?.parentID) return undefined
    return sync.data.session.find((s) => s.id === current.parentID)
  })
  const worktrees = createMemo(() => layout.projects.list().map((p) => p.worktree), [], { equals: same })

  function navigateToProject(directory: string) {
    navigate(`/${base64Encode(directory)}`)
  }

  function navigateToSession(session: Session | undefined) {
    if (!session) return
    // Only navigate if we're actually changing to a different session
    if (session.id === params.id) return
    navigate(`/${params.dir}/session/${session.id}`)
  }

  return (
    <header class="h-12 shrink-0 bg-background-base border-b border-border-weak-base flex">
      <button
        type="button"
        class="xl:hidden w-12 shrink-0 flex items-center justify-center border-r border-border-weak-base hover:bg-surface-raised-base-hover active:bg-surface-raised-base-active transition-colors"
        onClick={layout.mobileSidebar.toggle}
      >
        <Icon name="menu" size="small" />
      </button>
      <div class="px-4 flex items-center justify-between gap-3 w-full">
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex items-center gap-2 min-w-0">
            <div class="hidden xl:flex items-center gap-2">
              <Select
                options={worktrees()}
                current={sync.project?.worktree ?? projectDirectory()}
                label={(x) => getFilename(x)}
                onSelect={(x) => (x ? navigateToProject(x) : undefined)}
                class="text-14-regular text-text-base"
                variant="ghost"
              >
                {/* @ts-ignore */}
                {(i) => (
                  <div class="flex items-center gap-2">
                    <Icon name="folder" size="small" />
                    <div class="text-text-strong">{getFilename(i)}</div>
                  </div>
                )}
              </Select>
              <div class="text-text-weaker">/</div>
            </div>
            <Show
              when={parentSession()}
              fallback={
                <>
                  <Select
                    options={sessions()}
                    current={currentSession()}
                    placeholder="New session"
                    label={(x) => x.title}
                    value={(x) => x.id}
                    onSelect={navigateToSession}
                    class="text-14-regular text-text-base max-w-[calc(100vw-180px)] md:max-w-md"
                    variant="ghost"
                  />
                </>
              }
            >
              <div class="flex items-center gap-2 min-w-0">
                <Select
                  options={sessions()}
                  current={parentSession()}
                  placeholder="Back to parent session"
                  label={(x) => x.title}
                  value={(x) => x.id}
                  onSelect={(session) => {
                    // Only navigate if selecting a different session than current parent
                    const currentParent = parentSession()
                    if (session && currentParent && session.id !== currentParent.id) {
                      navigateToSession(session)
                    }
                  }}
                  class="text-14-regular text-text-base max-w-[calc(100vw-180px)] md:max-w-md"
                  variant="ghost"
                />
                <div class="text-text-weaker">/</div>
                <div class="flex items-center gap-1.5 min-w-0">
                  <Tooltip value="Back to parent session">
                    <button
                      type="button"
                      class="flex items-center justify-center gap-1 p-1 rounded hover:bg-surface-raised-base-hover active:bg-surface-raised-base-active transition-colors flex-shrink-0"
                      onClick={() => navigateToSession(parentSession())}
                    >
                      <Icon name="arrow-left" size="small" class="text-icon-base" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            </Show>
          </div>
          <Show when={currentSession() && !parentSession()}>
            <TooltipKeybind class="hidden xl:block" title="New session" keybind={command.keybind("session.new")}>
              <IconButton as={A} href={`/${params.dir}/session`} icon="plus-small" variant="ghost" />
            </TooltipKeybind>
          </Show>
        </div>
      </div>
    </header>
  )
}
