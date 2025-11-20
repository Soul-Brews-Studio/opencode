import { useTheme } from "../context/theme"
import { useKeyboard } from "@opentui/solid"
import type { Permission } from "@opencode-ai/sdk"
import { useDialog, type DialogContext } from "../ui/dialog"
import { TextAttributes } from "@opentui/core"
import { Show, createMemo } from "solid-js"

export type DialogPermissionProps = {
  permission: Permission
  onResponse: (response: "once" | "always" | "reject") => void
}

export function DialogPermission(props: DialogPermissionProps) {
  const { theme, syntax } = useTheme()
  const dialog = useDialog()

  useKeyboard((evt) => {
    if (evt.name === "return" || evt.name === "enter") {
      evt.preventDefault()
      props.onResponse("once")
      dialog.clear()
    }

    if (evt.name === "a") {
      evt.preventDefault()
      props.onResponse("always")
      dialog.clear()
    }

    if (evt.name === "d" || evt.name === "escape") {
      evt.preventDefault()
      props.onResponse("reject")
      dialog.clear()
    }
  })

  const metadata = createMemo(() => props.permission.metadata ?? {})

  const renderMetadata = () => {
    const meta = metadata()
    const type = props.permission.type

    if (type === "bash") {
      return (
        <box gap={1} paddingTop={1}>
          <text fg={theme.textMuted}>Command:</text>
          <box
            backgroundColor={theme.backgroundElement}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={1}
            paddingBottom={1}
          >
            <text fg={theme.text}>$ {meta.command}</text>
          </box>
        </box>
      )
    }

    if (type === "edit") {
      const diff = meta.diff
      if (!diff || typeof diff !== "string") return null

      return (
        <box gap={1} paddingTop={1}>
          <text fg={theme.textMuted}>File: {meta.filePath}</text>
          <text fg={theme.textMuted}>Changes:</text>
          <box
            backgroundColor={theme.backgroundElement}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={1}
            paddingBottom={1}
            maxHeight={20}
          >
            <code fg={theme.text} filetype="diff" syntaxStyle={syntax()} content={diff} />
          </box>
        </box>
      )
    }

    if (type === "write") {
      return (
        <box gap={1} paddingTop={1}>
          <text fg={theme.textMuted}>File: {meta.filePath}</text>
        </box>
      )
    }

    if (type === "external_directory") {
      return (
        <box gap={1} paddingTop={1}>
          <text fg={theme.textMuted}>{props.permission.title}</text>
          <Show when={meta.command}>
            <box
              backgroundColor={theme.backgroundElement}
              paddingLeft={1}
              paddingRight={1}
              paddingTop={1}
              paddingBottom={1}
            >
              <text fg={theme.text}>$ {meta.command}</text>
            </box>
          </Show>
        </box>
      )
    }

    return null
  }

  return (
    <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={2} gap={1} flexDirection="column">
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD}>Permission Required</text>
        <text fg={theme.textMuted}>esc to deny</text>
      </box>

      <box paddingTop={1} paddingBottom={1} gap={1}>
        <text fg={theme.text}>
          <b>{props.permission.type}</b>
          <Show when={props.permission.title}>
            <span style={{ fg: theme.textMuted }}> — {props.permission.title}</span>
          </Show>
        </text>

        {renderMetadata()}
      </box>

      <box flexDirection="row" gap={2} paddingTop={1} flexWrap="wrap">
        <text fg={theme.text}>
          <b>enter</b>
          <span style={{ fg: theme.textMuted }}> accept once</span>
        </text>
        <text fg={theme.text}>
          <b>a</b>
          <span style={{ fg: theme.textMuted }}> accept always</span>
        </text>
        <text fg={theme.text}>
          <b>d</b>
          <span style={{ fg: theme.textMuted }}> deny</span>
        </text>
      </box>
    </box>
  )
}

DialogPermission.show = (
  dialog: DialogContext,
  permission: Permission,
  onResponse: (response: "once" | "always" | "reject") => void,
) => {
  return new Promise<"once" | "always" | "reject">((resolve) => {
    let handled = false

    const finish = (response: "once" | "always" | "reject") => {
      if (handled) return
      handled = true
      onResponse(response)
      resolve(response)
    }

    dialog.replace(() => (
      <DialogPermission
        permission={permission}
        onResponse={(response) => {
          finish(response)
        }}
      />
    ))
  })
}
