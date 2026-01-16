import type { Argv } from "yargs"
import { Session } from "../../session"
import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { db } from "../../storage/db"
import { SessionTable, MessageTable, PartTable } from "../../session/session.sql"
import { Instance } from "../../project/instance"
import { EOL } from "os"

export const ImportCommand = cmd({
  command: "import <file>",
  describe: "import session data from JSON file or URL",
  builder: (yargs: Argv) => {
    return yargs.positional("file", {
      describe: "path to JSON file or opencode.ai share URL",
      type: "string",
      demandOption: true,
    })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      let exportData:
        | {
            info: Session.Info
            messages: Array<{
              info: any
              parts: any[]
            }>
          }
        | undefined

      const isUrl = args.file.startsWith("http://") || args.file.startsWith("https://")

      if (isUrl) {
        const urlMatch = args.file.match(/https?:\/\/opncd\.ai\/share\/([a-zA-Z0-9_-]+)/)
        if (!urlMatch) {
          process.stdout.write(`Invalid URL format. Expected: https://opncd.ai/share/<slug>`)
          process.stdout.write(EOL)
          return
        }

        const slug = urlMatch[1]
        const response = await fetch(`https://opncd.ai/api/share/${slug}`)

        if (!response.ok) {
          process.stdout.write(`Failed to fetch share data: ${response.statusText}`)
          process.stdout.write(EOL)
          return
        }

        const data = await response.json()

        if (!data.info || !data.messages || Object.keys(data.messages).length === 0) {
          process.stdout.write(`Share not found: ${slug}`)
          process.stdout.write(EOL)
          return
        }

        exportData = {
          info: data.info,
          messages: Object.values(data.messages).map((msg: any) => {
            const { parts, ...info } = msg
            return {
              info,
              parts,
            }
          }),
        }
      } else {
        const file = Bun.file(args.file)
        exportData = await file.json().catch(() => {})
        if (!exportData) {
          process.stdout.write(`File not found: ${args.file}`)
          process.stdout.write(EOL)
          return
        }
      }

      if (!exportData) {
        process.stdout.write(`Failed to read session data`)
        process.stdout.write(EOL)
        return
      }

      const info = exportData.info
      const row = {
        id: info.id,
        projectID: Instance.project.id,
        parentID: info.parentID,
        slug: info.slug,
        directory: info.directory,
        title: info.title,
        version: info.version,
        share_url: info.share?.url,
        summary_additions: info.summary?.additions,
        summary_deletions: info.summary?.deletions,
        summary_files: info.summary?.files,
        summary_diffs: info.summary?.diffs,
        revert_messageID: info.revert?.messageID,
        revert_partID: info.revert?.partID,
        revert_snapshot: info.revert?.snapshot,
        revert_diff: info.revert?.diff,
        permission: info.permission,
        time_created: info.time.created,
        time_updated: info.time.updated,
        time_compacting: info.time.compacting,
        time_archived: info.time.archived,
      }
      db().insert(SessionTable).values(row).onConflictDoUpdate({ target: SessionTable.id, set: row }).run()

      for (const msg of exportData.messages) {
        db()
          .insert(MessageTable)
          .values({
            id: msg.info.id,
            sessionID: exportData.info.id,
            data: msg.info,
          })
          .onConflictDoUpdate({ target: MessageTable.id, set: { data: msg.info } })
          .run()

        for (const part of msg.parts) {
          db()
            .insert(PartTable)
            .values({
              id: part.id,
              messageID: msg.info.id,
              sessionID: exportData.info.id,
              data: part,
            })
            .onConflictDoUpdate({ target: PartTable.id, set: { data: part } })
            .run()
        }
      }

      process.stdout.write(`Imported session: ${exportData.info.id}`)
      process.stdout.write(EOL)
    })
  },
})
