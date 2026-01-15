import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { SessionTable } from "./session.sql"
import type { MessageV2 } from "./message-v2"

export const MessageTable = sqliteTable(
  "message",
  {
    id: text("id").primaryKey(),
    sessionID: text("session_id")
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    data: text("data", { mode: "json" }).notNull().$type<MessageV2.Info>(),
  },
  (table) => [index("message_session_idx").on(table.sessionID)],
)
