import { Prompt } from "@tui/component/prompt"
import { createMemo, createResource, Match, Show, Switch, type ParentProps } from "solid-js"
import { Theme } from "@tui/context/theme"
import { useSDK } from "../context/sdk"
import { useKeybind } from "../context/keybind"
import type { KeybindsConfig } from "@opencode-ai/sdk"
import { Logo } from "../component/logo"

export function Home() {
  const sdk = useSDK()
  const [mcp] = createResource(async () => {
    const result = await sdk.mcp.status()
    return result.data
  })
  const mcpError = createMemo(() => {
    return Object.values(mcp() ?? {}).some((x) => x.status === "failed")
  })

  const Hint = (
    <Show when={Object.keys(mcp() ?? {}).length > 0}>
      <box flexShrink={0} flexDirection="row" gap={1}>
        <text>
          <Switch>
            <Match when={mcpError()}>
              <span style={{ fg: Theme.error }}>•</span> mcp errors{" "}
              <span style={{ fg: Theme.textMuted }}>ctrl+x s</span>
            </Match>
            <Match when={true}>
              <span style={{ fg: Theme.success }}>•</span> {Object.values(mcp() ?? {}).length} mcp servers
            </Match>
          </Switch>
        </text>
      </box>
    </Show>
  )

  return (
    <box flexGrow={1} justifyContent="center" alignItems="center" paddingLeft={2} paddingRight={2} gap={1}>
      <Logo />
      <box width={39}>
        <HelpRow keybind="command_list">Commands</HelpRow>
        <HelpRow keybind="session_list">List sessions</HelpRow>
        <HelpRow keybind="model_list">Switch model</HelpRow>
        <HelpRow keybind="agent_cycle">Switch agent</HelpRow>
      </box>
      <box width="100%" maxWidth={75} zIndex={1000} paddingTop={1}>
        <Prompt hint={Hint} />
      </box>
    </box>
  )
}

function HelpRow(props: ParentProps<{ keybind: keyof KeybindsConfig }>) {
  const keybind = useKeybind()
  return (
    <box flexDirection="row" justifyContent="space-between" width="100%">
      <text>{props.children}</text>
      <text fg={Theme.primary}>{keybind.print(props.keybind)}</text>
    </box>
  )
}
