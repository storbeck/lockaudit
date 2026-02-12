const lbug = require("lbug")

async function openDatabase(file = "lockaudit.ldbg") {
  const db = new lbug.Database(file)
  const conn = new lbug.Connection(db)

  await ensureSchema(conn)

  return conn
}

async function ensureSchema(conn) {
  // (:Package)
  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS Package(
      key STRING PRIMARY KEY,
      name STRING,
      version STRING,
      resolved STRING,
      integrity STRING,
      dev BOOL,
      is_optional BOOL
    )
  `)

  // (:Vulnerability)
  await conn.query(`
    CREATE NODE TABLE IF NOT EXISTS Vulnerability(
      id STRING PRIMARY KEY,
      source STRING,
      summary STRING,
      severity STRING,
      published_at STRING,
      modified_at STRING
    )
  `) 

  // (:Package)-[:HAS_DEP]-(:Package)
  await conn.query(`
    CREATE REL TABLE IF NOT EXISTS HAS_DEP(
      FROM Package TO Package,
      dep_type STRING
    )
  `)

  // (:Vulnerability)-[:AFFECTS]->(:Package)
  await conn.query(`
    CREATE REL TABLE IF NOT EXISTS AFFECTS(
      FROM Vulnerability to Package
    )
  `)
}

module.exports = { openDatabase }
