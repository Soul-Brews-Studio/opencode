import { Database as BunDatabase } from "bun:sqlite"
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core"
import type { ExtractTablesWithRelations } from "drizzle-orm"
export * from "drizzle-orm"
import { Context } from "../util/context"
import { lazy } from "../util/lazy"
import { Global } from "../global"
import { Log } from "../util/log"
import { migrations } from "./migrations.generated"
import { migrateFromJson } from "./json-migration"
import { NamedError } from "@opencode-ai/util/error"
import z from "zod"
import path from "path"

export const NotFoundError = NamedError.create(
  "NotFoundError",
  z.object({
    message: z.string(),
  }),
)

const log = Log.create({ service: "db" })

export namespace Database {
  export type Transaction = SQLiteTransaction<
    "sync",
    void,
    Record<string, never>,
    ExtractTablesWithRelations<Record<string, never>>
  >

  type Client = BunSQLiteDatabase<Record<string, never>>

  const client = lazy(() => {
    const dbPath = path.join(Global.Path.data, "opencode.db")
    log.info("opening database", { path: dbPath })

    const sqlite = new BunDatabase(dbPath, { create: true })

    sqlite.run("PRAGMA journal_mode = WAL")
    sqlite.run("PRAGMA synchronous = NORMAL")
    sqlite.run("PRAGMA busy_timeout = 5000")
    sqlite.run("PRAGMA cache_size = -64000")
    sqlite.run("PRAGMA foreign_keys = ON")

    migrate(sqlite)

    migrateFromJson(sqlite).catch((e) => log.error("json migration failed", { error: e }))

    return drizzle(sqlite)
  })

  export type TxOrDb = Transaction | Client

  const TransactionContext = Context.create<{
    tx: TxOrDb
    effects: (() => void | Promise<void>)[]
  }>("database")

  export function use<T>(callback: (trx: TxOrDb) => T): T {
    try {
      const { tx } = TransactionContext.use()
      return callback(tx)
    } catch (err) {
      if (err instanceof Context.NotFound) {
        const effects: (() => void | Promise<void>)[] = []
        const result = TransactionContext.provide({ effects, tx: client() }, () => callback(client()))
        for (const effect of effects) effect()
        return result
      }
      throw err
    }
  }

  export function effect(effect: () => void | Promise<void>) {
    try {
      const { effects } = TransactionContext.use()
      effects.push(effect)
    } catch {
      effect()
    }
  }

  export function transaction<T>(callback: (tx: TxOrDb) => T): T {
    try {
      const { tx } = TransactionContext.use()
      return callback(tx)
    } catch (err) {
      if (err instanceof Context.NotFound) {
        const effects: (() => void | Promise<void>)[] = []
        const result = client().transaction((tx) => {
          return TransactionContext.provide({ tx, effects }, () => callback(tx))
        })
        for (const effect of effects) effect()
        return result
      }
      throw err
    }
  }
}

function migrate(sqlite: BunDatabase) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `)

  const applied = new Set(
    sqlite
      .query<{ name: string }, []>("SELECT name FROM _migrations")
      .all()
      .map((r) => r.name),
  )

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue
    log.info("applying migration", { name: migration.name })

    const statements = migration.sql.split("--> statement-breakpoint")
    for (const stmt of statements) {
      const trimmed = stmt.trim()
      if (!trimmed) continue

      try {
        sqlite.exec(trimmed)
      } catch (e: any) {
        if (e?.message?.includes("already exists")) {
          log.info("skipping existing object", { statement: trimmed.slice(0, 50) })
          continue
        }
        throw e
      }
    }

    sqlite.run("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)", [migration.name, Date.now()])
  }
}
