import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const base = process.argv[2] ?? 'http://localhost:5173'
const token = `pm-${randomUUID()}`
const created = []
async function call(path, method = 'GET', body) {
  return fetch(new URL(path, base), {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
}
async function search(query) {
  const response = await call(`/api/notes?q=${encodeURIComponent(query)}`)
  assert.equal(response.status, 200)
  return response.json()
}
async function create(body) {
  const response = await call('/api/notes', 'POST', { body })
  assert.equal(response.status, 201)
  const note = await response.json()
  created.push(note.id)
  return note
}

try {
  const first = await create(`${token} 100%_編集前`)
  const second = await create(`${token} 100xx削除対象`)
  assert.equal((await search(token)).length, 2, '作成した2件だけが検索されます')
  assert.deepEqual((await search(`${token} 100%_`)).map((n) => n.id), [first.id], '%と_は通常の文字として検索します')

  const updated = await call(`/api/notes/${first.id}`, 'PATCH', { body: `${token} 編集後` })
  assert.equal(updated.status, 200, '編集APIが成功します')
  const note = await updated.json()
  assert.equal(note.created_at, first.created_at, '編集しても作成日時を保持します')
  assert.equal(note.body, `${token} 編集後`)
  assert.equal((await search(`${token} 100%_`)).length, 0, '更新前の本文で検索しても出ません')
  assert.deepEqual((await search(`${token} 編集後`)).map((n) => n.id), [first.id])
  assert.equal((await call(`/api/notes/${first.id}`, 'PATCH', { body: note.body })).status, 200, '同じ本文への更新も成功します')
  assert.equal((await call(`/api/notes/${first.id}`, 'PATCH', { body: '   ' })).status, 400)

  const deleted = await call(`/api/notes/${second.id}`, 'DELETE')
  assert.equal(deleted.status, 204)
  assert.equal(await deleted.text(), '')
  assert.deepEqual((await search(token)).map((n) => n.id), [first.id], '削除したメモは検索にも出ません')
  assert.equal((await call(`/api/notes/${second.id}`, 'DELETE')).status, 404)
  assert.equal((await call(`/api/notes/${second.id}`, 'PATCH', { body: '存在しないメモ' })).status, 404)
  for (const method of ['PATCH', 'DELETE']) {
    assert.equal((await call('/api/notes/0', method, method === 'PATCH' ? { body: 'test' } : undefined)).status, 400)
  }
  console.log(`PASS: ${base} — 登録→検索→編集→再検索→削除、404、400、同一本文更新、作成日時保持`)
} finally {
  for (const id of created) {
    try {
      const response = await call(`/api/notes/${id}`, 'DELETE')
      if (![204, 404].includes(response.status)) console.error(`検証用メモID ${id}は削除できませんでした（HTTP ${response.status}）。`)
    } catch { console.error(`検証用メモID ${id}の削除に失敗しました。`) }
  }
}
