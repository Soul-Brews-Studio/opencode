import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { eq } from "drizzle-orm"
import { Global } from "../global"
import { Log } from "../util/log"
import { ProjectTable } from "../project/project.sql"
import {
  SessionTable,
  MessageTable,
  PartTable,
  SessionDiffTable,
  TodoTable,
  PermissionTable,
} from "../session/session.sql"
import { SessionShareTable, ShareTable } from "../share/share.sql"
import path from "path"

const log = Log.create({ service: "json-migration" })

export async function migrateFromJson(sqlite: Database, customStorageDir?: string) {
  const storageDir = customStorageDir ?? path.join(Global.Path.data, "storage")
  const migrationMarker = path.join(storageDir, "sqlite-migrated")

  if (await Bun.file(migrationMarker).exists()) {
    log.info("json migration already completed")
    return
  }

  if (!(await Bun.file(path.join(storageDir, "migration")).exists())) {
    log.info("no json storage found, skipping migration")
    await Bun.write(migrationMarker, Date.now().toString())
    return
  }

  log.info("starting json to sqlite migration", { storageDir })

  const db = drizzle(sqlite)
  const stats = {
    projects: 0,
    sessions: 0,
    messages: 0,
    parts: 0,
    diffs: 0,
    todos: 0,
    permissions: 0,
    shares: 0,
    errors: [] as string[],
  }

  // Migrate projects first (no FK deps)
  const projectGlob = new Bun.Glob("project/*.json")
  for await (const file of projectGlob.scan({ cwd: storageDir, absolute: true })) {
    try {
      const data = await Bun.file(file).json()
      if (!data.id) {
        stats.errors.push(`project missing id: ${file}`)
        continue
      }
      db.insert(ProjectTable)
        .values({
          id: data.id,
          worktree: data.worktree ?? "/",
          vcs: data.vcs,
          name: data.name ?? undefined,
          icon_url: data.icon?.url,
          icon_color: data.icon?.color,
          time_created: data.time?.created ?? Date.now(),
          time_updated: data.time?.updated ?? Date.now(),
          time_initialized: data.time?.initialized,
          sandboxes: data.sandboxes ?? [],
        })
        .onConflictDoNothing()
        .run()
      stats.projects++
    } catch (e) {
      stats.errors.push(`failed to migrate project ${file}: ${e}`)
    }
  }
  log.info("migrated projects", { count: stats.projects })

  // Migrate sessions (depends on projects)
  const sessionGlob = new Bun.Glob("session/*/*.json")
  for await (const file of sessionGlob.scan({ cwd: storageDir, absolute: true })) {
    try {
      const data = await Bun.file(file).json()
      if (!data.id || !data.projectID) {
        stats.errors.push(`session missing id or projectID: ${file}`)
        continue
      }
      // Check if project exists (skip orphaned sessions)
      const project = db.select().from(ProjectTable).where(eq(ProjectTable.id, data.projectID)).get()
      if (!project) {
        log.warn("skipping orphaned session", { sessionID: data.id, projectID: data.projectID })
        continue
      }
      db.insert(SessionTable)
        .values({
          id: data.id,
          projectID: data.projectID,
          parentID: data.parentID ?? null,
          slug: data.slug ?? "",
          directory: data.directory ?? "",
          title: data.title ?? "",
          version: data.version ?? "",
          share_url: data.share?.url ?? null,
          summary_additions: data.summary?.additions ?? null,
          summary_deletions: data.summary?.deletions ?? null,
          summary_files: data.summary?.files ?? null,
          summary_diffs: data.summary?.diffs ?? null,
          revert_messageID: data.revert?.messageID ?? null,
          revert_partID: data.revert?.partID ?? null,
          revert_snapshot: data.revert?.snapshot ?? null,
          revert_diff: data.revert?.diff ?? null,
          permission: data.permission ?? null,
          time_created: data.time?.created ?? Date.now(),
          time_updated: data.time?.updated ?? Date.now(),
          time_compacting: data.time?.compacting ?? null,
          time_archived: data.time?.archived ?? null,
        })
        .onConflictDoNothing()
        .run()
      stats.sessions++
    } catch (e) {
      stats.errors.push(`failed to migrate session ${file}: ${e}`)
    }
  }
  log.info("migrated sessions", { count: stats.sessions })

  // Migrate messages (depends on sessions)
  const messageGlob = new Bun.Glob("message/*/*.json")
  for await (const file of messageGlob.scan({ cwd: storageDir, absolute: true })) {
    try {
      const data = await Bun.file(file).json()
      if (!data.id || !data.sessionID) {
        stats.errors.push(`message missing id or sessionID: ${file}`)
        continue
      }
      // Check if session exists
      const session = db.select().from(SessionTable).where(eq(SessionTable.id, data.sessionID)).get()
      if (!session) {
        log.warn("skipping orphaned message", { messageID: data.id, sessionID: data.sessionID })
        continue
      }
      db.insert(MessageTable)
        .values({
          id: data.id,
          sessionID: data.sessionID,
          createdAt: data.time?.created ?? Date.now(),
          data,
        })
        .onConflictDoNothing()
        .run()
      stats.messages++
    } catch (e) {
      stats.errors.push(`failed to migrate message ${file}: ${e}`)
    }
  }
  log.info("migrated messages", { count: stats.messages })

  // Migrate parts (depends on messages)
  const partGlob = new Bun.Glob("part/*/*.json")
  for await (const file of partGlob.scan({ cwd: storageDir, absolute: true })) {
    try {
      const data = await Bun.file(file).json()
      if (!data.id || !data.messageID || !data.sessionID) {
        stats.errors.push(`part missing id, messageID, or sessionID: ${file}`)
        continue
      }
      // Check if message exists
      const message = db.select().from(MessageTable).where(eq(MessageTable.id, data.messageID)).get()
      if (!message) {
        log.warn("skipping orphaned part", { partID: data.id, messageID: data.messageID })
        continue
      }
      db.insert(PartTable)
        .values({
          id: data.id,
          messageID: data.messageID,
          sessionID: data.sessionID,
          data,
        })
        .onConflictDoNothing()
        .run()
      stats.parts++
    } catch (e) {
      stats.errors.push(`failed to migrate part ${file}: ${e}`)
    }
  }
  log.info("migrated parts", { count: stats.parts })

  // Migrate session diffs
  const diffGlob = new Bun.Glob("session_diff/*.json")
  for await (const file of diffGlob.scan({ cwd: storageDir, absolute: true })) {
    try {
      const data = await Bun.file(file).json()
      const sessionID = path.basename(file, ".json")
      // Check if session exists
      const session = db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get()
      if (!session) {
        log.warn("skipping orphaned session_diff", { sessionID })
        continue
      }
      db.insert(SessionDiffTable).values({ sessionID, data }).onConflictDoNothing().run()
      stats.diffs++
    } catch (e) {
      stats.errors.push(`failed to migrate session_diff ${file}: ${e}`)
    }
  }
  log.info("migrated session diffs", { count: stats.diffs })

  // Migrate todos
  const todoGlob = new Bun.Glob("todo/*.json")
  for await (const file of todoGlob.scan({ cwd: storageDir, absolute: true })) {
    try {
      const data = await Bun.file(file).json()
      const sessionID = path.basename(file, ".json")
      const session = db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get()
      if (!session) {
        log.warn("skipping orphaned todo", { sessionID })
        continue
      }
      db.insert(TodoTable).values({ sessionID, data }).onConflictDoNothing().run()
      stats.todos++
    } catch (e) {
      stats.errors.push(`failed to migrate todo ${file}: ${e}`)
    }
  }
  log.info("migrated todos", { count: stats.todos })

  // Migrate permissions
  const permGlob = new Bun.Glob("permission/*.json")
  for await (const file of permGlob.scan({ cwd: storageDir, absolute: true })) {
    try {
      const data = await Bun.file(file).json()
      const projectID = path.basename(file, ".json")
      const project = db.select().from(ProjectTable).where(eq(ProjectTable.id, projectID)).get()
      if (!project) {
        log.warn("skipping orphaned permission", { projectID })
        continue
      }
      db.insert(PermissionTable).values({ projectID, data }).onConflictDoNothing().run()
      stats.permissions++
    } catch (e) {
      stats.errors.push(`failed to migrate permission ${file}: ${e}`)
    }
  }
  log.info("migrated permissions", { count: stats.permissions })

  // Migrate session shares
  const shareGlob = new Bun.Glob("session_share/*.json")
  for await (const file of shareGlob.scan({ cwd: storageDir, absolute: true })) {
    try {
      const data = await Bun.file(file).json()
      const sessionID = path.basename(file, ".json")
      const session = db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get()
      if (!session) {
        log.warn("skipping orphaned session_share", { sessionID })
        continue
      }
      db.insert(SessionShareTable).values({ sessionID, data }).onConflictDoNothing().run()
      stats.shares++
    } catch (e) {
      stats.errors.push(`failed to migrate session_share ${file}: ${e}`)
    }
  }
  log.info("migrated session shares", { count: stats.shares })

  // Migrate shares (downloaded shared sessions, no FK)
  const share2Glob = new Bun.Glob("share/*.json")
  for await (const file of share2Glob.scan({ cwd: storageDir, absolute: true })) {
    try {
      const data = await Bun.file(file).json()
      const sessionID = path.basename(file, ".json")
      db.insert(ShareTable).values({ sessionID, data }).onConflictDoNothing().run()
    } catch (e) {
      stats.errors.push(`failed to migrate share ${file}: ${e}`)
    }
  }

  // Mark migration complete
  await Bun.write(migrationMarker, Date.now().toString())

  log.info("json migration complete", {
    projects: stats.projects,
    sessions: stats.sessions,
    messages: stats.messages,
    parts: stats.parts,
    diffs: stats.diffs,
    todos: stats.todos,
    permissions: stats.permissions,
    shares: stats.shares,
    errorCount: stats.errors.length,
  })

  if (stats.errors.length > 0) {
    log.warn("migration errors", { errors: stats.errors.slice(0, 20) })
  }

  return stats
}
