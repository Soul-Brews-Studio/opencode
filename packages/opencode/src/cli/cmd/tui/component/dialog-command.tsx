import { useDialog } from "../ui/dialog"
import { DialogModel } from "./dialog-model"
import { DialogSelect } from "../ui/dialog-select"
import { useRoute } from "../context/route"
import { DialogSessionList } from "./dialog-session-list"

export function DialogCommand() {
  const dialog = useDialog()
  const route = useRoute()
  return (
    <DialogSelect
      title="Commands"
      options={[
        {
          title: "Switch model",
          value: "switch-model",
          category: "Agent",
          onSelect: () => {
            dialog.replace(() => <DialogModel />)
          },
        },
        {
          title: "Switch session",
          value: "switch-session",
          category: "Session",
          onSelect: () => {
            dialog.replace(() => <DialogSessionList />)
          },
        },
        {
          title: "New session",
          value: "new-session",
          category: "Session",
          onSelect: () => {
            route.navigate({
              type: "home",
            })
            dialog.clear()
          },
        },
        {
          title: "Share session",
          value: "share-session",
          category: "Session",
          onSelect: () => {
            console.log("share session")
          },
        },
      ]}
    />
  )
}
