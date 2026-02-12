function cypherValue(value) {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  const text = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
  return `"${text}"`
}

function inferNameFromPath(pkgPath) {
  if (!pkgPath) return null
  const parts = pkgPath.split("/node_modules/")
  return parts[parts.length - 1] || null
}

function pathKey(projectId, pkgPath) {
  return `${projectId}::${pkgPath === "" ? "." : pkgPath}`
}

function findResolvedDepPath(ownerPath, depName, packages) {
  const direct = ownerPath === "" ? `node_modules/${depName}` : `${ownerPath}/node_modules/${depName}`
  if (Object.prototype.hasOwnProperty.call(packages, direct)) return direct

  if (ownerPath === "") return Object.prototype.hasOwnProperty.call(packages, direct) ? direct : null

  const segments = ownerPath.split("/node_modules/")
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const base = segments.slice(0, i).join("/node_modules/")
    const candidate = base ? `${base}/node_modules/${depName}` : `node_modules/${depName}`
    if (Object.prototype.hasOwnProperty.call(packages, candidate)) return candidate
  }

  return null
}

function isLikelyExactVersion(spec) {
  if (typeof spec !== "string") return false
  if (spec.trim() === "") return false
  return !/[~^*<>=| ]/.test(spec)
}

async function ingest(conn, lockfile, projectPath) {
  const packages = lockfile.packages || {}
  const projectId = projectPath
  const rootPkg = packages[""] || {}
  const rootName = rootPkg.name || lockfile.name || "root"
  const rootVersion = rootPkg.version || lockfile.version || null
  const lockfileVersion = Number.isInteger(lockfile.lockfileVersion) ? lockfile.lockfileVersion : null
  const packageManager = typeof lockfile.packageManager === "string" ? lockfile.packageManager : null

  await conn.query(`
    MERGE (proj:Project {id: ${cypherValue(projectId)}})
    SET
      proj.lockfile_path = ${cypherValue(projectPath)},
      proj.lockfile_version = ${cypherValue(lockfileVersion)},
      proj.project_name = ${cypherValue(rootName)},
      proj.project_version = ${cypherValue(rootVersion)},
      proj.package_manager = ${cypherValue(packageManager)}
  `)

  // Pass 1: materialize all lockfile package instances and canonical package versions.
  for (const [pkgPath, data] of Object.entries(packages)) {
    if (!data) continue

    const name = data.name || inferNameFromPath(pkgPath) || (pkgPath === "" ? "root" : pkgPath)
    const version = data.version || null
    const key = `${name}@${version}`
    const sourcePathKey = pathKey(projectId, pkgPath)

    await conn.query(`
      MERGE (lp:LockPackage {path_key: ${cypherValue(sourcePathKey)}})
      SET
        lp.project_id = ${cypherValue(projectId)},
        lp.pkg_path = ${cypherValue(pkgPath)},
        lp.package_name = ${cypherValue(name)},
        lp.package_version = ${cypherValue(version)},
        lp.resolved = ${cypherValue(data.resolved)},
        lp.integrity = ${cypherValue(data.integrity)},
        lp.license = ${cypherValue(data.license)},
        lp.is_link = ${cypherValue(Boolean(data.link))},
        lp.is_in_bundle = ${cypherValue(Boolean(data.inBundle))},
        lp.has_install_script = ${cypherValue(Boolean(data.hasInstallScript))},
        lp.is_dev = ${cypherValue(Boolean(data.dev))},
        lp.is_optional = ${cypherValue(Boolean(data.optional))},
        lp.is_root = ${cypherValue(pkgPath === "")}
    `)

    await conn.query(`
      MATCH (proj:Project {id: ${cypherValue(projectId)}})
      MATCH (lp:LockPackage {path_key: ${cypherValue(sourcePathKey)}})
      MERGE (proj)-[:HAS_PACKAGE]->(lp)
    `)

    if (!version) continue

    await conn.query(`
      MERGE (p:Package {key: ${cypherValue(key)}})
      SET
        p.name = ${cypherValue(name)},
        p.version = ${cypherValue(version)}
    `)

    await conn.query(`
      MATCH (lp:LockPackage {path_key: ${cypherValue(sourcePathKey)}})
      MATCH (p:Package {key: ${cypherValue(key)}})
      MERGE (lp)-[:INSTANCE_OF]->(p)
    `)
  }

  // Pass 2: capture dependency declarations and best-effort resolution.
  const depGroups = [
    ["dependencies", "prod"],
    ["devDependencies", "dev"],
    ["optionalDependencies", "optional"],
    ["peerDependencies", "peer"],
  ]

  for (const [pkgPath, data] of Object.entries(packages)) {
    if (!data) continue
    const sourcePathKey = pathKey(projectId, pkgPath)
    const sourceName = data.name || inferNameFromPath(pkgPath) || (pkgPath === "" ? "root" : pkgPath)
    const sourceVersion = data.version || null

    for (const [fieldName, depKind] of depGroups) {
      const depMap = data[fieldName]
      if (!depMap || typeof depMap !== "object") continue

      for (const [depName, depSpec] of Object.entries(depMap)) {
        const depSpecText = depSpec == null ? null : String(depSpec)
        const declKey = `${sourcePathKey}::${depKind}::${depName}`

        await conn.query(`
          MERGE (d:DependencyDecl {decl_key: ${cypherValue(declKey)}})
          SET
            d.owner_path_key = ${cypherValue(sourcePathKey)},
            d.dep_name = ${cypherValue(depName)},
            d.dep_spec = ${cypherValue(depSpecText)},
            d.dep_kind = ${cypherValue(depKind)}
        `)

        await conn.query(`
          MATCH (lp:LockPackage {path_key: ${cypherValue(sourcePathKey)}})
          MATCH (d:DependencyDecl {decl_key: ${cypherValue(declKey)}})
          MERGE (lp)-[:DECLARES_DEP]->(d)
        `)

        const resolvedPath = findResolvedDepPath(pkgPath, depName, packages)
        if (resolvedPath) {
          const targetPathKey = pathKey(projectId, resolvedPath)
          await conn.query(`
            MATCH (src:LockPackage {path_key: ${cypherValue(sourcePathKey)}})
            MATCH (dst:LockPackage {path_key: ${cypherValue(targetPathKey)}})
            MERGE (src)-[:DEPENDS_ON {
              dep_kind: ${cypherValue(depKind)},
              dep_spec: ${cypherValue(depSpecText)}
            }]->(dst)
          `)
        }

        if (resolvedPath && packages[resolvedPath] && packages[resolvedPath].version) {
          const targetName = packages[resolvedPath].name || inferNameFromPath(resolvedPath) || depName
          const targetVersion = packages[resolvedPath].version
          const targetPkgKey = `${targetName}@${targetVersion}`

          await conn.query(`
            MATCH (d:DependencyDecl {decl_key: ${cypherValue(declKey)}})
            MATCH (p:Package {key: ${cypherValue(targetPkgKey)}})
            MERGE (d)-[:RESOLVES_TO]->(p)
          `)

          if (sourceVersion) {
            const sourcePkgKey = `${sourceName}@${sourceVersion}`
            await conn.query(`
              MATCH (a:Package {key: ${cypherValue(sourcePkgKey)}})
              MATCH (b:Package {key: ${cypherValue(targetPkgKey)}})
              MERGE (a)-[:HAS_DEP {dep_type: ${cypherValue(depKind)}}]->(b)
            `)
          }
        } else if (isLikelyExactVersion(depSpecText)) {
          const targetPkgKey = `${depName}@${depSpecText}`
          await conn.query(`
            MERGE (p:Package {key: ${cypherValue(targetPkgKey)}})
            SET
              p.name = ${cypherValue(depName)},
              p.version = ${cypherValue(depSpecText)}
          `)
          await conn.query(`
            MATCH (d:DependencyDecl {decl_key: ${cypherValue(declKey)}})
            MATCH (p:Package {key: ${cypherValue(targetPkgKey)}})
            MERGE (d)-[:RESOLVES_TO]->(p)
          `)
        }
      }
    }
  }
}

module.exports = { ingest }
