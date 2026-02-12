# lockaudit

`lockaudit` is a CLI that:
1. Parses an npm `package-lock.json`.
2. Ingests package/dependency data into a local Ladybug graph (`lockaudit.ldbg`).
3. Enriches packages with OSV vulnerability data.

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

Run against a lockfile:

```bash
lockaudit /absolute/path/to/package-lock.json
```

Or without global bin:

```bash
node bin/lockaudit.js /absolute/path/to/package-lock.json
```

This creates/updates `lockaudit.ldbg` in the repo root.

## Open DB Shell

```bash
lbug lockaudit.ldbg --path_history .
```

Recommended shell settings for readable long output:

```text
:mode line
:max_width 10000
:stats off
```

## Useful Queries

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
