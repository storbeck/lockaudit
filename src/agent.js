const lbug = require("lbug")
const OpenAI = require("openai")

const DEFAULT_DB_PATH = "lockaudit.ldbg"
const DEFAULT_MODEL = "gpt-4.1-mini"
const DEFAULT_MAX_ROWS = 200
const DEFAULT_MAX_STEPS = 8

const BLOCKED_CYPHER = /\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|ALTER|COPY|LOAD|INSTALL|UNINSTALL|EXPORT|IMPORT|ATTACH)\b/i

function parseArgs(toolCall) {
  try {
    return JSON.parse(toolCall.function.arguments || "{}")
  } catch {
    return {}
  }
}

async function runCypher(conn, query, maxRows = DEFAULT_MAX_ROWS) {
  const q = String(query || "").trim().replace(/;+\s*$/, "")
  if (!q) throw new Error("Cypher query is required.")
  if (BLOCKED_CYPHER.test(q)) throw new Error("Only read-only Cypher is allowed.")
  const limited = /\bLIMIT\s+\d+\b/i.test(q) ? q : `${q}\nLIMIT ${maxRows}`
  const rows = await (await conn.query(limited)).getAll()
  return {
    query: limited,
    rowCount: rows.length,
    columns: rows.length ? Object.keys(rows[0]) : [],
    rows,
  }
}

async function ask(question, options = {}) {
  const q = String(question || "").trim()
  if (!q) throw new Error("Question is required.")

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.")

  const client = new OpenAI({
    apiKey,
    ...(options.openaiBaseUrl ? { baseURL: options.openaiBaseUrl } : {}),
  })

  const dbPath = options.dbPath || DEFAULT_DB_PATH
  const model = options.model || DEFAULT_MODEL
  const maxSteps = Number(options.maxSteps) > 0 ? Number(options.maxSteps) : DEFAULT_MAX_STEPS
  const db = new lbug.Database(dbPath, undefined, undefined, true)
  const conn = new lbug.Connection(db)

  const tools = [
    {
      type: "function",
      function: {
        name: "run_cypher",
        description: "Run a read-only Cypher query against the lockaudit graph.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: {
              type: "string",
              description: "Read-only Cypher query. Do not use writes (CREATE/MERGE/DELETE/SET/etc).",
            },
          },
          required: ["query"],
        },
      },
    },
  ]

  const messages = [
    {
      role: "system",
      content: [
        "You are a dependency-security analyst.",
        "Answer by using run_cypher tool calls against the Ladybug graph database.",
        "Do not invent data; if evidence is missing, say so.",
        "Always include concrete evidence from query results.",
        "Schema:",
        "Package(key, name, version, resolved, integrity, dev, is_optional)",
        "Vulnerability(id, source, summary, severity, published_at, modified_at)",
        "(:Package)-[:HAS_DEP]->(:Package)",
        "(:Vulnerability)-[:AFFECTS]->(:Package)",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Question: ${q}`,
        "",
        "You can call tools multiple times.",
        "Return concise remediation guidance with supporting evidence and direct/transitive context when relevant.",
      ].join("\n"),
    },
  ]

  for (let step = 0; step < maxSteps; step += 1) {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      messages,
      tools,
      tool_choice: "auto",
    })

    const message = completion.choices?.[0]?.message
    if (!message) throw new Error("OpenAI returned no message.")

    messages.push({
      role: "assistant",
      content: message.content || "",
      ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
    })

    const toolCalls = message.tool_calls || []
    if (!toolCalls.length) {
      const content = String(message.content || "").trim()
      if (!content) throw new Error("OpenAI returned an empty response.")
      return content
    }

    for (const toolCall of toolCalls) {
      const args = parseArgs(toolCall)
      let toolResult

      if (toolCall.function.name === "run_cypher") {
        try {
          toolResult = await runCypher(conn, args.query, options.maxRows || DEFAULT_MAX_ROWS)
        } catch (err) {
          toolResult = { error: String(err.message || err) }
        }
      } else {
        toolResult = { error: `Unknown tool: ${toolCall.function.name}` }
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      })
    }
  }
  const overview = await runCypher(
    conn,
    `
    MATCH (p:Package)
    WITH count(p) AS packages
    MATCH (v:Vulnerability)
    WITH packages, count(v) AS vulnerabilities
    MATCH ()-[d:HAS_DEP]->()
    WITH packages, vulnerabilities, count(d) AS dep_edges
    MATCH ()-[a:AFFECTS]->()
    RETURN packages, vulnerabilities, dep_edges, count(a) AS affects_edges
  `,
    1,
  )
  const counts = overview.rows[0] || {}
  return [
    "I could not finish the query loop. Grounded summary:",
    "",
    `- Packages: ${counts.packages ?? "unknown"}`,
    `- Vulnerabilities: ${counts.vulnerabilities ?? "unknown"}`,
    `- Dependency edges: ${counts.dep_edges ?? "unknown"}`,
    `- Affects edges: ${counts.affects_edges ?? "unknown"}`,
  ].join("\n")
}

module.exports = { ask, runCypher }
