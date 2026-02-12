const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFile } = require("child_process")
const { promisify } = require("util")

const execFileAsync = promisify(execFile)

function parsePurl(purl) {
  if (typeof purl !== "string") return {}
  // pkg:npm/name@version and pkg:npm/%40scope%2Fname@version are common.
  const noPrefix = purl.startsWith("pkg:") ? purl.slice(4) : purl
  const [schemeAndNamePart] = noPrefix.split("?")
  const [schemeAndName, versionPart] = schemeAndNamePart.split("@")
  const slashIndex = schemeAndName.indexOf("/")
  if (slashIndex === -1) return { version: versionPart || null }

  const type = schemeAndName.slice(0, slashIndex)
  const rawName = schemeAndName.slice(slashIndex + 1)
  const decodedName = decodeURIComponent(rawName)

  return {
    type,
    name: decodedName || null,
    version: versionPart || null,
  }
}

function parseSbom(filePath) {
  const raw = fs.readFileSync(filePath, "utf8")
  const json = JSON.parse(raw)

  if (!json || json.bomFormat !== "CycloneDX") {
    throw new Error("Unsupported SBOM format")
  }

  if (!Array.isArray(json.components)) {
    throw new Error("Invalid SBOM: missing components array")
  }

  if (!Array.isArray(json.dependencies)) {
    throw new Error("Invalid SBOM: missing dependencies array")
  }

  return json
}

async function generateSbomFromProject(projectDir) {
  const absoluteProjectDir = path.resolve(projectDir)
  const lockfilePath = path.join(absoluteProjectDir, "package-lock.json")
  if (!fs.existsSync(lockfilePath)) {
    throw new Error(
      `Expected package-lock.json in project root: ${absoluteProjectDir}`,
    )
  }

  const outFile = path.join(os.tmpdir(), `lockaudit-sbom-${Date.now()}.json`)
  const args = [
    "@cyclonedx/cyclonedx-npm",
    "--output-file",
    outFile,
    "--output-format",
    "JSON",
  ]

  try {
    await execFileAsync("npx", args, { cwd: absoluteProjectDir })
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr) : ""
    const stdout = error && error.stdout ? String(error.stdout) : ""
    const detail = (stderr || stdout || "").trim()
    throw new Error(
      `Failed to generate SBOM. ${detail}`,
    )
  }

  return outFile
}

async function loadSbomFromProject(projectDir) {
  const sbomPath = await generateSbomFromProject(projectDir)
  return parseSbom(sbomPath)
}

module.exports = { parseSbom, parsePurl, generateSbomFromProject, loadSbomFromProject }
