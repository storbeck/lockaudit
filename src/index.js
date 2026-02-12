const { loadSbomFromProject } = require("./sbom")
const { openDatabase } = require("./db")
const { ingest } = require("./ingest")
const { enrichWithCves } = require('./enrich-cve')

async function run(projectRoot) {
  console.log("Generating SBOM...")
  const sbom = await loadSbomFromProject(projectRoot)

  console.log("Opening database...")
  const conn = await openDatabase()

  console.log("Ingesting...")
  await ingest(conn, sbom)

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
