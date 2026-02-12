const { parsePurl } = require("./sbom")

function normalizeComponent(component) {
  const purlInfo = parsePurl(component.purl)
  const name = component.name || purlInfo.name || component["bom-ref"] || null
  const version = component.version || purlInfo.version || null
  const key = component["bom-ref"] || `${name || "unknown"}@${version || "unknown"}`

  return {
    key,
    name,
    version,
    purl: component.purl || null,
  }
}

async function ingest(conn, sbom) {
  const components = Array.isArray(sbom.components) ? sbom.components : []
  const dependencies = Array.isArray(sbom.dependencies) ? sbom.dependencies : []

  const upsertPackageStmt = await conn.prepare(`
    MERGE (p:Package { key: $key })
    SET
      p.name = $name,
      p.version = $version,
      p.resolved = $resolved,
      p.integrity = $integrity,
      p.dev = $dev,
      p.is_optional = $isOptional
  `)

  const upsertDepStmt = await conn.prepare(`
    MATCH (a:Package {key: $fromKey})
    MATCH (b:Package {key: $toKey})
    MERGE (a)-[:HAS_DEP {dep_type: $depType}]->(b)
  `)

  // create component nodes keyed by SBOM bom-ref.
  for (const component of components) {
    const normalized = normalizeComponent(component)
    await conn.execute(upsertPackageStmt, {
      key: normalized.key,
      name: normalized.name,
      version: normalized.version,
      resolved: normalized.purl,
      integrity: null,
      dev: false,
      isOptional: false,
    })
  }

  // connect dependency edges from SBOM dependency graph.
  for (const dep of dependencies) {
    const fromKey = dep.ref
    if (!fromKey || !Array.isArray(dep.dependsOn)) continue

    for (const toKey of dep.dependsOn) {
      if (!toKey) continue
      await conn.execute(upsertDepStmt, {
        fromKey,
        toKey,
        depType: "prod",
      })
    }
  }
}

module.exports = { ingest }
