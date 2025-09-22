import { InputRenderable, RGBA, ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import { Theme } from "../context/theme"
import { entries, flatMap, groupBy, pipe } from "remeda"
import { batch, createEffect, createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useKeyboard } from "@opentui/solid"
import * as fuzzysort from "fuzzysort"
import { isDeepEqual } from "remeda"

export interface DialogSelectProps<T> {
  title: string
  options: DialogSelectOption<T>[]
  onFilter?: (query: string) => void
  onSelect?: (option: DialogSelectOption<T>) => void
  current?: T
}

export interface DialogSelectOption<T> {
  value: T
  title: string
  description?: string
  category?: string
  onSelect?: () => void
}

export function DialogSelect<T>(props: DialogSelectProps<T>) {
  const [store, setStore] = createStore({
    selected: 0,
    filter: "",
  })

  let input: InputRenderable

  const grouped = createMemo(() => {
    const needle = store.filter.toLowerCase()
    const result = pipe(
      props.options,
      (x) => (!needle ? x : fuzzysort.go(needle, x, { keys: ["title", "category"] }).map((x) => x.obj)),
      groupBy((x) => x.category ?? ""),
      // mapValues((x) => x.sort((a, b) => a.title.localeCompare(b.title))),
      entries(),
    )
    return result
  })

  const flat = createMemo(() => {
    return pipe(
      grouped(),
      flatMap(([_, options]) => options),
    )
  })
  const selected = createMemo(() => flat()[store.selected])

  createEffect(() => {
    store.filter
    setStore("selected", 0)
    scroll.scrollTo(0)
  })

  function move(direction: -1 | 1) {
    let next = store.selected + direction
    if (next < 0) next = flat().length - 1
    if (next >= flat().length) next = 0
    setStore("selected", next)
    const target = scroll.findDescendantById(JSON.stringify(selected()?.value))
    if (!target) return
    const y = target.y - scroll.y
    if (y >= scroll.height) {
      scroll.scrollBy(y - scroll.height + 1)
    }
    if (y < 0) {
      scroll.scrollBy(y)
      if (isDeepEqual(flat()[0].value, selected()?.value)) {
        scroll.scrollTo(0)
      }
    }
  }

  useKeyboard((evt) => {
    if (evt.name === "up") move(-1)
    if (evt.name === "down") move(1)
    if (evt.name === "return") {
      const option = selected()
      if (option.onSelect) option.onSelect()
      props.onSelect?.(option)
    }
  })

  let scroll: ScrollBoxRenderable

  return (
    <box gap={1}>
      <box paddingLeft={3} paddingRight={2}>
        <box flexDirection="row" justifyContent="space-between">
          <text attributes={TextAttributes.BOLD}>{props.title}</text>
          <text fg={Theme.textMuted}>esc</text>
        </box>
        <box paddingTop={1} paddingBottom={1}>
          <input
            onInput={(e) => {
              batch(() => {
                setStore("filter", e)
                props.onFilter?.(e)
              })
            }}
            focusedBackgroundColor={Theme.backgroundPanel}
            cursorColor={Theme.primary}
            focusedTextColor={Theme.textMuted}
            ref={(r) => {
              input = r
              input.focus()
            }}
            placeholder="Enter search term"
          />
        </box>
      </box>
      <scrollbox
        paddingLeft={2}
        paddingRight={2}
        scrollbarOptions={{ visible: false }}
        ref={(r: ScrollBoxRenderable) => (scroll = r)}
        maxHeight={10}
      >
        <For each={grouped()}>
          {([category, options], index) => (
            <box flexShrink={0}>
              <Show when={category}>
                <box paddingTop={index() > 0 ? 1 : 0} paddingLeft={1}>
                  <text fg={Theme.accent} attributes={TextAttributes.BOLD}>
                    {category}
                  </text>
                </box>
              </Show>
              <For each={options}>
                {(option) => {
                  return (
                    <Option
                      id={JSON.stringify(option.value)}
                      title={option.title}
                      description={option.description !== category ? option.description : undefined}
                      active={isDeepEqual(option.value, selected()?.value)}
                      current={isDeepEqual(option.value, props.current)}
                    />
                  )
                }}
              </For>
            </box>
          )}
        </For>
      </scrollbox>
      <box paddingRight={2} paddingLeft={3} paddingBottom={1} flexDirection="row">
        <text fg={Theme.text} attributes={TextAttributes.BOLD}>
          n
        </text>
        <text fg={Theme.textMuted}> new</text>
        <text fg={Theme.text} attributes={TextAttributes.BOLD}>
          {"   "}r
        </text>
        <text fg={Theme.textMuted}> rename</text>
      </box>
    </box>
  )
}

function Option(props: { id: string; title: string; description?: string; active?: boolean; current?: boolean }) {
  return (
    <box
      id={props.id}
      flexDirection="row"
      backgroundColor={props.active ? Theme.primary : RGBA.fromInts(0, 0, 0, 0)}
      paddingLeft={1}
      paddingRight={1}
    >
      <text
        fg={props.active ? Theme.background : props.current ? Theme.primary : Theme.text}
        attributes={props.active ? TextAttributes.BOLD : undefined}
      >
        {props.title}
      </text>
      <text fg={props.active ? Theme.background : Theme.textMuted}> {props.description}</text>
    </box>
  )
}
