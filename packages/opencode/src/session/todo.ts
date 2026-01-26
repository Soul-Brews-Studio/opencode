import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import z from "zod"
import { Database, eq } from "../storage/db"
import { TodoTable } from "./session.sql"

export namespace Todo {
  export const Info = z
    .object({
      content: z.string().describe("Brief description of the task"),
      status: z.string().describe("Current status of the task: pending, in_progress, completed, cancelled"),
      priority: z.string().describe("Priority level of the task: high, medium, low"),
      id: z.string().describe("Unique identifier for the todo item"),
    })
    .meta({ ref: "Todo" })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Updated: BusEvent.define(
      "todo.updated",
      z.object({
        sessionID: z.string(),
        todos: z.array(Info),
      }),
    ),
  }

  export function update(input: { sessionID: string; todos: Info[] }) {
    Database.use((db) =>
      db
        .insert(TodoTable)
        .values({ sessionID: input.sessionID, data: input.todos })
        .onConflictDoUpdate({ target: TodoTable.sessionID, set: { data: input.todos } })
        .run(),
    )
    Bus.publish(Event.Updated, input)
  }

  export function get(sessionID: string) {
    const row = Database.use((db) => db.select().from(TodoTable).where(eq(TodoTable.sessionID, sessionID)).get())
    return row?.data ?? []
  }
}
