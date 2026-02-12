const lbug = require("lbug")

async function openDatabase(file = "lockaudit.ldbg") {
  const db = new lbug.Database(file)
  const conn = new lbug.Connection(db)

  await ensureSchema(conn)

  return conn
}

async function ensureSchema(conn) {
  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS Package(
      key STRING PRIMARY KEY,
      name STRING,
      version STRING
    )
  `)

  await conn.query(`
    CREATE REL TABLE IF NOT EXISTS HAS_DEP(
      FROM Package TO Package,
      dep_type STRING
    )
  `)

  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS Project(
      id STRING PRIMARY KEY,
      lockfile_path STRING,
      lockfile_version INT64,
      project_name STRING,
      project_version STRING,
      package_manager STRING
    )
  `)

  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS LockPackage(
      path_key STRING PRIMARY KEY,
      project_id STRING,
      pkg_path STRING,
      package_name STRING,
      package_version STRING,
      resolved STRING,
      integrity STRING,
      license STRING,
      is_link BOOL,
      is_in_bundle BOOL,
      has_install_script BOOL,
      is_dev BOOL,
      is_optional BOOL,
      is_root BOOL
    )
  `)

  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS DependencyDecl(
      decl_key STRING PRIMARY KEY,
      owner_path_key STRING,
      dep_name STRING,
      dep_spec STRING,
      dep_kind STRING
    )
  `)

  await conn.query(`
    CREATE REL TABLE IF NOT EXISTS HAS_PACKAGE(
      FROM Project TO LockPackage
    )
  `)

  await conn.query(`
    CREATE REL TABLE IF NOT EXISTS INSTANCE_OF(
      FROM LockPackage TO Package
    )
  `)

  await conn.query(`
    CREATE REL TABLE IF NOT EXISTS DECLARES_DEP(
      FROM LockPackage TO DependencyDecl
    )
  `)

  await conn.query(`
    CREATE REL TABLE IF NOT EXISTS DEPENDS_ON(
      FROM LockPackage TO LockPackage,
      dep_kind STRING,
      dep_spec STRING
    )
  `)

  await conn.query(`
    CREATE REL TABLE IF NOT EXISTS RESOLVES_TO(
      FROM DependencyDecl TO Package
    )
  `)
}

module.exports = { openDatabase }
