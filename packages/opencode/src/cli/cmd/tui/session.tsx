import { createEffect, createMemo, For, Match, Show, Switch, type Component } from "solid-js"
import { Dynamic } from "solid-js/web"
import path from "path"
import { useRouteData } from "./context/route"
import { useSync } from "./context/sync"
import { SplitBorder } from "./component/border"
import { Theme } from "./context/theme"
import { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { Prompt } from "./component/prompt"
import type { AssistantMessage, Part, ToolPart, UserMessage } from "@opencode-ai/sdk"
import type { TextPart } from "ai"
import { useLocal } from "./context/local"
import { Locale } from "../../../util/locale"
import type { Tool } from "../../../tool/tool"
import type { ReadTool } from "../../../tool/read"
import type { WriteTool } from "../../../tool/write"
import { BashTool } from "../../../tool/bash"
import type { GlobTool } from "../../../tool/glob"
import { TodoWriteTool } from "../../../tool/todo"
import type { GrepTool } from "../../../tool/grep"
import type { ListTool } from "../../../tool/ls"
import type { EditTool } from "../../../tool/edit"
import type { PatchTool } from "../../../tool/patch"
import type { WebFetchTool } from "../../../tool/webfetch"
import type { TaskTool } from "../../../tool/task"
import { useKeyboard, type BoxProps, type JSX } from "@opentui/solid"
import { useSDK } from "./context/sdk"

export function Session() {
  const route = useRouteData("session")
  const sync = useSync()
  const session = createMemo(() => sync.session.get(route.sessionID)!)
  const messages = createMemo(() => sync.data.message[route.sessionID] ?? [])
  const todo = createMemo(() => sync.data.todo[route.sessionID] ?? [])
  let scroll: ScrollBoxRenderable

  createEffect(() => sync.session.sync(route.sessionID))
  const sdk = useSDK()

  useKeyboard((evt) => {
    if (evt.name === "pageup") scroll.scrollBy(-scroll.height / 2)
    if (evt.name === "pagedown") scroll.scrollBy(scroll.height / 2)
    if (evt.name === "escape")
      sdk.session.abort({
        path: {
          id: route.sessionID,
        },
      })
  })

  return (
    <box paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2} flexGrow={1} maxHeight="100%">
      <Show when={session()}>
        <box paddingLeft={1} paddingRight={1} {...SplitBorder} borderColor={Theme.backgroundElement}>
          <text>
            <span style={{ bold: true, fg: Theme.accent }}>#</span>{" "}
            <span style={{ bold: true }}>{session().title}</span>
          </text>
          <box flexDirection="row">
            <Switch>
              <Match when={session().share?.url}>
                <text fg={Theme.textMuted}>{session().share!.url}</text>
              </Match>
              <Match when={true}>
                <text>
                  /share <span style={{ fg: Theme.textMuted }}>to create a shareable link</span>
                </text>
              </Match>
            </Switch>
          </box>
        </box>
        <scrollbox
          ref={(r) => (scroll = r)}
          scrollbarOptions={{ visible: false }}
          stickyScroll={true}
          stickyStart="bottom"
          paddingTop={1}
          paddingBottom={1}
        >
          <For each={messages()}>
            {(message) => (
              <Switch>
                <Match when={message.role === "user"}>
                  <UserMessage message={message as UserMessage} parts={sync.data.part[message.id] ?? []} />
                </Match>
                <Match when={message.role === "assistant"}>
                  <AssistantMessage message={message as AssistantMessage} parts={sync.data.part[message.id] ?? []} />
                </Match>
              </Switch>
            )}
          </For>
        </scrollbox>
        <Show when={todo().length > 0 && false}>
          <box paddingBottom={1}>
            <For each={todo()}>
              {(todo) => (
                <text style={{ fg: todo.status === "in_progress" ? Theme.success : Theme.textMuted }}>
                  [{todo.status === "completed" ? "✓" : " "}] {todo.content}
                </text>
              )}
            </For>
          </box>
        </Show>
        <box flexShrink={0}>
          <Prompt sessionID={route.sessionID} />
        </box>
      </Show>
    </box>
  )
}

function UserMessage(props: { message: UserMessage; parts: Part[] }) {
  const text = createMemo(() => props.parts.flatMap((x) => (x.type === "text" && !x.synthetic ? [x] : []))[0])
  const sync = useSync()
  return (
    <box
      border={["left"]}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      marginTop={1}
      backgroundColor={Theme.backgroundPanel}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={Theme.secondary}
    >
      <text>{text()?.text}</text>
      <text>
        {sync.data.config.username ?? "You"}{" "}
        <span style={{ fg: Theme.textMuted }}>({Locale.time(props.message.time.created)})</span>
      </text>
    </box>
  )
}

function AssistantMessage(props: { message: AssistantMessage; parts: Part[] }) {
  return (
    <>
      <For each={props.parts}>
        {(part) => {
          const component = createMemo(() => PART_MAPPING[part.type as keyof typeof PART_MAPPING])
          return (
            <Show when={component()}>
              <Dynamic component={component()} part={part as any} message={props.message} />
            </Show>
          )
        }}
      </For>
      <Show when={props.message.error}>
        <box
          border={["left"]}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          marginTop={1}
          backgroundColor={Theme.backgroundPanel}
          customBorderChars={SplitBorder.customBorderChars}
          borderColor={Theme.error}
        >
          <text fg={Theme.textMuted}>{props.message.error?.data.message}</text>
        </box>
      </Show>
    </>
  )
}

const PART_MAPPING = {
  text: TextPart,
  tool: ToolPart,
}
function resize(el: BoxRenderable) {
  const parent = el.parent
  if (!parent) return
  if (el.height > 1) {
    el.marginTop = 1
    return
  }
  const children = parent.getChildren()
  const index = children.indexOf(el)
  const previous = children[index - 1]
  if (!previous) return
  if (previous.height > 1) {
    el.marginTop = 1
    return
  }
}

function TextPart(props: { part: TextPart; message: AssistantMessage }) {
  const sync = useSync()
  const agent = createMemo(() => sync.data.agent.find((x) => x.name === props.message.mode)!)
  const local = useLocal()

  return (
    <box paddingLeft={3} marginTop={1}>
      <text>{props.part.text.trim()}</text>
      <text>
        <span style={{ fg: local.agent.color(agent().name) }}>{Locale.titlecase(agent().name)}</span>{" "}
        <span style={{ fg: Theme.textMuted }}>{props.message.providerID + "/" + props.message.modelID}</span>
      </text>
    </box>
  )
}

// Pending messages moved to individual tool pending functions

function ToolPart(props: { part: ToolPart; message: AssistantMessage }) {
  const component = createMemo(() => {
    const ready = ToolRegistry.ready(props.part.tool)
    if (!ready) return

    const metadata = props.part.state.status === "pending" ? {} : (props.part.state.metadata ?? {})
    const input = props.part.state.input

    const container: BoxProps =
      ToolRegistry.container(props.part.tool) === "block"
        ? {
            border: ["left"] as const,
            paddingTop: 1,
            paddingBottom: 1,
            paddingLeft: 2,
            gap: 1,
            backgroundColor: Theme.backgroundPanel,
            customBorderChars: SplitBorder.customBorderChars,
            borderColor: Theme.background,
          }
        : {
            paddingLeft: 3,
          }

    return (
      <box
        {...container}
        renderAfter={function () {
          resize(this as BoxRenderable)
        }}
      >
        <Dynamic
          component={ready}
          input={input}
          metadata={metadata}
          output={props.part.state.status === "completed" ? props.part.state.output : undefined}
        />
        {props.part.state.status === "error" && (
          <box paddingLeft={2}>
            <text fg={Theme.error}>{props.part.state.error.replace("Error: ", "")}</text>
          </box>
        )}
      </box>
    )
  })

  return <Show when={component()}>{component()}</Show>
}

type ToolProps<T extends Tool.Info> = {
  input: Partial<Tool.InferParameters<T>>
  metadata: Partial<Tool.InferMetadata<T>>
  output?: string
}

const ToolRegistry = (() => {
  const state: Record<string, { name: string; container: "inline" | "block"; ready?: Component<ToolProps<any>> }> = {}
  function register<T extends Tool.Info>(input: {
    name: string
    container: "inline" | "block"
    ready?: Component<ToolProps<T>>
  }) {
    state[input.name] = input
    return input
  }
  return {
    register,
    container(name: string) {
      return state[name]?.container
    },
    ready(name: string) {
      return state[name]?.ready
    },
  }
})()

function ToolTitle(props: { fallback: string; when: any; icon: string; children: JSX.Element }) {
  return (
    <text paddingLeft={3} fg={props.when ? Theme.textMuted : Theme.text}>
      <Show fallback={<>~ {props.fallback}</>} when={props.when}>
        <span style={{ bold: true }}>{props.icon}</span> {props.children}
      </Show>
    </text>
  )
}

ToolRegistry.register<typeof BashTool>({
  name: "bash",
  container: "block",
  ready(props) {
    return (
      <>
        <ToolTitle icon="#" fallback="Writing command..." when={props.input.command}>
          {props.input.description}
        </ToolTitle>
        <Show when={props.input.command}>
          <text fg={Theme.text}>$ {props.input.command}</text>
        </Show>
        <Show when={props.output?.trim()}>
          <box>
            <text fg={Theme.text}>{props.output?.trim()}</text>
          </box>
        </Show>
      </>
    )
  },
})

/*
const syntax = new SyntaxStyle({
  keyword: { fg: RGBA.fromHex(Theme.syntaxKeyword), bold: true },
  string: { fg: RGBA.fromHex(Theme.syntaxString) },
  comment: { fg: RGBA.fromHex(Theme.syntaxComment), italic: true },
  number: { fg: RGBA.fromHex(Theme.syntaxNumber) },
  function: { fg: RGBA.fromHex(Theme.syntaxFunction) },
  type: { fg: RGBA.fromHex(Theme.syntaxType) },
  operator: { fg: RGBA.fromHex(Theme.syntaxOperator) },
  variable: { fg: RGBA.fromHex(Theme.syntaxVariable) },
  bracket: { fg: RGBA.fromHex(Theme.syntaxPunctuation) },
  punctuation: { fg: RGBA.fromHex(Theme.syntaxPunctuation) },
  default: { fg: RGBA.fromHex(Theme.syntaxVariable) },
})
*/

ToolRegistry.register<typeof ReadTool>({
  name: "read",
  container: "inline",
  ready(props) {
    return (
      <>
        <ToolTitle icon="→" fallback="Reading file..." when={props.input.filePath}>
          Read {normalizePath(props.input.filePath!)}
        </ToolTitle>
      </>
    )
  },
})

ToolRegistry.register<typeof WriteTool>({
  name: "write",
  container: "block",
  ready(props) {
    const lines = createMemo(() => {
      return props.input.content?.split("\n") ?? []
    })
    const code = createMemo(() => {
      if (!props.input.content) return ""
      const text = props.input.content
      return text
    })

    const numbers = createMemo(() => {
      const pad = lines().length.toString().length
      return lines()
        .map((_, index) => index + 1)
        .map((x) => x.toString().padStart(pad, " "))
    })

    return (
      <>
        <ToolTitle icon="←" fallback="Preparing write..." when={props.input.filePath}>
          Wrote {props.input.filePath}
        </ToolTitle>
        <box flexDirection="row">
          <box>
            <For each={numbers()}>{(value) => <text style={{ fg: Theme.textMuted }}>{value}</text>}</For>
          </box>
          <box paddingLeft={1}>
            <text>{code()}</text>
          </box>
        </box>
      </>
    )
  },
})

ToolRegistry.register<typeof GlobTool>({
  name: "glob",
  container: "inline",
  ready(props) {
    return (
      <>
        <ToolTitle icon="✱" fallback="Finding files..." when={props.input.pattern}>
          Glob "{props.input.pattern}" <Show when={props.metadata.count}>({props.metadata.count} matches)</Show>
        </ToolTitle>
      </>
    )
  },
})

ToolRegistry.register<typeof GrepTool>({
  name: "grep",
  container: "inline",
  ready(props) {
    return (
      <ToolTitle icon="✱" fallback="Searching content..." when={props.input.pattern}>
        Grep "{props.input.pattern}"
      </ToolTitle>
    )
  },
})

ToolRegistry.register<typeof ListTool>({
  name: "list",
  container: "inline",
  ready(props) {
    const dir = createMemo(() => {
      if (props.input.path) {
        return normalizePath(props.input.path)
      }
      return ""
    })
    return (
      <>
        <ToolTitle icon="→" fallback="Listing directory..." when={props.input.path !== undefined}>
          List {dir()}
        </ToolTitle>
      </>
    )
  },
})

ToolRegistry.register<typeof TaskTool>({
  name: "task",
  container: "block",
  ready(props) {
    return (
      <>
        <ToolTitle icon="%" fallback="Delegating..." when={props.input.description}>
          Task {props.input.description}
        </ToolTitle>
        <Show when={props.metadata.summary?.length}>
          <box>
            <For each={props.metadata.summary ?? []}>
              {(task) => (
                <text style={{ fg: Theme.textMuted }}>
                  ∟ {task.tool} {task.state.status === "completed" ? task.state.title : ""}
                </text>
              )}
            </For>
          </box>
        </Show>
      </>
    )
  },
})

ToolRegistry.register<typeof WebFetchTool>({
  name: "webfetch",
  container: "inline",
  ready(props) {
    return (
      <ToolTitle icon="%" fallback="Fetching from the web..." when={(props.input as any).url}>
        WebFetch {(props.input as any).url}
      </ToolTitle>
    )
  },
})

ToolRegistry.register<typeof EditTool>({
  name: "edit",
  container: "block",
  ready(props) {
    const code = createMemo(() => {
      if (!props.metadata.diff) return ""
      const text = props.metadata.diff.split("\n").slice(5).join("\n")
      return text
    })
    return (
      <>
        <ToolTitle icon="←" fallback="Preparing edit..." when={props.input.filePath}>
          Edit {normalizePath(props.input.filePath!)}
        </ToolTitle>
        <Show when={code()}>
          <box paddingLeft={1}>
            <text>{code()}</text>
          </box>
        </Show>
      </>
    )
  },
})

ToolRegistry.register<typeof PatchTool>({
  name: "patch",
  container: "block",
  ready(props) {
    return (
      <>
        <ToolTitle icon="%" fallback="Preparing patch..." when={true}>
          Patch
        </ToolTitle>
        <Show when={props.output}>
          <box>
            <text>{props.output?.trim()}</text>
          </box>
        </Show>
      </>
    )
  },
})

ToolRegistry.register<typeof TodoWriteTool>({
  name: "todowrite",
  container: "block",
  ready(props) {
    return (
      <box>
        <For each={props.input.todos ?? []}>
          {(todo) => (
            <text style={{ fg: todo.status === "in_progress" ? Theme.success : Theme.textMuted }}>
              [{todo.status === "completed" ? "✓" : " "}] {todo.content}
            </text>
          )}
        </For>
      </box>
    )
  },
})

function normalizePath(input: string) {
  if (path.isAbsolute(input)) {
    return path.relative(process.cwd(), input) || "."
  }
  return input
}
