import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { eq } from "drizzle-orm"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { migrateFromJson } from "../../src/storage/json-migration"
import { ProjectTable } from "../../src/project/project.sql"
import { Project } from "../../src/project/project"
import {
  SessionTable,
  MessageTable,
  PartTable,
  SessionDiffTable,
  TodoTable,
  PermissionTable,
} from "../../src/session/session.sql"
import { SessionShareTable, ShareTable } from "../../src/share/share.sql"
import { migrations } from "../../src/storage/migrations.generated"

// Test fixtures
const fixtures = {
  project: {
    id: "proj_test123abc",
    name: "Test Project",
    worktree: "/test/path",
    vcs: "git" as const,
    sandboxes: [],
  },
  session: {
    id: "ses_test456def",
    projectID: "proj_test123abc",
    slug: "test-session",
    directory: "/test/path",
    title: "Test Session",
    version: "1.0.0",
    time: { created: 1700000000000, updated: 1700000001000 },
  },
  message: {
    id: "msg_test789ghi",
    sessionID: "ses_test456def",
    role: "user" as const,
    agent: "default",
    model: { providerID: "openai", modelID: "gpt-4" },
    time: { created: 1700000000000 },
  },
  part: {
    id: "prt_testabc123",
    messageID: "msg_test789ghi",
    sessionID: "ses_test456def",
    type: "text" as const,
    text: "Hello, world!",
  },
}

// Helper to create test storage directory structure
async function setupStorageDir(baseDir: string) {
  const storageDir = path.join(baseDir, "storage")
  await fs.mkdir(path.join(storageDir, "project"), { recursive: true })
  await fs.mkdir(path.join(storageDir, "session", "proj_test123abc"), { recursive: true })
  await fs.mkdir(path.join(storageDir, "message", "ses_test456def"), { recursive: true })
  await fs.mkdir(path.join(storageDir, "part", "msg_test789ghi"), { recursive: true })
  await fs.mkdir(path.join(storageDir, "session_diff"), { recursive: true })
  await fs.mkdir(path.join(storageDir, "todo"), { recursive: true })
  await fs.mkdir(path.join(storageDir, "permission"), { recursive: true })
  await fs.mkdir(path.join(storageDir, "session_share"), { recursive: true })
  await fs.mkdir(path.join(storageDir, "share"), { recursive: true })
  // Create legacy marker to indicate JSON storage exists
  await Bun.write(path.join(storageDir, "migration"), "1")
  return storageDir
}

// Helper to create in-memory test database with schema
function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.exec("PRAGMA foreign_keys = ON")

  // Apply schema migrations
  for (const migration of migrations) {
    const statements = migration.sql.split("--> statement-breakpoint")
    for (const stmt of statements) {
      const trimmed = stmt.trim()
      if (trimmed) sqlite.exec(trimmed)
    }
  }

  return sqlite
}

describe("JSON to SQLite migration", () => {
  let tmpDir: string
  let storageDir: string
  let sqlite: Database

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), "opencode-migration-test-" + Math.random().toString(36).slice(2))
    await fs.mkdir(tmpDir, { recursive: true })
    storageDir = await setupStorageDir(tmpDir)
    sqlite = createTestDb()
  })

  afterEach(async () => {
    sqlite.close()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe("basic functionality", () => {
    test("migrates all entity types successfully", async () => {
      // Write test fixtures
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, `${fixtures.session.id}.json`),
        JSON.stringify(fixtures.session),
      )
      await Bun.write(
        path.join(storageDir, "message", fixtures.session.id, `${fixtures.message.id}.json`),
        JSON.stringify(fixtures.message),
      )
      await Bun.write(
        path.join(storageDir, "part", fixtures.message.id, `${fixtures.part.id}.json`),
        JSON.stringify(fixtures.part),
      )

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.projects).toBe(1)
      expect(stats?.sessions).toBe(1)
      expect(stats?.messages).toBe(1)
      expect(stats?.parts).toBe(1)
      expect(stats?.errors.length).toBe(0)

      // Verify data in database
      const db = drizzle(sqlite)
      const projects = db.select().from(ProjectTable).all()
      expect(projects.length).toBe(1)
      expect(projects[0].id).toBe(fixtures.project.id)

      const sessions = db.select().from(SessionTable).all()
      expect(sessions.length).toBe(1)
      expect(sessions[0].id).toBe(fixtures.session.id)

      const messages = db.select().from(MessageTable).all()
      expect(messages.length).toBe(1)
      expect(messages[0].id).toBe(fixtures.message.id)

      const parts = db.select().from(PartTable).all()
      expect(parts.length).toBe(1)
      expect(parts[0].id).toBe(fixtures.part.id)
    })

    test("skips migration when marker file exists", async () => {
      // Create marker file
      await Bun.write(path.join(storageDir, "sqlite-migrated"), Date.now().toString())

      // Write project that should NOT be migrated
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats).toBeUndefined()

      // Verify nothing was migrated
      const db = drizzle(sqlite)
      const projects = db.select().from(ProjectTable).all()
      expect(projects.length).toBe(0)
    })

    test("skips migration when no JSON storage exists", async () => {
      // Remove the legacy migration marker
      await fs.rm(path.join(storageDir, "migration"))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats).toBeUndefined()

      // Marker file should be created
      const marker = await Bun.file(path.join(storageDir, "sqlite-migrated")).exists()
      expect(marker).toBe(true)
    })

    test("creates marker file after successful migration", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))

      await migrateFromJson(sqlite, storageDir)

      const marker = await Bun.file(path.join(storageDir, "sqlite-migrated")).exists()
      expect(marker).toBe(true)
    })
  })

  describe("project migration", () => {
    test("migrates project with all fields", async () => {
      const project = { ...fixtures.project, icon: { url: "data:image/png;base64,..." } }
      await Bun.write(path.join(storageDir, "project", `${project.id}.json`), JSON.stringify(project))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.projects).toBe(1)
      const db = drizzle(sqlite)
      const row = db.select().from(ProjectTable).where(eq(ProjectTable.id, project.id)).get()
      const migrated = row ? Project.fromRow(row) : undefined
      expect(migrated?.id).toBe(project.id)
      expect(migrated?.icon?.url).toBe(project.icon.url)
    })

    test("skips project with missing id field", async () => {
      const invalidProject = { name: "No ID Project" }
      await Bun.write(path.join(storageDir, "project", "invalid.json"), JSON.stringify(invalidProject))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.projects).toBe(0)
      expect(stats?.errors.length).toBe(1)
      expect(stats?.errors[0]).toContain("missing id")
    })

    test("skips project with invalid JSON", async () => {
      await Bun.write(path.join(storageDir, "project", "bad.json"), "{ invalid json }")

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.projects).toBe(0)
      expect(stats?.errors.length).toBe(1)
      expect(stats?.errors[0]).toContain("failed to migrate project")
    })
  })

  describe("session migration", () => {
    test("migrates session with valid projectID", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, `${fixtures.session.id}.json`),
        JSON.stringify(fixtures.session),
      )

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.sessions).toBe(1)
      const db = drizzle(sqlite)
      const row = db.select().from(SessionTable).where(eq(SessionTable.id, fixtures.session.id)).get()
      expect(row?.id).toBe(fixtures.session.id)
      expect(row?.projectID).toBe(fixtures.project.id)
      expect(row?.time_created).toBe(fixtures.session.time.created)
      expect(row?.time_updated).toBe(fixtures.session.time.updated)
    })

    test("migrates session with parentID", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      const childSession = { ...fixtures.session, id: "ses_child123", parentID: fixtures.session.id }

      // Create parent session first
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, `${fixtures.session.id}.json`),
        JSON.stringify(fixtures.session),
      )
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, `${childSession.id}.json`),
        JSON.stringify(childSession),
      )

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.sessions).toBe(2)
      const db = drizzle(sqlite)
      const row = db.select().from(SessionTable).where(eq(SessionTable.id, childSession.id)).get()
      expect(row?.parentID).toBe(fixtures.session.id)
    })

    test("skips orphaned session (missing project)", async () => {
      // Don't create the project, just the session
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, `${fixtures.session.id}.json`),
        JSON.stringify(fixtures.session),
      )

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.sessions).toBe(0)
      // Orphaned sessions are logged as warnings, not errors
      expect(stats?.errors.length).toBe(0)
    })

    test("handles missing time fields with Date.now() fallback", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      const sessionNoTime = { ...fixtures.session, time: undefined }
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, `${fixtures.session.id}.json`),
        JSON.stringify(sessionNoTime),
      )

      const before = Date.now()
      const stats = await migrateFromJson(sqlite, storageDir)
      const after = Date.now()

      expect(stats?.sessions).toBe(1)
      const db = drizzle(sqlite)
      const row = db.select().from(SessionTable).where(eq(SessionTable.id, fixtures.session.id)).get()
      expect(row?.time_created).toBeGreaterThanOrEqual(before)
      expect(row?.time_created).toBeLessThanOrEqual(after)
    })

    test("skips session with missing required fields", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      const invalidSession = { id: "ses_noproj" } // missing projectID
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, "invalid.json"),
        JSON.stringify(invalidSession),
      )

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.sessions).toBe(0)
      expect(stats?.errors.length).toBe(1)
      expect(stats?.errors[0]).toContain("missing id or projectID")
    })
  })

  describe("message migration", () => {
    test("migrates message with valid sessionID", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, `${fixtures.session.id}.json`),
        JSON.stringify(fixtures.session),
      )
      await Bun.write(
        path.join(storageDir, "message", fixtures.session.id, `${fixtures.message.id}.json`),
        JSON.stringify(fixtures.message),
      )

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.messages).toBe(1)
      const db = drizzle(sqlite)
      const row = db.select().from(MessageTable).where(eq(MessageTable.id, fixtures.message.id)).get()
      expect(row?.data.id).toBe(fixtures.message.id)
      expect(row?.sessionID).toBe(fixtures.session.id)
    })

    test("skips orphaned message (missing session)", async () => {
      // Don't create the session, just the message
      await Bun.write(
        path.join(storageDir, "message", fixtures.session.id, `${fixtures.message.id}.json`),
        JSON.stringify(fixtures.message),
      )

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.messages).toBe(0)
    })

    test("skips message with missing required fields", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, `${fixtures.session.id}.json`),
        JSON.stringify(fixtures.session),
      )
      const invalidMessage = { id: "msg_nosess" } // missing sessionID
      await Bun.write(
        path.join(storageDir, "message", fixtures.session.id, "invalid.json"),
        JSON.stringify(invalidMessage),
      )

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.messages).toBe(0)
      expect(stats?.errors.length).toBe(1)
      expect(stats?.errors[0]).toContain("missing id or sessionID")
    })
  })

  describe("part migration", () => {
    test("migrates part with valid messageID", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, `${fixtures.session.id}.json`),
        JSON.stringify(fixtures.session),
      )
      await Bun.write(
        path.join(storageDir, "message", fixtures.session.id, `${fixtures.message.id}.json`),
        JSON.stringify(fixtures.message),
      )
      await Bun.write(
        path.join(storageDir, "part", fixtures.message.id, `${fixtures.part.id}.json`),
        JSON.stringify(fixtures.part),
      )

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.parts).toBe(1)
      const db = drizzle(sqlite)
      const row = db.select().from(PartTable).where(eq(PartTable.id, fixtures.part.id)).get()
      expect(row?.data.id).toBe(fixtures.part.id)
      expect(row?.messageID).toBe(fixtures.message.id)
      expect(row?.sessionID).toBe(fixtures.session.id)
    })

    test("skips orphaned part (missing message)", async () => {
      await Bun.write(
        path.join(storageDir, "part", fixtures.message.id, `${fixtures.part.id}.json`),
        JSON.stringify(fixtures.part),
      )

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.parts).toBe(0)
    })

    test("skips part with missing required fields", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, `${fixtures.session.id}.json`),
        JSON.stringify(fixtures.session),
      )
      await Bun.write(
        path.join(storageDir, "message", fixtures.session.id, `${fixtures.message.id}.json`),
        JSON.stringify(fixtures.message),
      )
      const invalidPart = { id: "prt_nomsg" } // missing messageID and sessionID
      await Bun.write(path.join(storageDir, "part", fixtures.message.id, "invalid.json"), JSON.stringify(invalidPart))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.parts).toBe(0)
      expect(stats?.errors.length).toBe(1)
      expect(stats?.errors[0]).toContain("missing id, messageID, or sessionID")
    })
  })

  describe("auxiliary tables", () => {
    test("migrates session_diff correctly", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, `${fixtures.session.id}.json`),
        JSON.stringify(fixtures.session),
      )
      const diff = [{ file: "test.ts", before: "", after: "", additions: 10, deletions: 5 }]
      await Bun.write(path.join(storageDir, "session_diff", `${fixtures.session.id}.json`), JSON.stringify(diff))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.diffs).toBe(1)
      const db = drizzle(sqlite)
      const row = db.select().from(SessionDiffTable).where(eq(SessionDiffTable.sessionID, fixtures.session.id)).get()
      expect(row?.data).toBeDefined()
    })

    test("migrates todo correctly", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, `${fixtures.session.id}.json`),
        JSON.stringify(fixtures.session),
      )
      const todo = [{ id: "1", content: "Test todo", status: "pending", priority: "high" }]
      await Bun.write(path.join(storageDir, "todo", `${fixtures.session.id}.json`), JSON.stringify(todo))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.todos).toBe(1)
      const db = drizzle(sqlite)
      const row = db.select().from(TodoTable).where(eq(TodoTable.sessionID, fixtures.session.id)).get()
      expect(row?.data).toBeDefined()
    })

    test("migrates permission correctly", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      const permission = [{ permission: "bash", pattern: "*", action: "allow" as const }]
      await Bun.write(path.join(storageDir, "permission", `${fixtures.project.id}.json`), JSON.stringify(permission))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.permissions).toBe(1)
      const db = drizzle(sqlite)
      const row = db.select().from(PermissionTable).where(eq(PermissionTable.projectID, fixtures.project.id)).get()
      expect(row?.data).toBeDefined()
    })

    test("migrates session_share correctly", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      await Bun.write(
        path.join(storageDir, "session", fixtures.project.id, `${fixtures.session.id}.json`),
        JSON.stringify(fixtures.session),
      )
      const share = { id: "share_123", secret: "abc123", url: "https://share.example.com/abc123" }
      await Bun.write(path.join(storageDir, "session_share", `${fixtures.session.id}.json`), JSON.stringify(share))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.shares).toBe(1)
      const db = drizzle(sqlite)
      const row = db.select().from(SessionShareTable).where(eq(SessionShareTable.sessionID, fixtures.session.id)).get()
      expect(row?.data.secret).toBe("abc123")
    })

    test("migrates share correctly (no FK check)", async () => {
      // Share table has no FK, so we can create without project/session
      const share = { secret: "test_secret", url: "https://example.com/share" }
      const shareID = "ses_shared123"
      await Bun.write(path.join(storageDir, "share", `${shareID}.json`), JSON.stringify(share))

      const stats = await migrateFromJson(sqlite, storageDir)

      // Note: shares count is tracked under stats.shares but share table is migrated separately
      const db = drizzle(sqlite)
      const row = db.select().from(ShareTable).where(eq(ShareTable.sessionID, shareID)).get()
      expect(row?.data.secret).toBe("test_secret")
    })

    test("skips orphaned session_diff", async () => {
      const diff = { files: [] }
      await Bun.write(path.join(storageDir, "session_diff", "ses_nonexistent.json"), JSON.stringify(diff))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.diffs).toBe(0)
    })

    test("skips orphaned todo", async () => {
      const todo = { items: [] }
      await Bun.write(path.join(storageDir, "todo", "ses_nonexistent.json"), JSON.stringify(todo))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.todos).toBe(0)
    })

    test("skips orphaned permission", async () => {
      const permission = { rules: [] }
      await Bun.write(path.join(storageDir, "permission", "proj_nonexistent.json"), JSON.stringify(permission))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.permissions).toBe(0)
    })

    test("skips orphaned session_share", async () => {
      const share = { secret: "test" }
      await Bun.write(path.join(storageDir, "session_share", "ses_nonexistent.json"), JSON.stringify(share))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.shares).toBe(0)
    })
  })

  describe("error handling", () => {
    test("continues migration after single file error", async () => {
      // Write one valid and one invalid project
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))
      await Bun.write(path.join(storageDir, "project", "invalid.json"), "{ invalid json }")

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.projects).toBe(1) // Valid one was migrated
      expect(stats?.errors.length).toBe(1) // Error was recorded
    })

    test("collects all errors in stats.errors array", async () => {
      // Write multiple invalid files
      await Bun.write(path.join(storageDir, "project", "bad1.json"), "{ invalid }")
      await Bun.write(path.join(storageDir, "project", "bad2.json"), "not json at all")
      await Bun.write(path.join(storageDir, "project", "bad3.json"), JSON.stringify({ name: "no id" }))

      const stats = await migrateFromJson(sqlite, storageDir)

      expect(stats?.projects).toBe(0)
      expect(stats?.errors.length).toBe(3)
    })
  })

  describe("data integrity", () => {
    test("preserves all JSON data fields in data column", async () => {
      const fullProject = {
        id: "proj_full",
        name: "Full Project",
        worktree: "/path/to/project",
        vcs: "git" as const,
        sandboxes: ["/path/one", "/path/two"],
        time: { created: 1700000000000, updated: 1700000001000 },
        icon: { url: "data:image/png;base64,abc", color: "#ff0000" },
      }
      await Bun.write(path.join(storageDir, "project", `${fullProject.id}.json`), JSON.stringify(fullProject))

      await migrateFromJson(sqlite, storageDir)

      const db = drizzle(sqlite)
      const row = db.select().from(ProjectTable).where(eq(ProjectTable.id, fullProject.id)).get()
      const data = row ? Project.fromRow(row) : undefined
      expect(data?.id).toBe(fullProject.id)
      expect(data?.name).toBe(fullProject.name)
      expect(data?.sandboxes).toEqual(fullProject.sandboxes)
      expect(data?.icon?.color).toBe("#ff0000")
    })

    test("handles unicode in text fields", async () => {
      const unicodeProject = {
        id: "proj_unicode",
        name: "Проект с юникодом 🚀",
        worktree: "/path/测试",
        vcs: "git" as const,
        sandboxes: [],
      }
      await Bun.write(path.join(storageDir, "project", `${unicodeProject.id}.json`), JSON.stringify(unicodeProject))

      await migrateFromJson(sqlite, storageDir)

      const db = drizzle(sqlite)
      const row = db.select().from(ProjectTable).where(eq(ProjectTable.id, unicodeProject.id)).get()
      const data = row ? Project.fromRow(row) : undefined
      expect(data?.name).toBe("Проект с юникодом 🚀")
      expect(data?.worktree).toBe("/path/测试")
    })

    test("migration is idempotent with onConflictDoNothing", async () => {
      await Bun.write(path.join(storageDir, "project", `${fixtures.project.id}.json`), JSON.stringify(fixtures.project))

      // Run migration twice (manually, since marker file would block second run)
      const stats1 = await migrateFromJson(sqlite, storageDir)
      expect(stats1?.projects).toBe(1)

      // Remove marker and run again
      await fs.rm(path.join(storageDir, "sqlite-migrated"))
      const stats2 = await migrateFromJson(sqlite, storageDir)
      expect(stats2?.projects).toBe(1) // Would be 1 even though already exists (onConflictDoNothing)

      // Verify only one record exists
      const db = drizzle(sqlite)
      const projects = db.select().from(ProjectTable).all()
      expect(projects.length).toBe(1)
    })
  })
})
