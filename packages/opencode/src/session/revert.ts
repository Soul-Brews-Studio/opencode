import z from "zod"
import { Identifier } from "../id/id"
import { Snapshot } from "../snapshot"
import { MessageV2 } from "./message-v2"
import { Session } from "."
import { Log } from "../util/log"
import { splitWhen } from "remeda"
import { db } from "../storage/db"
import { MessageTable, PartTable, SessionTable, SessionDiffTable } from "./session.sql"
import { eq } from "drizzle-orm"
import { Bus } from "../bus"
import { SessionPrompt } from "./prompt"
import { SessionSummary } from "./summary"

export namespace SessionRevert {
  const log = Log.create({ service: "session.revert" })

  export const RevertInput = z.object({
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message"),
    partID: Identifier.schema("part").optional(),
  })
  export type RevertInput = z.infer<typeof RevertInput>

  export async function revert(input: RevertInput) {
    SessionPrompt.assertNotBusy(input.sessionID)
    const all = await Session.messages({ sessionID: input.sessionID })
    let lastUser: MessageV2.User | undefined
    const session = await Session.get(input.sessionID)

    let revert: Session.Info["revert"]
    const patches: Snapshot.Patch[] = []
    for (const msg of all) {
      if (msg.info.role === "user") lastUser = msg.info
      const remaining = []
      for (const part of msg.parts) {
        if (revert) {
          if (part.type === "patch") {
            patches.push(part)
          }
          continue
        }

        if (!revert) {
          if ((msg.info.id === input.messageID && !input.partID) || part.id === input.partID) {
            // if no useful parts left in message, same as reverting whole message
            const partID = remaining.some((item) => ["text", "tool"].includes(item.type)) ? input.partID : undefined
            revert = {
              messageID: !partID && lastUser ? lastUser.id : msg.info.id,
              partID,
            }
          }
          remaining.push(part)
        }
      }
    }

    if (revert) {
      const current = await Session.get(input.sessionID)
      revert.snapshot = current.revert?.snapshot ?? (await Snapshot.track())
      await Snapshot.revert(patches)
      if (revert.snapshot) revert.diff = await Snapshot.diff(revert.snapshot)
      const rangeMessages = all.filter((msg) => msg.info.id >= revert!.messageID)
      const diffs = await SessionSummary.computeDiff({ messages: rangeMessages })
      db()
        .insert(SessionDiffTable)
        .values({ sessionID: input.sessionID, data: diffs })
        .onConflictDoUpdate({ target: SessionDiffTable.sessionID, set: { data: diffs } })
        .run()
      Bus.publish(Session.Event.Diff, {
        sessionID: input.sessionID,
        diff: diffs,
      })
      return Session.update(input.sessionID, (draft) => {
        draft.revert = revert
        draft.summary = {
          additions: diffs.reduce((sum, x) => sum + x.additions, 0),
          deletions: diffs.reduce((sum, x) => sum + x.deletions, 0),
          files: diffs.length,
        }
      })
    }
    return session
  }

  export async function unrevert(input: { sessionID: string }) {
    log.info("unreverting", input)
    SessionPrompt.assertNotBusy(input.sessionID)
    const session = await Session.get(input.sessionID)
    if (!session.revert) return session
    if (session.revert.snapshot) await Snapshot.restore(session.revert.snapshot)
    const now = Date.now()
    db()
      .update(SessionTable)
      .set({
        revert_messageID: null,
        revert_partID: null,
        revert_snapshot: null,
        revert_diff: null,
        time_updated: now,
      })
      .where(eq(SessionTable.id, input.sessionID))
      .run()
    const updated = await Session.get(input.sessionID)
    Bus.publish(Session.Event.Updated, { info: updated })
    return updated
  }

  export async function cleanup(session: Session.Info) {
    if (!session.revert) return
    const sessionID = session.id
    let msgs = await Session.messages({ sessionID })
    const messageID = session.revert.messageID
    const [preserve, remove] = splitWhen(msgs, (x) => x.info.id === messageID)
    msgs = preserve
    for (const msg of remove) {
      db().delete(MessageTable).where(eq(MessageTable.id, msg.info.id)).run()
      await Bus.publish(MessageV2.Event.Removed, { sessionID: sessionID, messageID: msg.info.id })
    }
    const last = preserve.at(-1)
    if (session.revert.partID && last) {
      const partID = session.revert.partID
      const [preserveParts, removeParts] = splitWhen(last.parts, (x) => x.id === partID)
      last.parts = preserveParts
      for (const part of removeParts) {
        db().delete(PartTable).where(eq(PartTable.id, part.id)).run()
        await Bus.publish(MessageV2.Event.PartRemoved, {
          sessionID: sessionID,
          messageID: last.info.id,
          partID: part.id,
        })
      }
    }
    const now = Date.now()
    db()
      .update(SessionTable)
      .set({
        revert_messageID: null,
        revert_partID: null,
        revert_snapshot: null,
        revert_diff: null,
        time_updated: now,
      })
      .where(eq(SessionTable.id, sessionID))
      .run()
    const updated = await Session.get(sessionID)
    Bus.publish(Session.Event.Updated, { info: updated })
  }
}
