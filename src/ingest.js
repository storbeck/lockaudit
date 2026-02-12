async function ingest(conn, lockfile) {
  const packages = lockfile.packages || {}

  const upsertPackageStmt = await conn.prepare(`
    MERGE (p:Package {
      key: $key,
      name: $name,
      version: $version,
      resolved: $resolved,
      integrity: $integrity,
      dev: $dev,
      is_optional: $isOptional
    })
  `)

  const upsertDepStmt = await conn.prepare(`
    MERGE (a:Package {key: $fromKey})
    MERGE (b:Package {
      key: $toKey,
      name: $toName,
      version: $toVersion
    })
    MERGE (a)-[:HAS_DEP]->(b)
  `)

  for (const [pkgPath, data] of Object.entries(packages)) {
    if (!data || !data.version) continue

    const name = data.name || (pkgPath === "" ? "root" : pkgPath)
    const version = data.version
    const key = `${name}@${version}`

    await conn.execute(upsertPackageStmt, {
      key,
      name,
      version,
      resolved: data.resolved ?? null,
      integrity: data.integrity ?? null,
      dev: Boolean(data.dev),
      isOptional: Boolean(data.optional),
    })

    if (!data.dependencies) continue

    for (const [depName, depVersion] of Object.entries(data.dependencies)) {
      const depKey = `${depName}@${depVersion}`

      await conn.execute(upsertDepStmt, {
        fromKey: key,
        toKey: depKey,
        toName: depName,
        toVersion: depVersion,
      })
    }
  }
}

module.exports = { ingest }
