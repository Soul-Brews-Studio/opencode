import fs from "fs/promises"
import path from "path"
import { Global } from "../global"
import { Identifier } from "../id/id"
import { iife } from "../util/iife"
import { lazy } from "../util/lazy"
import { PermissionNext } from "../permission/next"
import type { Agent } from "../agent/agent"

// what models does opencode provider support? Read: https://models.dev/api.json
export namespace Truncate {
  export const MAX_LINES = 2000
  export const MAX_BYTES = 50 * 1024
  export const DIR = path.join(Global.Path.data, "tool-output")
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

  export interface Result {
    content: string
    truncated: boolean
    outputPath?: string
  }

  export interface Options {
    maxLines?: number
    maxBytes?: number
    direction?: "head" | "tail"
  }

  const init = lazy(async () => {
    const cutoff = Date.now() - RETENTION_MS
    const entries = await fs.readdir(DIR).catch(() => [] as string[])
    for (const entry of entries) {
      if (!entry.startsWith("tool_")) continue
      const timestamp = iife(() => {
        const hex = entry.slice(5, 17)
        const now = BigInt("0x" + hex)
        return Number(now / BigInt(0x1000))
      })
      if (timestamp >= cutoff) continue
      await fs.rm(path.join(DIR, entry), { force: true }).catch(() => {})
    }
  })

  function hasTaskTool(agent?: Agent.Info): boolean {
    if (!agent?.permission) return false
    const rule = PermissionNext.evaluate("task", "*", agent.permission)
    return rule.action !== "deny"
  }

  export async function output(text: string, options: Options = {}, agent?: Agent.Info): Promise<Result> {
    const maxLines = options.maxLines ?? MAX_LINES
    const maxBytes = options.maxBytes ?? MAX_BYTES
    const direction = options.direction ?? "head"
    const lines = text.split("\n")
    const totalBytes = Buffer.byteLength(text, "utf-8")

    if (lines.length <= maxLines && totalBytes <= maxBytes) {
      return { content: text, truncated: false }
    }

    const out: string[] = []
    var i = 0
    var bytes = 0
    var hitBytes = false

    if (direction === "head") {
      for (i = 0; i < lines.length && i < maxLines; i++) {
        const size = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0)
        if (bytes + size > maxBytes) {
          hitBytes = true
          break
        }
        out.push(lines[i])
        bytes += size
      }
    } else {
      for (i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
        const size = Buffer.byteLength(lines[i], "utf-8") + (out.length > 0 ? 1 : 0)
        if (bytes + size > maxBytes) {
          hitBytes = true
          break
        }
        out.unshift(lines[i])
        bytes += size
      }
    }

    const removed = hitBytes ? totalBytes - bytes : lines.length - out.length
    const unit = hitBytes ? "chars" : "lines"
    const preview = out.join("\n")

    await init()
    const id = Identifier.ascending("tool")
    const filepath = path.join(DIR, id)
    await Bun.write(Bun.file(filepath), text)

    const base = `Full output written to: ${filepath}\nUse Grep to search the full content and Read with offset/limit to read specific sections`
    const hint = hasTaskTool(agent) ? `${base} (or use Task tool to delegate and save context).` : `${base}.`
    const message =
      direction === "head"
        ? `${preview}\n\n...${removed} ${unit} truncated...\n\n${hint}`
        : `...${removed} ${unit} truncated...\n\n${hint}\n\n${preview}`

    return { content: message, truncated: true, outputPath: filepath }
  }
}
