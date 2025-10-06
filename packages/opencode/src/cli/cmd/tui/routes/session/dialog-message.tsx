import { createMemo } from "solid-js"
import { useSync } from "../../context/sync"
import { DialogSelect } from "../../ui/dialog-select"
import { useSDK } from "../../context/sdk"

export function DialogMessage(props: { messageID: string; sessionID: string }) {
  const sync = useSync()
  const sdk = useSDK()
  const message = createMemo(() => sync.data.message[props.sessionID]?.find((x) => x.id === props.messageID))

  return (
    <DialogSelect
      title="Message Actions"
      options={[
        {
          title: "Revert",
          value: "session.revert",
          description: "undo messages and file changes",
          onSelect: (dialog) => {
            sdk.session.revert({
              path: {
                id: props.sessionID,
              },
              body: {
                messageID: message()!.id,
              },
            })
            dialog.clear()
          },
        },
        {
          title: "Fork",
          value: "session.fork",
          description: "create a new session",
          onSelect: () => {},
        },
      ]}
    />
  )
}
