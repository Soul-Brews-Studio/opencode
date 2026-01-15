import { sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import { MessageTable } from "./message.sql"
import type { MessageV2 } from "./message-v2"

export const PartTable = sqliteTable(
  "part",
  {
    id: text("id").primaryKey(),
    messageID: text("message_id")
      .notNull()
      .references(() => MessageTable.id, { onDelete: "cascade" }),
    sessionID: text("session_id").notNull(),
    data: text("data", { mode: "json" }).notNull().$type<MessageV2.Part>(),
  },
  (table) => [index("part_message_idx").on(table.messageID), index("part_session_idx").on(table.sessionID)],
)
