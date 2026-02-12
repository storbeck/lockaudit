const fs = require("fs")

function parseLockFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8")
  const json = JSON.parse(raw)

  if (!json.packages) {
    throw new Error("Unsupported lockfile version (expecting npm v7+)")
  }

  return json
}

module.exports = { parseLockFile }
