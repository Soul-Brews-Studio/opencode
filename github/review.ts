import { $ } from "bun"
import os from "node:os"
import * as core from "@actions/core"
import type { PullRequestReviewCommentEditedEvent } from "@octokit/webhooks-types"
import { Context } from "./src/context"
import { Auth } from "./src/auth"
import { Git } from "./src/git"
import { GitHub } from "./src/github"
import { Opencode } from "./src/opencode"

type Finding = {
  file: string
  line: number
  description: string
  related?: string[]
}

try {
  switch (Context.eventName()) {
    case "pull_request_opened":
    case "pull_request_synchronize":
      await review()
      break
    // TODO
    //    case "pull_request_review_comment_edited":
    //      await commitSuggestion()
    //      break
    default:
      throw new Error(`Unsupported event type: ${Context.eventName()}`)
  }
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

export async function review() {
  try {
    await Opencode.start()
    await Git.checkoutPrBranch()

    // List violations
    const findings = await listFindings()
    await Git.resetBranch()
    console.log("findings", findings)

    // Fix each violation
    const comments = []
    for (const finding of findings) {
      const fix = await fixFinding(finding)
      await Git.resetBranch()
      comments.push(fix.comment)
    }

    await createReview(comments)
  } finally {
    Opencode.closeServer()
    await Auth.revoke()
  }

  async function buildHunkValidator() {
    const rest = await GitHub.rest()
    const prRest = await rest.pulls.listFiles({
      owner: Context.repo().owner,
      repo: Context.repo().repo,
      pull_number: Context.payloadPullRequest().number,
      per_page: 100,
    })
    const prFiles = prRest.data.map((d) => ({
      filename: d.filename,
      hunks: (d.patch?.split("\n") ?? [])
        .filter((l) => l.startsWith("@@"))
        .map((l) => {
          // @@ -4,6 +4,7 @@ import { DynamoDBClient } from \"@aws-sdk/client-dynamodb\";
          const parts = l.split(" ")
          const newInfo = parts[2]!.slice(1).split(",")
          const start = Number(newInfo[0])
          const lines = Number(newInfo[1] ?? "1")
          const end = start + lines - 1
          return { start, end }
        }),
    }))
    return (file: string, start: number, end: number) => {
      const hunks = prFiles.find((f) => f.filename === file)?.hunks
      if (!hunks) return false
      const startHunk = hunks?.find((h) => start >= h.start && start <= h.end)
      if (!startHunk) return false
      const endHunk = hunks?.find((h) => end >= h.start && end <= h.end)
      if (!endHunk) return false
      return startHunk.start === endHunk.start
    }
  }

  async function listFindings(): Promise<Finding[]> {
    console.log("Finding violations...")

    const filename = "pr-violations.json"
    const prompt = `A new pull request has been created:

<pr-number>
${Context.payloadPullRequest().number}
</pr-number>

<pr-title>
${Context.payloadPullRequest().title}
</pr-title>

<pr-description>
${Context.payloadPullRequest().body}
</pr-description>

Review all code changes in this pull request and identify issues. Read the entire file to get context, but only report issues tied to changed lines.

Produce a list of issues with the following fields:
  - file: Path to the file with the issue. Must be a file included in the pull request's changed patch (e.g. "path/to/file.ts")
  - line: Line number of the issue. Must be a line included in the pull request's changed patch (e.g. 7)
  - description: A one-sentence description of the issue (e.g. "Unused variable")

Write the list of issues to ${filename} in this format:
  \`\`\`
  [
    {
      "file": "string",
      "line": number,
      "description": "string"
    },
    {
      "file": "string",
      "line": number,
      "description": "string"
    },
    {
      "file": "string",
      "line": number,
      "description": "string"
    }
  ]
  \`\`\`

Do not suggest fixes, only flag issues.`

    await Opencode.chat(prompt)

    try {
      const unique: Finding[] = []
      const findings = (await Bun.file(filename).json()) as Finding[]
      for (const f of findings) {
        const existing = unique.find((u) => u.file === f.file && u.line === f.line)
        if (existing) {
          existing.related = [...(existing.related ?? []), f.description]
          continue
        }
        unique.push(f)
      }
      return unique
    } catch (e) {}

    return []
  }

  async function fixFinding(finding: Finding) {
    console.log("Fixing finding:", finding)

    // Fix
    const prompt = `Fix the issue:

<file>
${finding.file}
</file>

<issue>
${finding.description}
${finding.related?.map((r) => `- ${r}`).join("\n")}
</issue>
`

    const response = await Opencode.chat(prompt)
    console.log("fix", response)

    // get git diff
    /**
     * Example diff:
     *
     * ```
     * diff --git a/packages/functions/src/foo.ts b/packages/functions/src/foo.ts
     * index ef8a79d..205f2a8 100644
     * --- a/packages/functions/src/foo.ts
     * +++ b/packages/functions/src/foo.ts
     * @@ -4,7 +4,8 @@ import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
     *  import { DeleteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
     *
     *  const dynamoDb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
     * -const dynamoDb4 = DynamoDBDocumentClient.from(new DynamoDBClient({}));
     * +
     * +// Suggestion: Remove unused variable dynamoDb4
     *
     *  export const main = Util.handler(async (event) => {
     *    const params = {
     * @@ -20,16 +21,4 @@ export const main = Util.handler(async (event) => {
     * ...
     * ```
     */
    const diff0 = await $`git diff --unified=0 --patch`.text()
    const diff0Lines = diff0.trim().split("\n")
    const blockNum = diff0Lines.filter((l) => l.startsWith("@@ ")).length

    // Case: no blocks => create comment
    if (blockNum === 0) {
      return {
        type: "notice",
        finding,
        comment: {
          path: finding.file,
          line: finding.line,
          side: "RIGHT",
          body: [`### ${finding.description}`, "", response].join("\n"),
        },
      }
    }

    // Case: 1 block => create suggestion
    if (blockNum === 1) {
      let file
      let start
      let lines
      let newLines = []
      for (const line of diff0Lines) {
        if (line.startsWith("diff --git")) {
          file = line.split(" ")[2]?.slice(2)!
          continue
        }
        if (line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("index ")) continue
        if (line.startsWith("@@ ")) {
          const parts = line.split(" ")
          const oldInfo = parts[1]!.slice(1).split(",")
          start = Number(oldInfo[0])
          lines = Number(oldInfo[1] ?? "1")
          continue
        }
        if (!line.startsWith("-")) newLines.push(line.slice(1))
      }

      const hunkValidator = await buildHunkValidator()
      if (hunkValidator(file!, start!, start! + lines! - 1)) {
        return {
          type: "suggestion",
          finding,
          comment: {
            path: file!,
            start_line: lines === 1 ? undefined : start!,
            line: start! + lines! - 1,
            side: "RIGHT",
            start_side: "RIGHT",
            body: [`### ${finding.description}`, "", response, "", "```suggestion", ...newLines, "```"].join("\n"),
          },
        }
      }
    }

    // Case: multiple blocks => create PR
    const diffFull = await $`git diff --patch`.text()
    let files = []
    let additions = 0
    let deletions = 0
    let diffLines = []
    for (const line of diffFull.trim().split("\n")) {
      // count additions, deletions, and files
      if (line.startsWith("diff --git")) files.push(line.split(" ")[2]?.slice(2)!)
      else if (line.startsWith("+") && !line.startsWith("+++")) additions++
      else if (line.startsWith("-") && !line.startsWith("---")) deletions++

      // add to lines
      if (line.startsWith("diff --git")) {
        diffLines.push(`diff -- ${line.split(" ")[2]?.slice(2)!}`)
      } else if (!line.startsWith("+++") && !line.startsWith("---") && !line.startsWith("index")) {
        diffLines.push(line)
      }
    }
    return {
      type: "diff",
      finding,
      comment: {
        path: finding.file,
        line: finding.line,
        side: "RIGHT",
        body: `### ${finding.description}

${response}

<details>
  <summary>View suggestion: <code>${additions === 1 ? "1 addition" : `${additions} additions`}</code> and <code>${deletions === 1 ? "1 deletion" : `${deletions} deletions`}</code> in <code>${files.length === 1 ? files[0] : `${files.length} files`}</code></summary>

${GitHub.commentSectionBuild("diff", ["```diff", ...diffLines, "```"])}

</details>

---

<sub>**Tip:** Reply "/oc fix" to apply the suggested fix.</sub>
`,
      },
    }
  }

  async function createReview(comments: Awaited<ReturnType<typeof fixFinding>>["comment"][]) {
    console.log("Creating review...")

    const rest = await GitHub.rest()
    await rest.pulls.createReview({
      owner: Context.repo().owner,
      repo: Context.repo().repo,
      pull_number: Context.payloadPullRequest().number,
      event: "COMMENT",
      ...(comments.length
        ? {
            comments,
          }
        : {
            body: "Review completed - no issues found ✅",
          }),
    })
  }
}

export async function commitSuggestion() {
  try {
    await Git.configure()

    await updateReview("- [x] ⏳ Committing suggestion…")
    const thread = await fetchReviewThread()
    if (thread.isResolved) throw new Error("Review thread is already resolved")

    const comment = Context.payload<PullRequestReviewCommentEditedEvent>().comment
    const commitSection = GitHub.commentSectionParse(comment.body, "commit")
    const diffSection = GitHub.commentSectionParse(comment.body, "diff")
    const findingData = GitHub.commentDataParse<Finding>(comment.body, "finding")

    if (!commitSection.some((l) => l.includes("- [x]"))) throw new Error("Commit button is not checked")

    const startIndex = diffSection.findIndex((l) => l.startsWith("```diff"))
    const endIndex = diffSection.findLastIndex((l) => l.startsWith("```"))
    if (startIndex === -1 || endIndex === -1) throw new Error("Cannot find diff in review comment")
    const diff = diffSection.slice(startIndex, endIndex)

    // Fix issue
    await Git.checkoutPrBranch()
    const diffFile = `${os.tmpdir()}/patch.diff`
    console.log("diff", diffFile)
    await Bun.write(diffFile, diff.join("\n"))
    await $`git apply ${diffFile}`
    await Git.pushBranch(findingData.description.length ? findingData.description : "Fix issue")

    // Done
    await resolveReviewThread(thread.id)
    await updateReview("- [x] ✅ Suggestion committed successfully")
    console.log("diff", diff)
  } catch (e: any) {
    let msg
    if (e instanceof $.ShellError)
      msg = e.stderr.toString().includes("patch does not apply") ? "the suggestion is outdated" : e.stderr.toString()
    else if (e instanceof Error) msg = e.message
    else msg = e.toString()
    await updateReview(`- [x] ⚠️ Commit failed: ${msg} [view log](${GitHub.runUrl()})`)
    throw e
  } finally {
    await Auth.revoke()
    await Git.restore()
  }

  async function fetchReviewThread() {
    console.log("Fetching review thread...")
    const graph = await GitHub.graph()
    const result = await graph<{
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: {
              id: string
              isResolved: boolean
              comments: {
                nodes: {
                  id: string
                }[]
              }
            }[]
          }
        }
      }
    }>(
      `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(last: 100) {
        nodes {
          id
          isResolved
          comments(last: 100) {
            nodes {
              id
            }
          }
        }
      }
    }
  }
}`,
      {
        owner: Context.repo().owner,
        repo: Context.repo().repo,
        number: Context.payloadPullRequest().number,
      },
    )

    const comment = Context.payload<PullRequestReviewCommentEditedEvent>().comment
    const thread = result.repository.pullRequest.reviewThreads.nodes.find((t) =>
      t.comments.nodes.some((c) => c.id === comment.node_id),
    )
    if (!thread) throw new Error(`PR #${Context.payloadPullRequest().number} not found`)

    return {
      id: thread.id,
      isResolved: thread.isResolved,
    }
  }

  async function updateReview(commitSection: string) {
    console.log("Creating review...")

    const comment = Context.payload<PullRequestReviewCommentEditedEvent>().comment
    const body = GitHub.commentSectionUpdate(comment.body, "commit", [commitSection])

    const rest = await GitHub.rest()
    await rest.pulls.updateReviewComment({
      owner: Context.repo().owner,
      repo: Context.repo().repo,
      comment_id: comment.id,
      body,
    })
  }

  async function resolveReviewThread(threadId: string) {
    console.log("Resolving review thread...")
    const graph = await GitHub.graph()
    await graph(
      `
mutation($id: ID!) {
  resolveReviewThread(input:{threadId:$id}) {
    thread {
      id
      isResolved
    }
  }
}`,
      {
        id: threadId,
      },
    )
  }
}
