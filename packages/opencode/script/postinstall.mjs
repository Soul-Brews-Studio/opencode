#!/usr/bin/env node

import fs from "fs"
import path from "path"
import os from "os"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function detectPlatformAndArch() {
  // Map platform names
  let platform
  switch (os.platform()) {
    case "darwin":
      platform = "darwin"
      break
    case "linux":
      platform = "linux"
      break
    case "win32":
      platform = "windows"
      break
    default:
      platform = os.platform()
      break
  }

  // Map architecture names
  let arch
  switch (os.arch()) {
    case "x64":
      arch = "x64"
      break
    case "arm64":
      arch = "arm64"
      break
    case "arm":
      arch = "arm"
      break
    default:
      arch = os.arch()
      break
  }

  return { platform, arch }
}

function findBinary() {
  const { platform, arch } = detectPlatformAndArch()
  const packageName = `opencode-${platform}-${arch}`
  const binaryName = platform === "windows" ? "opencode.exe" : "opencode"

  try {
    // Use require.resolve to find the package
    const packageJsonPath = require.resolve(`${packageName}/package.json`)
    const packageDir = path.dirname(packageJsonPath)
    const binaryPath = path.join(packageDir, "bin", binaryName)

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Binary not found at ${binaryPath}`)
    }

    return { binaryPath, binaryName }
  } catch (error) {
    throw new Error(`Could not find package ${packageName}: ${error.message}`)
  }
}

const cacheName = "opencode-bin"

function ensureBinDir() {
  const binDir = path.join(__dirname, "bin")
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true })
  }
  return binDir
}

function cacheBinary(sourcePath) {
  const binDir = ensureBinDir()
  const linkPath = path.join(binDir, cacheName)
  if (fs.existsSync(linkPath)) {
    fs.rmSync(linkPath)
  }
  fs.symlinkSync(sourcePath, linkPath)
  console.log(`opencode binary cached: ${linkPath} -> ${sourcePath}`)
  if (!fs.existsSync(linkPath)) {
    throw new Error(`Failed to cache binary at ${linkPath}`)
  }
}

async function main() {
  try {
    if (os.platform() === "win32") {
      console.log("Windows detected: binary setup not needed (using packaged .exe)")
      return
    }

    const { binaryPath } = findBinary()
    cacheBinary(binaryPath)
  } catch (error) {
    console.error("Failed to setup opencode binary:", error.message)
    process.exit(1)
  }
}

try {
  main()
} catch (error) {
  console.error("Postinstall script error:", error.message)
  process.exit(0)
}
