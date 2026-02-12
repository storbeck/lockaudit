#!/usr/bin/env node

const path = require("path")
const fs = require("fs")
const { run } = require("../src/index")
const { ask } = require("../src/agent")

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.error("Usage:")
    console.error("  lockaudit ingest <project-root>")
    console.error('  lockaudit ask "<question>" [--db <path-to-lockaudit.ldbg>] [--model <name>] [--openai-base-url <url>]')
    console.error("")
    console.error("Shortcut:")
    console.error("  lockaudit <project-root>   # same as ingest")
    process.exit(cmd ? 0 : 1)
  }

  if (cmd === "ask") {
    const questionParts = []
    let dbPath = "lockaudit.ldbg"
    let model
    let openaiBaseUrl

    for (let i = 1; i < args.length; i += 1) {
      const token = args[i]
      if (token === "--db" && args[i + 1]) {
        dbPath = args[i + 1]
        i += 1
        continue
      }
      if (token === "--model" && args[i + 1]) {
        model = args[i + 1]
        i += 1
        continue
      }
      if ((token === "--openai-base-url" || token === "--openai-url") && args[i + 1]) {
        openaiBaseUrl = args[i + 1]
        i += 1
        continue
      }
      questionParts.push(token)
    }

    const question = questionParts.join(" ").trim()
    if (!question) {
      console.error('Usage: lockaudit ask "<question>" [--db <path>] [--model <name>] [--openai-base-url <url>]')
      process.exit(1)
    }

    const answer = await ask(question, { dbPath, model, openaiBaseUrl })
    console.log(answer)
    return
  }

  const projectRootInput = cmd === "ingest" ? args[1] : cmd
  if (!projectRootInput) {
    console.error("Usage: lockaudit ingest <project-root>")
    process.exit(1)
  }

  const fullPath = path.resolve(projectRootInput)
  if (!fs.existsSync(fullPath)) {
    console.error("Path not found:", fullPath)
    process.exit(1)
  }
  if (!fs.statSync(fullPath).isDirectory()) {
    console.error("Expected a project root directory:", fullPath)
    process.exit(1)
  }
  await run(fullPath)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
