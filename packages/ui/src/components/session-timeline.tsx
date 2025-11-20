import { createSeen } from "../hooks/create-seen"
import { AssistantMessage } from "@opencode-ai/sdk"
import { useData } from "../context"
import { Binary } from "@opencode-ai/util/binary"
import { getDirectory, getFilename } from "@opencode-ai/util/path"
import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { DiffChanges } from "./diff-changes"
import { Spinner } from "./spinner"
import { Typewriter } from "./typewriter"
import { Message } from "./message-part"
import { Markdown } from "./markdown"
import { Accordion } from "./accordion"
import { StickyAccordionHeader } from "./sticky-accordion-header"
import { FileIcon } from "./file-icon"
import { Icon } from "./icon"
import { Diff } from "./diff"
import { Card } from "./card"
import { MessageProgress } from "./message-progress"
import { Collapsible } from "./collapsible"

export function SessionTimeline(props: { sessionID: string; expanded?: boolean }) {
  const data = useData()
  const [store, setStore] = createStore({
    messageId: undefined as string | undefined,
  })
  const match = Binary.search(data.session, props.sessionID, (s) => s.id)
  if (!match.found) throw new Error(`Session ${props.sessionID} not found`)

  // const info = createMemo(() => data.session[match.index])
  const messages = createMemo(() => (props.sessionID ? (data.message[props.sessionID] ?? []) : []))
  const userMessages = createMemo(() =>
    messages()
      .filter((m) => m.role === "user")
      .sort((a, b) => b.id.localeCompare(a.id)),
  )
  const lastUserMessage = createMemo(() => {
    return userMessages()?.at(0)
  })
  const activeMessage = createMemo(() => {
    if (!store.messageId) return lastUserMessage()
    return userMessages()?.find((m) => m.id === store.messageId)
  })
  const status = createMemo(
    () =>
      data.session_status[props.sessionID] ?? {
        type: "idle",
      },
  )
  const working = createMemo(() => status()?.type !== "idle")

  return (
    <div data-component="session-timeline">
      <Show when={userMessages().length > 1}>
        <ul role="list" data-slot="timeline-list" data-expanded={props.expanded}>
          <For each={userMessages()}>
            {(message) => {
              const messageWorking = createMemo(() => message.id === lastUserMessage()?.id && working())
              const handleClick = () => setStore("messageId", message.id)

              return (
                <li data-slot="timeline-item" data-expanded={props.expanded}>
                  <button
                    data-slot="tick-button"
                    data-active={activeMessage()?.id === message.id}
                    data-expanded={props.expanded}
                    onClick={handleClick}
                  >
                    <div data-slot="tick-line" />
                  </button>
                  <button data-slot="message-button" data-expanded={props.expanded} onClick={handleClick}>
                    <Switch>
                      <Match when={messageWorking()}>
                        <Spinner class="spinner" />
                      </Match>
                      <Match when={true}>
                        <DiffChanges changes={message.summary?.diffs ?? []} variant="bars" />
                      </Match>
                    </Switch>
                    <div data-slot="message-title-preview" data-active={activeMessage()?.id === message.id}>
                      <Show when={message.summary?.title} fallback="New message">
                        {message.summary?.title}
                      </Show>
                    </div>
                  </button>
                </li>
              )
            }}
          </For>
        </ul>
      </Show>
      <div data-slot="content">
        <For each={userMessages()}>
          {(message) => {
            const isActive = createMemo(() => activeMessage()?.id === message.id)
            const titleSeen = createMemo(() => true)
            const contentSeen = createMemo(() => true)
            {
              /* const titleSeen = createSeen(`message-title-${message.id}`) */
            }
            {
              /* const contentSeen = createSeen(`message-content-${message.id}`) */
            }
            const [titled, setTitled] = createSignal(titleSeen())
            const assistantMessages = createMemo(() => {
              return messages()?.filter((m) => m.role === "assistant" && m.parentID == message.id) as AssistantMessage[]
            })
            const error = createMemo(() => assistantMessages().find((m) => m?.error)?.error)
            const [detailsExpanded, setDetailsExpanded] = createSignal(false)
            const parts = createMemo(() => data.part[message.id])
            const hasToolPart = createMemo(() =>
              assistantMessages()
                ?.flatMap((m) => data.part[m.id])
                .some((p) => p?.type === "tool"),
            )
            const messageWorking = createMemo(() => message.id === lastUserMessage()?.id && working())
            const initialCompleted = !(message.id === lastUserMessage()?.id && working())
            const [completed, setCompleted] = createSignal(initialCompleted)

            // allowing time for the animations to finish
            createEffect(() => {
              if (titleSeen()) return
              const title = message.summary?.title
              if (title) setTimeout(() => setTitled(true), 10_000)
            })
            createEffect(() => {
              const completed = !messageWorking()
              setTimeout(() => setCompleted(completed), 1200)
            })

            return (
              <Show when={isActive()}>
                <div data-message={message.id} data-slot="message-container">
                  {/* Title */}
                  <div data-slot="message-header">
                    <div data-slot="message-title">
                      <Show
                        when={titled()}
                        fallback={
                          <Typewriter
                            as="h1"
                            text={message.summary?.title}
                            class="overflow-hidden text-ellipsis min-w-0 text-nowrap"
                          />
                        }
                      >
                        <h1>{message.summary?.title}</h1>
                      </Show>
                    </div>
                  </div>
                  <Message message={message} parts={parts()} />
                  {/* Summary */}
                  <Show when={completed()}>
                    <div data-slot="summary-section">
                      <div data-slot="summary-header">
                        <h2 data-slot="summary-title">
                          <Switch>
                            <Match when={message.summary?.diffs?.length}>Summary</Match>
                            <Match when={true}>Response</Match>
                          </Switch>
                        </h2>
                        <Show when={message.summary?.body}>
                          {(summary) => (
                            <Markdown
                              data-slot="markdown"
                              data-diffs={!!message.summary?.diffs?.length}
                              data-fade={!message.summary?.diffs?.length && !contentSeen()}
                              text={summary()}
                            />
                          )}
                        </Show>
                      </div>
                      <Accordion data-slot="accordion" multiple>
                        <For each={message.summary?.diffs ?? []}>
                          {(diff) => (
                            <Accordion.Item value={diff.file}>
                              <StickyAccordionHeader data-slot="sticky-header">
                                <Accordion.Trigger>
                                  <div data-slot="accordion-trigger-content">
                                    <div data-slot="file-info">
                                      <FileIcon node={{ path: diff.file, type: "file" }} data-slot="file-icon" />
                                      <div data-slot="file-path">
                                        <Show when={diff.file.includes("/")}>
                                          <span data-slot="directory">{getDirectory(diff.file)}&lrm;</span>
                                        </Show>
                                        <span data-slot="filename">{getFilename(diff.file)}</span>
                                      </div>
                                    </div>
                                    <div data-slot="accordion-actions">
                                      <DiffChanges changes={diff} />
                                      <Icon name="chevron-grabber-vertical" size="small" />
                                    </div>
                                  </div>
                                </Accordion.Trigger>
                              </StickyAccordionHeader>
                              <Accordion.Content data-slot="accordion-content">
                                <Diff
                                  before={{
                                    name: diff.file!,
                                    contents: diff.before!,
                                  }}
                                  after={{
                                    name: diff.file!,
                                    contents: diff.after!,
                                  }}
                                />
                              </Accordion.Content>
                            </Accordion.Item>
                          )}
                        </For>
                      </Accordion>
                    </div>
                  </Show>
                  <Show when={error() && !detailsExpanded()}>
                    <Card variant="error" class="error-card">
                      {error()?.data?.message as string}
                    </Card>
                  </Show>
                  {/* Response */}
                  <div data-slot="response-section">
                    <Switch>
                      <Match when={!completed()}>
                        <MessageProgress assistantMessages={assistantMessages} done={!messageWorking()} />
                      </Match>
                      <Match when={completed() && hasToolPart()}>
                        <Collapsible variant="ghost" open={detailsExpanded()} onOpenChange={setDetailsExpanded}>
                          <Collapsible.Trigger data-slot="collapsible-trigger">
                            <div data-slot="collapsible-trigger-content">
                              <div data-slot="details-text">
                                <Switch>
                                  <Match when={detailsExpanded()}>Hide details</Match>
                                  <Match when={!detailsExpanded()}>Show details</Match>
                                </Switch>
                              </div>
                              <Collapsible.Arrow />
                            </div>
                          </Collapsible.Trigger>
                          <Collapsible.Content>
                            <div data-slot="collapsible-content-inner">
                              <For each={assistantMessages()}>
                                {(assistantMessage) => {
                                  const parts = createMemo(() => data.part[assistantMessage.id])
                                  return <Message message={assistantMessage} parts={parts()} />
                                }}
                              </For>
                              <Show when={error()}>
                                <Card variant="error" class="error-card">
                                  {error()?.data?.message as string}
                                </Card>
                              </Show>
                            </div>
                          </Collapsible.Content>
                        </Collapsible>
                      </Match>
                    </Switch>
                  </div>
                </div>
              </Show>
            )
          }}
        </For>
      </div>
    </div>
  )
}
