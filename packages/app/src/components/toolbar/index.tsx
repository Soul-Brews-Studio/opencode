import { TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import type { Component, ComponentProps } from "solid-js"
import { useLayout } from "@/context/layout"
import { useCommand } from "@/context/command"
import { usePlatform } from "@/context/platform"

const IS_MAC = typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform)

export const TOOLBAR_PORTAL_ID = "toolbar-content-portal"

export const Toolbar: Component<ComponentProps<"div">> = ({ class: className, ...props }) => {
  const command = useCommand()
  const platform = usePlatform()
  const layout = useLayout()

  return (
    <div
      classList={{
        "pl-[80px]": IS_MAC && platform.platform !== "web",
        "pl-2": !IS_MAC || platform.platform === "web",
        "py-2 min-h-[41px] mx-px bg-background-base border-b border-border-weak-base flex items-center justify-between w-full border-box relative": true,
        ...(className ? { [className]: true } : {}),
      }}
      data-tauri-drag-region
      {...props}
    >
      <TooltipKeybind
        class="shrink-0 relative z-10 xl:block hidden"
        placement="bottom"
        title="Toggle sidebar"
        keybind={command.keybind("sidebar.toggle")}
      >
        <Button
          variant="ghost"
          size="normal"
          class="group/sidebar-toggle shrink-0 text-left justify-center align-middle rounded-lg px-1.5"
          onClick={layout.sidebar.toggle}
        >
          <div class="relative -ml-px flex items-center justify-center size-4 [&>*]:absolute [&>*]:inset-0">
            <Icon
              name={layout.sidebar.opened() ? "layout-left" : "layout-right"}
              size="small"
              class="group-hover/sidebar-toggle:hidden"
            />
            <Icon
              name={layout.sidebar.opened() ? "layout-left-partial" : "layout-right-partial"}
              size="small"
              class="hidden group-hover/sidebar-toggle:inline-block"
            />
            <Icon
              name={layout.sidebar.opened() ? "layout-left-full" : "layout-right-full"}
              size="small"
              class="hidden group-active/sidebar-toggle:inline-block"
            />
          </div>
        </Button>
      </TooltipKeybind>

      <div id={TOOLBAR_PORTAL_ID} class="contents" />
    </div>
  )
}

export { ToolbarSession } from "./session"
