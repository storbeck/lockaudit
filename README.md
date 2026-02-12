# lockaudit

`lockaudit` is a CLI that:
1. Accepts a project root directory.
2. Automatically generates an SBOM.
3. Ingests package/dependency data into a local Ladybug graph (`lockaudit.ldbg`).
4. Enriches packages with OSV vulnerability data.
5. Answers remediation questions from the graph via `ask`.

Current graph model:
1. `(:Package { key, name, version, resolved, integrity, dev, is_optional })`
2. `(:Vulnerability { id, source, summary, severity, published_at, modified_at })`
3. `(:Package)-[:HAS_DEP]->(:Package)`
4. `(:Vulnerability)-[:AFFECTS]->(:Package)`

## Install

```bash
npm install
```

## Build And Run

Run against a project directory (recommended):

```bash
lockaudit ingest /absolute/path/to/project
```

Shortcut (same as `ingest`):

```bash
lockaudit /absolute/path/to/project
```

Requirements:
1. Project root must contain `package-lock.json`.
2. `npx` must be available.

This creates/updates `lockaudit.ldbg` in the repo root.

## Open DB Shell

```bash
lbug lockaudit.ldbg --path_history .
```

## Ask The Agent

Ask prioritization/remediation questions:

```bash
lockaudit ask "What should we fix this week?"
lockaudit ask "Show direct vs transitive exposure breakdown"
lockaudit ask "Explain GHSA-gxpj-cx7g-858c"
lockaudit ask "Explain package lodash"
```

Optional flags:

```bash
lockaudit ask "Top risks" --db ./lockaudit.ldbg
lockaudit ask "Top risks" --model gpt-4.1-mini
lockaudit ask "Top risks" --openai-base-url https://api.openai.com/v1
```

### LLM Required (OpenAI API)

`ask` is LLM-only and uses the OpenAI API to generate and run read-only Cypher queries against your graph, then answer from those results.

```bash
export OPENAI_API_KEY=your_key_here
lockaudit ask "What should we fix this week?"
lockaudit ask "Explain GHSA-gxpj-cx7g-858c with direct/transitive context" --model gpt-4.1-mini
```

Custom base URL (compatible OpenAI endpoint):

```bash
lockaudit ask "Top priorities" --openai-base-url https://api.openai.com/v1
```

If `OPENAI_API_KEY` is missing (or the model is unavailable), `ask` fails with an error.

Recommended shell settings for readable long output:

```text
:mode line
:max_width 10000
:stats off
```

## Useful Cypher Queries

```cypher
-- 1) Counts overview
MATCH (p:Package) RETURN count(p) AS packages;
```

```cypher
MATCH (v:Vulnerability) RETURN count(v) AS vulnerabilities;
```

```cypher
-- 2) Vulnerable package versions count
MATCH (v:Vulnerability)-[:AFFECTS]->(p:Package)
RETURN count(DISTINCT p.key) AS vulnerable_package_versions;
```

```cypher
-- 3) Packages with their vulnerability IDs
MATCH (v:Vulnerability)-[:AFFECTS]->(p:Package)
RETURN p.key, collect(DISTINCT v.id) AS vuln_ids
ORDER BY p.key;
```

```cypher
-- 4) Detailed advisories for one package
MATCH (v:Vulnerability)-[:AFFECTS]->(p:Package)
WHERE p.name = "lodash"
RETURN p.name, p.version, v.id, v.summary, v.severity, v.published_at
ORDER BY v.published_at DESC;
```

```cypher
-- 5) Top packages by advisory count
MATCH (v:Vulnerability)-[:AFFECTS]->(p:Package)
RETURN p.name, count(DISTINCT v.id) AS vuln_count
ORDER BY vuln_count DESC, p.name ASC
LIMIT 25;
```

```cypher
-- 6) Severity distribution
MATCH (v:Vulnerability)
RETURN v.severity, count(*) AS count
ORDER BY count DESC;
```

```cypher
-- 7) Dependency edges that lead to vulnerable dependencies
MATCH (a:Package)-[:HAS_DEP]->(b:Package)
MATCH (v:Vulnerability)-[:AFFECTS]->(b)
RETURN a.key AS depender, b.key AS vulnerable_dep, collect(DISTINCT v.id) AS vuln_ids
ORDER BY depender, vulnerable_dep;
```

```cypher
-- 8) Packages with no known advisories in current OSV sync
MATCH (p:Package)
WHERE NOT EXISTS {
  MATCH (:Vulnerability)-[:AFFECTS]->(p)
}
RETURN p.key
ORDER BY p.key
LIMIT 100;
```

```cypher
-- 9) Read one advisory cleanly
MATCH (v:Vulnerability {id: "GHSA-gxpj-cx7g-858c"})
RETURN v.id, v.summary, v.severity, v.published_at, v.modified_at;
```
