import { createMemo } from "solid-js"
import { useLocal } from "../context/local"
import { useSync } from "../context/sync"
import { map, pipe, flatMap, entries, filter, isDeepEqual } from "remeda"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"

export function DialogModel() {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()

  const options = createMemo(() => [
    ...local.model.recent().map((item) => {
      const provider = sync.data.provider.find((x) => x.id === item.providerID)!
      const model = provider.models[item.modelID]
      return {
        key: item,
        value: {
          providerID: provider.id,
          modelID: model.id,
        },
        title: model.name ?? item.modelID,
        description: provider.name,
        category: "Recent",
      }
    }),
    ...pipe(
      sync.data.provider,
      flatMap((provider) =>
        pipe(
          provider.models,
          entries(),
          map(([model, info]) => ({
            value: {
              providerID: provider.id,
              modelID: model,
            },
            title: info.name ?? model,
            description: provider.name,
            category: provider.name,
          })),
          filter((x) => !local.model.recent().find((y) => isDeepEqual(y, x.value))),
        ),
      ),
    ),
  ])

  return (
    <DialogSelect
      title="Select model"
      current={local.model.current()}
      options={options()}
      onSelect={(option) => {
        local.model.set(option.value, { recent: true })
        dialog.clear()
      }}
    />
  )
}
