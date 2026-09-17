import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://localhost:5173'
const get = (path, init = {}) => fetch(new URL(path, base), {
  ...init,
  signal: AbortSignal.timeout(15_000),
})

const page = await get('/')
assert.equal(page.status, 200)
assert.match(await page.text(), /\/src\/main\.tsx/)
const health = await get('/api/health')
assert.equal(health.status, 200)
assert.equal((await health.json()).status, 'ok')

const body = `Sandbox接続確認 ${new Date().toISOString()}`
const created = await get('/api/notes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ body }),
})
assert.equal(created.status, 201)
const note = await created.json()
assert.equal(note.body, body)
assert.ok(Number.isInteger(note.id) && note.id > 0)
const list = await get('/api/notes')
assert.equal(list.status, 200)
assert.ok((await list.json()).some((item) => item.id === note.id && item.body === body))

const invalid = await get('/api/notes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ body: '   ' }),
})
assert.equal(invalid.status, 400)
console.log(`PASS: ${base} — HTML配信、DB疎通、メモ登録・一覧、不正入力。登録ID: ${note.id}`)
