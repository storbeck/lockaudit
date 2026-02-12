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
      version STRING,
      resolved STRING,
      integrity STRING,
      dev BOOL,
      is_optional BOOL
    )
  `)

  await conn.query(`
    CREATE REL TABLE IF NOT EXISTS HAS_DEP(
      FROM Package TO Package,
      dep_type STRING
    )
  `)
}

module.exports = { openDatabase }
