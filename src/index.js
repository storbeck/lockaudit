const { parseLockFile } = require("./lockfile")
const { openDatabase } = require("./db")
const { ingest } = require("./ingest")

async function run(filePath) {
  console.log("Reading lockfile...")
  const lockfile = parseLockFile(filePath)

  console.log("Opening database...")
  const conn = await openDatabase()

  console.log("Ingesting...")
  await ingest(conn, lockfile, filePath)

  console.log("Done.")

  const countsResult = await conn.query(`
    MATCH (proj:Project) RETURN count(proj) AS projects
  `)
  const packagesResult = await conn.query(`
    MATCH (p:Package) RETURN count(p) AS package_versions
  `)
  const lockPackagesResult = await conn.query(`
    MATCH (lp:LockPackage) RETURN count(lp) AS lock_packages
  `)
  const depsResult = await conn.query(`
    MATCH (d:DependencyDecl) RETURN count(d) AS dependency_decls
  `)

  const projects = (await countsResult.getAll())[0].projects
  const packageVersions = (await packagesResult.getAll())[0].package_versions
  const lockPackages = (await lockPackagesResult.getAll())[0].lock_packages
  const dependencyDecls = (await depsResult.getAll())[0].dependency_decls

  console.log("Projects:", projects)
  console.log("Package versions:", packageVersions)
  console.log("Lockfile package instances:", lockPackages)
  console.log("Dependency declarations:", dependencyDecls)
}

module.exports = { run }
