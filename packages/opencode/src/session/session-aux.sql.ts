import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { SessionTable } from "./session.sql"
import { ProjectTable } from "../project/project.sql"
import type { Snapshot } from "@/snapshot"
import type { Todo } from "./todo"
import type { PermissionNext } from "@/permission/next"

export const SessionDiffTable = sqliteTable("session_diff", {
  sessionID: text("session_id")
    .primaryKey()
    .references(() => SessionTable.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).notNull().$type<Snapshot.FileDiff[]>(),
})

export const TodoTable = sqliteTable("todo", {
  sessionID: text("session_id")
    .primaryKey()
    .references(() => SessionTable.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).notNull().$type<Todo.Info[]>(),
})

export const PermissionTable = sqliteTable("permission", {
  projectID: text("project_id")
    .primaryKey()
    .references(() => ProjectTable.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).notNull().$type<PermissionNext.Ruleset>(),
})
