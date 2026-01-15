import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "./src/project/project.sql.ts",
    "./src/session/session.sql.ts",
    "./src/session/message.sql.ts",
    "./src/session/part.sql.ts",
    "./src/session/session-aux.sql.ts",
    "./src/share/share.sql.ts",
  ],
  out: "./drizzle",
})
