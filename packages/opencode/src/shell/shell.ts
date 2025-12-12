import { Flag } from "@/flag/flag"
import { lazy } from "@/util/lazy"
import { spawn as nodeSpawn } from "child_process"
import path from "path"

export namespace Shell {
  const BLACKLIST = new Set(["fish", "nu"])
  const SIGKILL_TIMEOUT_MS = 200

  function fallback() {
    if (process.platform === "win32") {
      if (Flag.OPENCODE_GIT_BASH_PATH) return Flag.OPENCODE_GIT_BASH_PATH
      const git = Bun.which("git")
      if (git) {
        // git.exe is typically at: C:\Program Files\Git\cmd\git.exe
        // bash.exe is at: C:\Program Files\Git\bin\bash.exe
        const bash = path.join(git, "..", "..", "bin", "bash.exe")
        if (Bun.file(bash).size) return bash
      }
      return process.env.COMSPEC || "cmd.exe"
    }
    if (process.platform === "darwin") return "/bin/zsh"
    const bash = Bun.which("bash")
    if (bash) return bash
    return "/bin/sh"
  }

  export const preferred = lazy(() => {
    const s = process.env.SHELL
    if (s) return s
    return fallback()
  })

  export const acceptable = lazy(() => {
    const s = process.env.SHELL
    if (s && !BLACKLIST.has(path.basename(s))) return s
    return fallback()
  })

  export interface SpawnOptions {
    command: string
    cwd: string
    shell?: string
    source?: boolean
    env?: Record<string, string>
    timeout?: number
    abort?: AbortSignal
    onData?: (chunk: Buffer) => void
  }

  export interface SpawnResult {
    output: string
    exitCode: number | null
    timedOut: boolean
    aborted: boolean
  }

  function args(shell: string, command: string, source?: boolean): string[] {
    const name = path.basename(shell).toLowerCase()

    if (name === "nu") return ["-c", command]
    if (name === "fish") return ["-c", command]

    if (name === "zsh") {
      if (!source) return ["-c", command]
      return [
        "-c",
        "-l",
        `
          [[ -f ~/.zshenv ]] && source ~/.zshenv >/dev/null 2>&1 || true
          [[ -f "\${ZDOTDIR:-$HOME}/.zshrc" ]] && source "\${ZDOTDIR:-$HOME}/.zshrc" >/dev/null 2>&1 || true
          ${command}
        `.trim(),
      ]
    }

    if (name === "bash" || name === "bash.exe") {
      if (!source) return ["-c", command]
      return [
        "-c",
        "-l",
        `
          [[ -f ~/.bashrc ]] && source ~/.bashrc >/dev/null 2>&1 || true
          ${command}
        `.trim(),
      ]
    }

    if (name === "cmd.exe") return ["/c", command]
    if (name === "powershell.exe") return ["-NoProfile", "-Command", command]

    // fallback
    if (!source) return ["-c", command]
    return ["-c", "-l", command]
  }

  export async function spawn(options: SpawnOptions): Promise<SpawnResult> {
    const shell = options.shell ?? acceptable()
    const proc = nodeSpawn(shell, args(shell, options.command, options.source), {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    })

    let output = ""
    let timedOut = false
    let aborted = false
    let exited = false

    const append = (chunk: Buffer) => {
      output += chunk.toString()
      options.onData?.(chunk)
    }

    proc.stdout?.on("data", append)
    proc.stderr?.on("data", append)

    const killTree = async () => {
      const pid = proc.pid
      if (!pid || exited) return

      if (process.platform === "win32") {
        await new Promise<void>((resolve) => {
          const killer = nodeSpawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" })
          killer.once("exit", resolve)
          killer.once("error", resolve)
        })
        return
      }

      try {
        process.kill(-pid, "SIGTERM")
        await Bun.sleep(SIGKILL_TIMEOUT_MS)
        if (!exited) {
          process.kill(-pid, "SIGKILL")
        }
      } catch {
        proc.kill("SIGTERM")
        await Bun.sleep(SIGKILL_TIMEOUT_MS)
        if (!exited) {
          proc.kill("SIGKILL")
        }
      }
    }

    if (options.abort?.aborted) {
      aborted = true
      await killTree()
    }

    const abortHandler = () => {
      aborted = true
      void killTree()
    }

    options.abort?.addEventListener("abort", abortHandler, { once: true })

    const timeoutTimer = options.timeout
      ? setTimeout(() => {
          timedOut = true
          void killTree()
        }, options.timeout)
      : undefined

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer)
        options.abort?.removeEventListener("abort", abortHandler)
      }

      proc.once("exit", () => {
        exited = true
        cleanup()
        resolve()
      })

      proc.once("error", (error) => {
        exited = true
        cleanup()
        reject(error)
      })
    })

    return {
      output,
      exitCode: proc.exitCode,
      timedOut,
      aborted,
    }
  }
}
