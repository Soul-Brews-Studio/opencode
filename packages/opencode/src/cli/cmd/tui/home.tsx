import { Installation } from "../../../installation"
import { Theme } from "./context/theme"
import { TextAttributes } from "@opentui/core"
import { Prompt } from "./component/prompt"

export function Home() {
  return (
    <box flexGrow={1} justifyContent="center" alignItems="center">
      <box>
        <Logo />
        <box paddingTop={2}>
          <HelpRow slash="new">new session</HelpRow>
          <HelpRow slash="help">show help</HelpRow>
          <HelpRow slash="share">share session</HelpRow>
          <HelpRow slash="models">list models</HelpRow>
          <HelpRow slash="agents">list agents</HelpRow>
        </box>
      </box>
      <box paddingTop={3} minWidth={75}>
        <Prompt />
      </box>
    </box>
  )
}

function HelpRow(props: { children: string; slash: string }) {
  return (
    <text>
      <span style={{ bold: true, fg: Theme.primary }}>/{props.slash.padEnd(10, " ")}</span>
      <span>{props.children.padEnd(15, " ")} </span>
      <span style={{ fg: Theme.textMuted }}>ctrl+x n</span>
    </text>
  )
}

function Logo() {
  return (
    <box>
      <box flexDirection="row">
        <text fg={Theme.textMuted}>{"█▀▀█ █▀▀█ █▀▀ █▀▀▄"}</text>
        <text fg={Theme.text} attributes={TextAttributes.BOLD}>
          {" █▀▀ █▀▀█ █▀▀▄ █▀▀"}
        </text>
      </box>
      <box flexDirection="row">
        <text fg={Theme.textMuted}>{`█░░█ █░░█ █▀▀ █░░█`}</text>
        <text fg={Theme.text}>{` █░░ █░░█ █░░█ █▀▀`}</text>
      </box>
      <box flexDirection="row">
        <text fg={Theme.textMuted}>{`▀▀▀▀ █▀▀▀ ▀▀▀ ▀  ▀`}</text>
        <text fg={Theme.text}>{` ▀▀▀ ▀▀▀▀ ▀▀▀  ▀▀▀`}</text>
      </box>
      <box flexDirection="row" justifyContent="flex-end">
        <text fg={Theme.textMuted}>{Installation.VERSION}</text>
      </box>
    </box>
  )
}
