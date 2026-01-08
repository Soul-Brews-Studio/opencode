import { createMemo, createResource, Show, Component, type ComponentProps } from "solid-js"
import { useParams } from "@solidjs/router"
import { useLayout } from "@/context/layout"
import { useCommand } from "@/context/command"
import { useServer } from "@/context/server"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useSync } from "@/context/sync"
import { useGlobalSDK } from "@/context/global-sdk"
import { base64Decode } from "@opencode-ai/util/encode"
import { iife } from "@opencode-ai/util/iife"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Button } from "@opencode-ai/ui/button"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { Popover } from "@opencode-ai/ui/popover"
import { TextField } from "@opencode-ai/ui/text-field"
import { DialogSelectServer } from "@/components/dialog-select-server"
import { SessionLspIndicator } from "@/components/session-lsp-indicator"
import { SessionMcpIndicator } from "@/components/session-mcp-indicator"

export const ToolbarSession: Component<ComponentProps<"div">> = ({ class: className, ...props }) => {
  const globalSDK = useGlobalSDK()
  const layout = useLayout()
  const params = useParams()
  const command = useCommand()
  const server = useServer()
  const dialog = useDialog()
  const sync = useSync()

  const projectDirectory = createMemo(() => base64Decode(params.dir ?? ""))
  const currentSession = createMemo(() => sync.data.session.find((s) => s.id === params.id))
  const shareEnabled = createMemo(() => sync.data.config.share !== "disabled")

  return (
    <div class={`flex items-center gap-3 absolute right-5 top-1/2 -translate-y-1/2 ${className ?? ""}`} {...props}>
      <div class="hidden md:flex items-center gap-1">
        <Button
          size="small"
          variant="ghost"
          class="flex gap-2 items-center justify-center"
          onClick={() => {
            dialog.show(() => <DialogSelectServer />)
          }}
        >
          <div
            classList={{
              "size-1.5 rounded-full": true,
              "bg-icon-success-base": server.healthy() === true,
              "bg-icon-critical-base": server.healthy() === false,
              "bg-border-weak-base": server.healthy() === undefined,
            }}
          />
          <Icon name="server" size="small" class="text-icon-weak" />
          <span class="text-12-regular text-text-weak truncate max-w-[200px]">{server.name}</span>
        </Button>
        <SessionLspIndicator />
        <SessionMcpIndicator />
      </div>
      <div class="flex items-center gap-1">
        <Show when={currentSession()?.summary?.files}>
          <TooltipKeybind
            class="hidden md:block shrink-0"
            title="Toggle review"
            keybind={command.keybind("review.toggle")}
          >
            <Button variant="ghost" class="group/review-toggle size-6 p-0" onClick={layout.review.toggle}>
              <div class="relative flex items-center justify-center size-4 [&>*]:absolute [&>*]:inset-0">
                <Icon
                  name={layout.review.opened() ? "layout-right" : "layout-left"}
                  size="small"
                  class="group-hover/review-toggle:hidden"
                />
                <Icon
                  name={layout.review.opened() ? "layout-right-partial" : "layout-left-partial"}
                  size="small"
                  class="hidden group-hover/review-toggle:inline-block"
                />
                <Icon
                  name={layout.review.opened() ? "layout-right-full" : "layout-left-full"}
                  size="small"
                  class="hidden group-active/review-toggle:inline-block"
                />
              </div>
            </Button>
          </TooltipKeybind>
        </Show>
        <TooltipKeybind
          class="hidden md:block shrink-0"
          title="Toggle terminal"
          keybind={command.keybind("terminal.toggle")}
        >
          <Button variant="ghost" class="group/terminal-toggle size-6 p-0" onClick={layout.terminal.toggle}>
            <div class="relative flex items-center justify-center size-4 [&>*]:absolute [&>*]:inset-0">
              <Icon
                size="small"
                name={layout.terminal.opened() ? "layout-bottom-full" : "layout-bottom"}
                class="group-hover/terminal-toggle:hidden"
              />
              <Icon size="small" name="layout-bottom-partial" class="hidden group-hover/terminal-toggle:inline-block" />
              <Icon
                size="small"
                name={layout.terminal.opened() ? "layout-bottom" : "layout-bottom-full"}
                class="hidden group-active/terminal-toggle:inline-block"
              />
            </div>
          </Button>
        </TooltipKeybind>
      </div>
      <Show when={shareEnabled() && currentSession()}>
        <Popover
          title="Share session"
          trigger={
            <Tooltip class="shrink-0" value="Share session">
              <IconButton icon="share" variant="ghost" class="" />
            </Tooltip>
          }
        >
          {iife(() => {
            const [url] = createResource(
              () => currentSession(),
              async (session) => {
                if (!session) return
                let shareURL = session.share?.url
                if (!shareURL) {
                  shareURL = await globalSDK.client.session
                    .share({ sessionID: session.id, directory: projectDirectory() })
                    .then((r) => r.data?.share?.url)
                    .catch((e) => {
                      console.error("Failed to share session", e)
                      return undefined
                    })
                }
                return shareURL
              },
              { initialValue: "" },
            )
            return (
              <Show when={url.latest}>
                {(shareUrl) => <TextField value={shareUrl()} readOnly copyable class="w-72" />}
              </Show>
            )
          })}
        </Popover>
      </Show>
    </div>
  )
}
