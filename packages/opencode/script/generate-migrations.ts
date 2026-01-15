#!/usr/bin/env bun

import { Glob } from "bun"
import path from "path"
import fs from "fs"

const migrationsDir = "./drizzle"
const outFile = "./src/storage/migrations.generated.ts"

if (!fs.existsSync(migrationsDir)) {
  console.log("No migrations directory found, creating empty migrations file")
  await Bun.write(
    outFile,
    `// Auto-generated - do not edit
export const migrations: { name: string; sql: string }[] = []
`,
  )
  process.exit(0)
}

const files = Array.from(new Glob("*.sql").scanSync({ cwd: migrationsDir })).sort()

if (files.length === 0) {
  console.log("No migrations found, creating empty migrations file")
  await Bun.write(
    outFile,
    `// Auto-generated - do not edit
export const migrations: { name: string; sql: string }[] = []
`,
  )
  process.exit(0)
}

const imports = files.map((f, i) => `import m${i} from "../../drizzle/${f}" with { type: "text" }`).join("\n")

const entries = files.map((f, i) => `  { name: "${path.basename(f, ".sql")}", sql: m${i} },`).join("\n")

await Bun.write(
  outFile,
  `// Auto-generated - do not edit
${imports}

export const migrations = [
${entries}
]
`,
)

console.log(`Generated migrations file with ${files.length} migrations`)
