type GitHubAuthor = {
  login: string
  name?: string
}

type GitHubComment = {
  id: string
  databaseId: string
  body: string
  author: GitHubAuthor
  createdAt: string
}

type GitHubReviewComment = GitHubComment & {
  path: string
  line: number | null
  threadId: string
}

type GitHubCommit = {
  oid: string
  message: string
  author: {
    name: string
    email: string
  }
}

type GitHubFile = {
  path: string
  additions: number
  deletions: number
  changeType: string
}

type GitHubReview = {
  id: string
  databaseId: string
  author: GitHubAuthor
  body: string
  state: string
  submittedAt: string
  comments: {
    nodes: GitHubReviewComment[]
  }
}

export type GitHubPullRequest = {
  title: string
  body: string
  author: GitHubAuthor
  baseRefName: string
  headRefName: string
  headRefOid: string
  createdAt: string
  additions: number
  deletions: number
  state: string
  baseRepository: {
    nameWithOwner: string
  }
  headRepository: {
    nameWithOwner: string
  }
  commits: {
    totalCount: number
    nodes: Array<{
      commit: GitHubCommit
    }>
  }
  files: {
    nodes: GitHubFile[]
  }
  comments: {
    nodes: GitHubComment[]
  }
  reviews: {
    nodes: GitHubReview[]
  }
  reviewThreads: {
    nodes: {
      id: string
      isResolved?: boolean
      comments: {
        nodes: GitHubReviewComment[]
      }
    }[]
  }
}

export type GitHubIssue = {
  title: string
  body: string
  author: GitHubAuthor
  createdAt: string
  state: string
  comments: {
    nodes: GitHubComment[]
  }
}

export type PullRequestQueryResponse = {
  repository: {
    pullRequest: GitHubPullRequest
  }
}

export type IssueQueryResponse = {
  repository: {
    issue: GitHubIssue
  }
}
