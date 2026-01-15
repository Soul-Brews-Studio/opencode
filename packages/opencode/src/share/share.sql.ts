import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { SessionTable } from "../session/session.sql"
import type { Session } from "../session"

export const SessionShareTable = sqliteTable("session_share", {
  sessionID: text("session_id")
    .primaryKey()
    .references(() => SessionTable.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).notNull().$type<{
    id: string
    secret: string
    url: string
  }>(),
})

export const ShareTable = sqliteTable("share", {
  sessionID: text("session_id").primaryKey(),
  data: text("data", { mode: "json" }).notNull().$type<Session.ShareInfo>(),
})
