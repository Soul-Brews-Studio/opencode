import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { UI } from "../ui"
import { db } from "../../storage/db"
import { ProjectTable } from "../../project/project.sql"
import { Project } from "../../project/project"
import {
  SessionTable,
  MessageTable,
  PartTable,
  SessionDiffTable,
  TodoTable,
  PermissionTable,
} from "../../session/session.sql"
import { Session } from "../../session"
import { SessionShareTable, ShareTable } from "../../share/share.sql"
import path from "path"
import fs from "fs/promises"

export const DatabaseCommand = cmd({
  command: "database",
  describe: "database management commands",
  builder: (yargs) => yargs.command(ExportCommand).demandCommand(),
  async handler() {},
})

const ExportCommand = cmd({
  command: "export",
  describe: "export database to JSON files",
  builder: (yargs: Argv) => {
    return yargs.option("output", {
      alias: ["o"],
      describe: "output directory",
      type: "string",
      demandOption: true,
    })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const outDir = path.resolve(args.output)
      await fs.mkdir(outDir, { recursive: true })

      const stats = {
        projects: 0,
        sessions: 0,
        messages: 0,
        parts: 0,
        diffs: 0,
        todos: 0,
        permissions: 0,
        sessionShares: 0,
        shares: 0,
      }

      // Export projects
      const projectDir = path.join(outDir, "project")
      await fs.mkdir(projectDir, { recursive: true })
      for (const row of db().select().from(ProjectTable).all()) {
        const project = Project.fromRow(row)
        await Bun.write(path.join(projectDir, `${row.id}.json`), JSON.stringify(project, null, 2))
        stats.projects++
      }

      // Export sessions (organized by projectID)
      const sessionDir = path.join(outDir, "session")
      for (const row of db().select().from(SessionTable).all()) {
        const dir = path.join(sessionDir, row.projectID)
        await fs.mkdir(dir, { recursive: true })
        await Bun.write(path.join(dir, `${row.id}.json`), JSON.stringify(Session.fromRow(row), null, 2))
        stats.sessions++
      }

      // Export messages (organized by sessionID)
      const messageDir = path.join(outDir, "message")
      for (const row of db().select().from(MessageTable).all()) {
        const dir = path.join(messageDir, row.sessionID)
        await fs.mkdir(dir, { recursive: true })
        await Bun.write(path.join(dir, `${row.id}.json`), JSON.stringify(row.data, null, 2))
        stats.messages++
      }

      // Export parts (organized by messageID)
      const partDir = path.join(outDir, "part")
      for (const row of db().select().from(PartTable).all()) {
        const dir = path.join(partDir, row.messageID)
        await fs.mkdir(dir, { recursive: true })
        await Bun.write(path.join(dir, `${row.id}.json`), JSON.stringify(row.data, null, 2))
        stats.parts++
      }

      // Export session diffs
      const diffDir = path.join(outDir, "session_diff")
      await fs.mkdir(diffDir, { recursive: true })
      for (const row of db().select().from(SessionDiffTable).all()) {
        await Bun.write(path.join(diffDir, `${row.sessionID}.json`), JSON.stringify(row.data, null, 2))
        stats.diffs++
      }

      // Export todos
      const todoDir = path.join(outDir, "todo")
      await fs.mkdir(todoDir, { recursive: true })
      for (const row of db().select().from(TodoTable).all()) {
        await Bun.write(path.join(todoDir, `${row.sessionID}.json`), JSON.stringify(row.data, null, 2))
        stats.todos++
      }

      // Export permissions
      const permDir = path.join(outDir, "permission")
      await fs.mkdir(permDir, { recursive: true })
      for (const row of db().select().from(PermissionTable).all()) {
        await Bun.write(path.join(permDir, `${row.projectID}.json`), JSON.stringify(row.data, null, 2))
        stats.permissions++
      }

      // Export session shares
      const sessionShareDir = path.join(outDir, "session_share")
      await fs.mkdir(sessionShareDir, { recursive: true })
      for (const row of db().select().from(SessionShareTable).all()) {
        await Bun.write(path.join(sessionShareDir, `${row.sessionID}.json`), JSON.stringify(row.data, null, 2))
        stats.sessionShares++
      }

      // Export shares
      const shareDir = path.join(outDir, "share")
      await fs.mkdir(shareDir, { recursive: true })
      for (const row of db().select().from(ShareTable).all()) {
        await Bun.write(path.join(shareDir, `${row.sessionID}.json`), JSON.stringify(row.data, null, 2))
        stats.shares++
      }

      // Create migration marker so this can be imported back
      await Bun.write(path.join(outDir, "migration"), Date.now().toString())

      UI.println(`Exported to ${outDir}:`)
      UI.println(`  ${stats.projects} projects`)
      UI.println(`  ${stats.sessions} sessions`)
      UI.println(`  ${stats.messages} messages`)
      UI.println(`  ${stats.parts} parts`)
      UI.println(`  ${stats.diffs} session diffs`)
      UI.println(`  ${stats.todos} todos`)
      UI.println(`  ${stats.permissions} permissions`)
      UI.println(`  ${stats.sessionShares} session shares`)
      UI.println(`  ${stats.shares} shares`)
    })
  },
})
