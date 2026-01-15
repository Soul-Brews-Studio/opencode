import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { Project } from "./project"

export const ProjectTable = sqliteTable("project", {
  id: text("id").primaryKey(),
  data: text("data", { mode: "json" }).notNull().$type<Project.Info>(),
})
