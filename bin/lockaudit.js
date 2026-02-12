#!/usr/bin/env node

const path = require("path")
const fs = require("fs")
const { run } = require("../src/index")

async function main() {
  const projectRootInput = process.argv[2]

  if (!projectRootInput) {
    console.error("Usage: lockaudit <project-root>")
    process.exit(1)
  }

  const fullPath = path.resolve(projectRootInput)

  if (!fs.existsSync(fullPath)) {
    console.error("Path not found:", fullPath)
    process.exit(1)
  }

  const stat = fs.statSync(fullPath)
  if (!stat.isDirectory()) {
    console.error("Expected a project root directory:", fullPath)
    process.exit(1)
  }

  await run(fullPath)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
