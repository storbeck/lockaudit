#!/usr/bin/env node

const path = require("path")
const fs = require("fs")
const { run } = require("../src/index")

async function main() {
  const input = process.argv[2]

  if (!input) {
    console.error("Usage: lockaudit <path-to-package-lock.json>")
    process.exit(1)
  }

  const fullPath = path.resolve(input)

  if (!fs.existsSync(fullPath)) {
    console.error("File not found:", fullPath)
    process.exit(1)
  }

  await run(fullPath)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
