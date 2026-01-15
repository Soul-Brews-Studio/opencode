import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { ProjectTable } from "../project/project.sql"
import type { MessageV2 } from "./message-v2"
import type { Snapshot } from "@/snapshot"
import type { Todo } from "./todo"
import type { PermissionNext } from "@/permission/next"

export const SessionTable = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    projectID: text("project_id")
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    parentID: text("parent_id"),
    slug: text("slug").notNull(),
    directory: text("directory").notNull(),
    title: text("title").notNull(),
    version: text("version").notNull(),
    share_url: text("share_url"),
    summary_additions: integer("summary_additions"),
    summary_deletions: integer("summary_deletions"),
    summary_files: integer("summary_files"),
    summary_diffs: text("summary_diffs", { mode: "json" }).$type<Snapshot.FileDiff[]>(),
    revert_messageID: text("revert_message_id"),
    revert_partID: text("revert_part_id"),
    revert_snapshot: text("revert_snapshot"),
    revert_diff: text("revert_diff"),
    permission: text("permission", { mode: "json" }).$type<PermissionNext.Ruleset>(),
    time_created: integer("time_created").notNull(),
    time_updated: integer("time_updated").notNull(),
    time_compacting: integer("time_compacting"),
    time_archived: integer("time_archived"),
  },
  (table) => [index("session_project_idx").on(table.projectID), index("session_parent_idx").on(table.parentID)],
)

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
