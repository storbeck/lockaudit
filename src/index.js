const { parseLockFile } = require("./lockfile")
const { openDatabase } = require("./db")
const { ingest } = require("./ingest")
const { enrichWithCves } = require('./enrich-cve')

async function run(filePath) {
  console.log("Reading lockfile...")
  const lockfile = parseLockFile(filePath)

  console.log("Opening database...")
  const conn = await openDatabase()

  console.log("Ingesting...")
  await ingest(conn, lockfile, filePath)

  console.log("Enriching with OSV...")
  await enrichWithCves(conn)

  console.log("Done.")

  const result = await conn.query(`
    MATCH (p:Package)
    RETURN count(p) as total
  `)

  const rows = await result.getAll()
  console.log("Total packages:", rows[0].total)
}

module.exports = { run }
