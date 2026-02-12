const OSV_API = "https://api.osv.dev"

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`OSV request failed: ${res.status} ${res.statusText}`)
  }

  return res.json()
}

async function getJson(url) {
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`OSV Request failed: ${res.status} ${res.statusText}`)
  }

  return res.json()
}

async function queryBatchNpm(packages) {
  // packages: [{ name, version }]
  const queries = packages.map(p => ({
    package: { ecosystem: "npm", name: p.name },
    version: p.version
  }))

  const data = await postJson(`${OSV_API}/v1/querybatch`, { queries })
  return data.results || []
}

async function getVuln(id) {
  return getJson(`${OSV_API}/v1/vulns/${encodeURIComponent(id)}`)
}

module.exports = { queryBatchNpm, getVuln }
