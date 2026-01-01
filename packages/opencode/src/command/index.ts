import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import z from "zod"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Identifier } from "../id/id"
import { Installation } from "../installation"
import PROMPT_INITIALIZE from "./template/initialize.txt"
import PROMPT_REVIEW from "./template/review.txt"
import PROMPT_LEARN from "./template/learn.txt"
import PROMPT_QUIZ from "./template/quiz.txt"
import PROMPT_WALKTHROUGH from "./template/walkthrough.txt"
import PROMPT_EXPLAIN from "./template/explain.txt"

export namespace Command {
  export const Event = {
    Executed: BusEvent.define(
      "command.executed",
      z.object({
        name: z.string(),
        sessionID: Identifier.schema("session"),
        arguments: z.string(),
        messageID: Identifier.schema("message"),
      }),
    ),
  }

  export const Info = z
    .object({
      name: z.string(),
      description: z.string().optional(),
      agent: z.string().optional(),
      model: z.string().optional(),
      template: z.string(),
      subtask: z.boolean().optional(),
    })
    .meta({
      ref: "Command",
    })
  export type Info = z.infer<typeof Info>

  export const Default = {
    INIT: "init",
    REVIEW: "review",
    // Dev-only learning commands
    LEARN: "learn",
    QUIZ: "quiz",
    WALKTHROUGH: "walkthrough",
    EXPLAIN: "explain",
  } as const

  const state = Instance.state(async () => {
    const cfg = await Config.get()

    const result: Record<string, Info> = {
      [Default.INIT]: {
        name: Default.INIT,
        description: "create/update AGENTS.md",
        template: PROMPT_INITIALIZE.replace("${path}", Instance.worktree),
      },
      [Default.REVIEW]: {
        name: Default.REVIEW,
        description: "review changes [commit|branch|pr], defaults to uncommitted",
        template: PROMPT_REVIEW.replace("${path}", Instance.worktree),
        subtask: true,
      },
    }

    // Dev-only learning commands for core team
    if (Installation.isLocal()) {
      result[Default.LEARN] = {
        name: Default.LEARN,
        description: "learn about the codebase",
        template: PROMPT_LEARN,
        agent: "learn",
      }
      result[Default.QUIZ] = {
        name: Default.QUIZ,
        description: "test your codebase knowledge",
        template: PROMPT_QUIZ,
        agent: "learn",
      }
      result[Default.WALKTHROUGH] = {
        name: Default.WALKTHROUGH,
        description: "guided tour of the codebase [topic]",
        template: PROMPT_WALKTHROUGH,
        agent: "learn",
      }
      result[Default.EXPLAIN] = {
        name: Default.EXPLAIN,
        description: "explain a file or module [@file|topic]",
        template: PROMPT_EXPLAIN,
        agent: "learn",
      }
    }

    for (const [name, command] of Object.entries(cfg.command ?? {})) {
      result[name] = {
        name,
        agent: command.agent,
        model: command.model,
        description: command.description,
        template: command.template,
        subtask: command.subtask,
      }
    }

    return result
  })

  export async function get(name: string) {
    return state().then((x) => x[name])
  }

  export async function list() {
    return state().then((x) => Object.values(x))
  }
}
