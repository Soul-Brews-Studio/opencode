import { createMemo, splitProps, type ComponentProps, type JSX } from "solid-js"
import { Avatar } from "@opencode-ai/ui/avatar"
import { getAvatarColors } from "@/context/layout"

const OPENCODE_PROJECT_ID = "4b0ea68d7af9a6031a7ffda7ad66e0cb83315750"
const OPENCODE_FAVICON_URL = "https://opencode.ai/favicon.svg"

export interface ProjectAvatarProps extends Omit<ComponentProps<"div">, "children"> {
  name: string
  iconUrl?: string
  iconColor?: string
  projectId?: string
  size?: "small" | "normal" | "large"
}

export const isValidImageUrl = (url: string | undefined): boolean => {
  if (!url) {
    return false
  }
  if (url.startsWith("data:image/x-icon")) {
    return false
  }
  if (url.startsWith("data:image/vnd.microsoft.icon")) {
    return false
  }
  return true
}

export const isValidImageFile = (file: File): boolean => {
  if (!file.type.startsWith("image/")) {
    return false
  }
  if (file.type === "image/x-icon" || file.type === "image/vnd.microsoft.icon") {
    return false
  }
  return true
}

export const ProjectAvatar = (props: ProjectAvatarProps) => {
  const [local, rest] = splitProps(props, [
    "name",
    "iconUrl",
    "iconColor",
    "projectId",
    "size",
    "class",
    "classList",
    "style",
  ])
  const colors = createMemo(() => getAvatarColors(local.iconColor))
  const validSrc = createMemo(() => {
    if (isValidImageUrl(local.iconUrl)) {
      return local.iconUrl
    }
    if (local.projectId === OPENCODE_PROJECT_ID) {
      return OPENCODE_FAVICON_URL
    }
    return undefined
  })

  return (
    <Avatar
      fallback={local.name}
      src={validSrc()}
      size={local.size}
      {...colors()}
      class={local.class}
      classList={local.classList}
      style={local.style as JSX.CSSProperties}
      {...rest}
    />
  )
}
