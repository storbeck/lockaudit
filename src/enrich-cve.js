const { queryBatchNpm, getVuln } = require('./osv')

function pickSeverity(vuln) {
  if (Array.isArray(vuln.severity) && vuln.severity.length > 0) {
    return vuln.severity[0].score || "UNKNOWN"
  }
  return "UNKNOWN"
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i+size))
  }
  return out
}

async function enrichWithCves(conn) {
  const pkgRowsResult = await conn.query(`
    MATCH (p:Package)
    WHERE p.name IS NOT NULL AND p.version IS NOT NULL
    RETURN p.key AS key, p.name AS name, p.version AS version
  `)
  const packageRows = await pkgRowsResult.getAll()

  if (packageRows.length === 0) {
    return { packages: 0, vulnerabilityIds: 0, packageHits: 0 }
  }

  const upsertVulnStmt = await conn.prepare(`
    MERGE (v:Vulnerability {id: $id})
    SET
      v.source = $source,
      v.summary = $summary,
      v.severity = $severity,
      v.published_at = $publishedAt,
      v.modified_at = $modifiedAt
  `)

  const linkAffectsStmt = await conn.prepare(`
    MATCH (v:Vulnerability {id: $vulnId})
    MATCH (p:Package {key: $pkgKey})
    MERGE (v)-[:AFFECTS]->(p)
  `)

  const vulnCache = new Map()
  const allVulnIds = new Set()
  let packageHits = 0
  const detectedAt = new Date().toISOString()
  const batches = chunk(packageRows, 200)

  for (const batch of batches) {
    const results = await queryBatchNpm(batch)

    for (let i = 0; i < batch.length; i += 1) {
      const pkg = batch[i]
      const matches = (results[i] && results[i].vulns) || []
      if (matches.length === 0) continue

      packageHits += 1

      for (const m of matches) {
        if (!m || !m.id) continue
        
        const vulnId = m.id
        allVulnIds.add(vulnId)

        if (!vulnCache.has(vulnId)) {
          const full = await getVuln(vulnId)
          vulnCache.set(vulnId, full)

          await conn.execute(upsertVulnStmt, {
            id: vulnId,
            source: "OSV",
            summary: full.summary || null,
            severity: pickSeverity(full),
            publishedAt: full.published || null,
            modifiedAt: full.modified || null
          })
        }

        await conn.execute(linkAffectsStmt, {
          vulnId,
          pkgKey: pkg.key
        })
      }
    }
  }

  return {
    packages: packageRows.length,
    vulnerabilityIds: allVulnIds.size,
    packageHits
  }
}

module.exports = { enrichWithCves }
