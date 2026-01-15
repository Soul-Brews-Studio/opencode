import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { ProjectTable } from "../project/project.sql"
import type { Session } from "./index"

export const SessionTable = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    projectID: text("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    parentID: text("parent_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    data: text("data", { mode: "json" }).notNull().$type<Session.Info>(),
  },
  (table) => [index("session_project_idx").on(table.projectID), index("session_parent_idx").on(table.parentID)],
)
