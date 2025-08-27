import { $ } from "bun"
import * as core from "@actions/core"
import { Auth } from "../src/auth"
import { Git } from "../src/git"
import { Opencode } from "../src/opencode"
import { Context } from "../src/context"

try {
  Context.assertEventName("pull_request_opened", "pull_request_synchronize", "pull_request_reopened")
  await check()
  process.exit(0)
} catch (e: any) {
  console.error(e)
  let msg = e
  if (e instanceof $.ShellError) msg = e.stderr.toString()
  else if (e instanceof Error) msg = e.message
  core.setFailed(msg)
  // Also output the clean error message for the action to capture
  //core.setOutput("prepare_error", e.message);
  process.exit(1)
}

export async function check() {
  try {
    await Git.configure()
    await Opencode.start()

    const filename = "check-failed-reason.json"
    const pr = Context.payloadPullRequest()
    await Opencode.chat(`
A pull request has been created or updated: '${pr.title}'

<pr-number>
${pr.number}
</pr-number>

<pr-description>
${pr.body}
</pr-description>

Please check:
<check>
${process.env.PROMPT}
</check>

If the check failed, write the reason to ${filename} in this format:
\`\`\`
{
  "reason": "string"
}
\`\`\`

Keep the reason short and concise, only one sentence.

If the check passed, do not create any file.
      `)

    // check file exists
    try {
      const reason = await Bun.file(filename).text()
      if (reason) throw new Error(reason)
    } catch (e) {}
  } finally {
    Opencode.closeServer()
    await Auth.revoke()
    await Git.restore()
  }
}
