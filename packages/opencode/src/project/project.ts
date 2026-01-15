import z from "zod"
import fs from "fs/promises"
import { Filesystem } from "../util/filesystem"
import path from "path"
import { $ } from "bun"
import { db } from "../storage/db"
import { ProjectTable } from "./project.sql"
import { SessionTable } from "../session/session.sql"
import { eq } from "drizzle-orm"
import { Log } from "../util/log"
import { Flag } from "@/flag/flag"
import type { Session } from "../session"
import { work } from "../util/queue"
import { fn } from "@opencode-ai/util/fn"
import { BusEvent } from "@/bus/bus-event"
import { iife } from "@/util/iife"
import { GlobalBus } from "@/bus/global"
import { existsSync } from "fs"

export namespace Project {
  const log = Log.create({ service: "project" })
  export const Info = z
    .object({
      id: z.string(),
      worktree: z.string(),
      vcs: z.literal("git").optional(),
      name: z.string().optional(),
      icon: z
        .object({
          url: z.string().optional(),
          override: z.string().optional(),
          color: z.string().optional(),
        })
        .optional(),
      commands: z
        .object({
          start: z.string().optional().describe("Startup script to run when creating a new workspace (worktree)"),
        })
        .optional(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
        initialized: z.number().optional(),
      }),
      sandboxes: z.array(z.string()),
    })
    .meta({
      ref: "Project",
    })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Updated: BusEvent.define("project.updated", Info),
  }

  export async function fromDirectory(directory: string) {
    log.info("fromDirectory", { directory })

    const { id, sandbox, worktree, vcs } = await iife(async () => {
      const matches = Filesystem.up({ targets: [".git"], start: directory })
      const git = await matches.next().then((x) => x.value)
      await matches.return()
      if (git) {
        let sandbox = path.dirname(git)

        const gitBinary = Bun.which("git")

        // cached id calculation
        let id = await Bun.file(path.join(git, "opencode"))
          .text()
          .then((x) => x.trim())
          .catch(() => undefined)

        if (!gitBinary) {
          return {
            id: id ?? "global",
            worktree: sandbox,
            sandbox: sandbox,
            vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
          }
        }

        // generate id from root commit
        if (!id) {
          const roots = await $`git rev-list --max-parents=0 --all`
            .quiet()
            .nothrow()
            .cwd(sandbox)
            .text()
            .then((x) =>
              x
                .split("\n")
                .filter(Boolean)
                .map((x) => x.trim())
                .toSorted(),
            )
            .catch(() => undefined)

          if (!roots) {
            return {
              id: "global",
              worktree: sandbox,
              sandbox: sandbox,
              vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
            }
          }

          id = roots[0]
          if (id) {
            void Bun.file(path.join(git, "opencode"))
              .write(id)
              .catch(() => undefined)
          }
        }

        if (!id) {
          return {
            id: "global",
            worktree: sandbox,
            sandbox: sandbox,
            vcs: "git",
          }
        }

        const top = await $`git rev-parse --show-toplevel`
          .quiet()
          .nothrow()
          .cwd(sandbox)
          .text()
          .then((x) => path.resolve(sandbox, x.trim()))
          .catch(() => undefined)

        if (!top) {
          return {
            id,
            sandbox,
            worktree: sandbox,
            vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
          }
        }

        sandbox = top

        const worktree = await $`git rev-parse --git-common-dir`
          .quiet()
          .nothrow()
          .cwd(sandbox)
          .text()
          .then((x) => {
            const dirname = path.dirname(x.trim())
            if (dirname === ".") return sandbox
            return dirname
          })
          .catch(() => undefined)

        if (!worktree) {
          return {
            id,
            sandbox,
            worktree: sandbox,
            vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
          }
        }

        return {
          id,
          sandbox,
          worktree,
          vcs: "git",
        }
      }

      return {
        id: "global",
        worktree: "/",
        sandbox: "/",
        vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
      }
    })

    const row = db().select().from(ProjectTable).where(eq(ProjectTable.id, id)).get()
    let existing = row?.data
    if (!existing) {
      existing = {
        id,
        worktree,
        vcs: vcs as Info["vcs"],
        sandboxes: [],
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      }
      if (id !== "global") {
        await migrateFromGlobal(id, worktree)
      }
    }

    // migrate old projects before sandboxes
    if (!existing.sandboxes) existing.sandboxes = []

    if (Flag.OPENCODE_EXPERIMENTAL_ICON_DISCOVERY) discover(existing)

    const result: Info = {
      ...existing,
      worktree,
      vcs: vcs as Info["vcs"],
      time: {
        ...existing.time,
        updated: Date.now(),
      },
    }
    if (sandbox !== result.worktree && !result.sandboxes.includes(sandbox)) result.sandboxes.push(sandbox)
    result.sandboxes = result.sandboxes.filter((x) => existsSync(x))
    db()
      .insert(ProjectTable)
      .values({ id, data: result })
      .onConflictDoUpdate({ target: ProjectTable.id, set: { data: result } })
      .run()
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })
    return { project: result, sandbox }
  }

  export async function discover(input: Info) {
    if (input.vcs !== "git") return
    if (input.icon?.override) return
    if (input.icon?.url) return
    const glob = new Bun.Glob("**/{favicon}.{ico,png,svg,jpg,jpeg,webp}")
    const matches = await Array.fromAsync(
      glob.scan({
        cwd: input.worktree,
        absolute: true,
        onlyFiles: true,
        followSymlinks: false,
        dot: false,
      }),
    )
    const shortest = matches.sort((a, b) => a.length - b.length)[0]
    if (!shortest) return
    const file = Bun.file(shortest)
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString("base64")
    const mime = file.type || "image/png"
    const url = `data:${mime};base64,${base64}`
    await update({
      projectID: input.id,
      icon: {
        url,
      },
    })
    return
  }

  async function migrateFromGlobal(newProjectID: string, worktree: string) {
    const globalRow = db().select().from(ProjectTable).where(eq(ProjectTable.id, "global")).get()
    if (!globalRow) return

    const globalSessions = db().select().from(SessionTable).where(eq(SessionTable.projectID, "global")).all()
    if (globalSessions.length === 0) return

    log.info("migrating sessions from global", { newProjectID, worktree, count: globalSessions.length })

    await work(10, globalSessions, async (row) => {
      const session = row.data as Session.Info
      if (!session) return
      if (session.directory && session.directory !== worktree) return

      session.projectID = newProjectID
      log.info("migrating session", { sessionID: session.id, from: "global", to: newProjectID })
      db()
        .update(SessionTable)
        .set({ projectID: newProjectID, data: session })
        .where(eq(SessionTable.id, session.id))
        .run()
    }).catch((error) => {
      log.error("failed to migrate sessions from global to project", { error, projectId: newProjectID })
    })
  }

  export function setInitialized(projectID: string) {
    const row = db().select().from(ProjectTable).where(eq(ProjectTable.id, projectID)).get()
    if (!row) return
    const data = { ...row.data, time: { ...row.data.time, initialized: Date.now() } }
    db().update(ProjectTable).set({ data }).where(eq(ProjectTable.id, projectID)).run()
  }

  export function list() {
    return db()
      .select()
      .from(ProjectTable)
      .all()
      .map((row) => row.data)
  }

  export const update = fn(
    z.object({
      projectID: z.string(),
      name: z.string().optional(),
      icon: Info.shape.icon.optional(),
      commands: Info.shape.commands.optional(),
    }),
    async (input) => {
      const row = db().select().from(ProjectTable).where(eq(ProjectTable.id, input.projectID)).get()
      if (!row) throw new Error(`Project not found: ${input.projectID}`)
      const data = { ...row.data }
      if (input.name !== undefined) data.name = input.name
      if (input.icon !== undefined) {
        data.icon = { ...data.icon }
        if (input.icon.url !== undefined) data.icon.url = input.icon.url
        if (input.icon.override !== undefined) data.icon.override = input.icon.override || undefined
        if (input.icon.color !== undefined) data.icon.color = input.icon.color
      }
      if (input.commands?.start !== undefined) {
        const start = input.commands.start || undefined
        data.commands = { ...(data.commands ?? {}) }
        data.commands.start = start
        if (!data.commands.start) data.commands = undefined
      }
      data.time.updated = Date.now()
      db().update(ProjectTable).set({ data }).where(eq(ProjectTable.id, input.projectID)).run()
      GlobalBus.emit("event", {
        payload: {
          type: Event.Updated.type,
          properties: data,
        },
      })
      return data
    },
  )

  export async function sandboxes(projectID: string) {
    const row = db().select().from(ProjectTable).where(eq(ProjectTable.id, projectID)).get()
    if (!row?.data.sandboxes) return []
    const valid: string[] = []
    for (const dir of row.data.sandboxes) {
      const stat = await fs.stat(dir).catch(() => undefined)
      if (stat?.isDirectory()) valid.push(dir)
    }
    return valid
  }

  export async function addSandbox(projectID: string, directory: string) {
    const row = db().select().from(ProjectTable).where(eq(ProjectTable.id, projectID)).get()
    if (!row) throw new Error(`Project not found: ${projectID}`)
    const data = { ...row.data }
    const sandboxes = data.sandboxes ?? []
    if (!sandboxes.includes(directory)) sandboxes.push(directory)
    data.sandboxes = sandboxes
    data.time.updated = Date.now()
    db().update(ProjectTable).set({ data }).where(eq(ProjectTable.id, projectID)).run()
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: data,
      },
    })
    return data
  }

  export async function removeSandbox(projectID: string, directory: string) {
    const row = db().select().from(ProjectTable).where(eq(ProjectTable.id, projectID)).get()
    if (!row) throw new Error(`Project not found: ${projectID}`)
    const data = { ...row.data }
    const sandboxes = data.sandboxes ?? []
    data.sandboxes = sandboxes.filter((sandbox) => sandbox !== directory)
    data.time.updated = Date.now()
    db().update(ProjectTable).set({ data }).where(eq(ProjectTable.id, projectID)).run()
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: data,
      },
    })
    return data
  }
}
