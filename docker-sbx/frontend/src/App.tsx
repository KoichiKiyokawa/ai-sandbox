import { useEffect, useRef, useState, type FormEvent } from 'react'

type Note = { id: number; body: string; created_at: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error ?? `通信に失敗しました（HTTP ${response.status}）。`)
  }
  return response.json() as Promise<T>
}

async function requestNoContent(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(path, { ...init, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error ?? `通信に失敗しました（HTTP ${response.status}）。`)
  }
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [body, setBody] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const requestId = useRef(0)
  const currentQuery = useRef('')
  const length = Array.from(body.trim()).length
  const editLength = Array.from(editBody.trim()).length
  const busy = loading || saving || editSaving || deletingId !== null
  const controlsDisabled = busy || editingId !== null

  async function load(query: string) {
    const id = ++requestId.current
    setLoading(true)
    setError('')
    const path = query ? `/api/notes?${new URLSearchParams({ q: query })}` : '/api/notes'
    try {
      const loadedNotes = await request<Note[]>(path)
      if (id === requestId.current) setNotes(loadedNotes)
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : 'メモを取得できませんでした。')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  useEffect(() => { void load('') }, [])

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (controlsDisabled) return
    const query = searchInput.trim()
    setSearchInput(query)
    setSearchQuery(query)
    currentQuery.current = query
    void load(query)
  }

  function clearSearch() {
    if (controlsDisabled) return
    setSearchInput('')
    setSearchQuery('')
    currentQuery.current = ''
    void load('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (length < 1 || length > 500 || controlsDisabled) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await request<Note>('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      })
      setBody('')
      setMessage('メモを保存しました。')
      await load(currentQuery.current)
    } catch (e) { setError(e instanceof Error ? e.message : 'メモを保存できませんでした。') }
    finally { setSaving(false) }
  }

  async function remove(note: Note) {
    if (controlsDisabled || !window.confirm(`「${note.body}」を削除しますか？`)) return
    setDeletingId(note.id)
    setError('')
    setMessage('')
    try {
      await requestNoContent(`/api/notes/${note.id}`, { method: 'DELETE' })
      setNotes((current) => current.filter((item) => item.id !== note.id))
      setMessage('メモを削除しました。')
      await load(currentQuery.current)
    } catch (e) { setError(e instanceof Error ? e.message : 'メモを削除できませんでした。') }
    finally { setDeletingId(null) }
  }

  function startEditing(note: Note) {
    if (controlsDisabled) return
    setEditingId(note.id)
    setEditBody(note.body)
    setError('')
    setMessage('')
  }

  function cancelEditing() {
    if (editSaving) return
    setEditingId(null)
    setEditBody('')
    setError('')
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault()
    if (editLength < 1 || editLength > 500 || busy || editingId !== id) return
    setEditSaving(true)
    setError('')
    setMessage('')
    try {
      const note = await request<Note>(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editBody.trim() }),
      })
      setNotes((current) => current.map((item) => item.id === id ? note : item))
      setEditingId(null)
      setEditBody('')
      setMessage('メモを更新しました。')
      await load(currentQuery.current)
    } catch (e) { setError(e instanceof Error ? e.message : 'メモを更新できませんでした。') }
    finally { setEditSaving(false) }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-emerald-950/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <a href="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-emerald-950 text-lime-200">s.</span>
            Sandbox Notes
          </a>
          <span className="font-mono text-xs text-emerald-900/65">LOCAL EXPERIMENT / 01</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
        <p className="mb-5 font-mono text-xs tracking-[.2em] text-emerald-800">A SMALL PLACE TO TRY THINGS.</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">小さく試して、<br /><span className="text-emerald-700">メモに残す。</span></h1>
        <p className="mt-5 max-w-lg text-sm leading-7 text-emerald-950/65">気づいたことや次に試したいことを、ここに。保存したメモは、ページを閉じても残ります。</p>
        <div className="mt-12 grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section className="rounded-2xl border border-emerald-950/10 bg-white p-6 shadow-sm" aria-labelledby="new-note">
            <h2 id="new-note" className="mb-5 text-lg font-semibold">新しいメモ</h2>
            <form onSubmit={submit}>
              <label htmlFor="body" className="mb-2 block text-sm font-medium">メモの内容</label>
              <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} disabled={controlsDisabled} rows={6}
                placeholder="今日は何を試しますか？" aria-describedby="body-limit"
                className="w-full resize-y rounded-xl border border-emerald-950/15 bg-stone-50 p-4 text-sm leading-7 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 disabled:opacity-60" />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span id="body-limit" className={`font-mono text-xs ${length > 500 ? 'text-red-700' : 'text-emerald-950/50'}`}>{length} / 500文字</span>
                <button disabled={controlsDisabled || length < 1 || length > 500} className="rounded-xl bg-emerald-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">{saving ? '保存中…' : 'メモを保存 →'}</button>
              </div>
            </form>
            <p role="status" className="mt-4 min-h-5 text-sm text-emerald-700">{message}</p>
          </section>
          <section aria-labelledby="note-list" aria-busy={loading}>
            <form onSubmit={search} className="mb-5 flex flex-col gap-3 sm:flex-row">
              <label htmlFor="search" className="sr-only">メモを検索</label>
              <input id="search" type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                placeholder="メモを検索" disabled={controlsDisabled}
                className="min-w-0 flex-1 rounded-xl border border-emerald-950/15 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 disabled:opacity-60" />
              <div className="flex gap-2">
                <button disabled={controlsDisabled} className="rounded-xl bg-emerald-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-40">検索</button>
                {searchQuery && <button type="button" onClick={clearSearch} disabled={controlsDisabled} className="rounded-xl border border-emerald-950/15 px-4 py-3 text-sm text-emerald-800 disabled:opacity-40">解除</button>}
              </div>
            </form>
            <div className="mb-5 flex items-center justify-between">
              <h2 id="note-list" className="text-lg font-semibold">保存したメモ <span className="ml-2 font-mono text-sm text-emerald-950/45">{notes.length}</span></h2>
              <button onClick={() => void load(currentQuery.current)} disabled={controlsDisabled} className="text-sm text-emerald-700 underline decoration-emerald-700/30 underline-offset-4 disabled:opacity-40">{loading ? '読み込み中…' : '再読み込み'}</button>
            </div>
            {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
            {!loading && !error && notes.length === 0 && (searchQuery
              ? <div className="rounded-2xl border border-dashed border-emerald-950/20 p-10 text-center"><p className="font-medium">該当するメモはありません。</p><p className="mt-2 text-sm text-emerald-950/55">検索条件を変えてお試しください。</p></div>
              : <div className="rounded-2xl border border-dashed border-emerald-950/20 p-10 text-center"><p className="font-medium">最初のメモを残しましょう。</p><p className="mt-2 text-sm text-emerald-950/55">保存すると、ここに表示されます。</p></div>)}
            <ol className="space-y-3">
              {notes.map((note) => <li key={note.id} className="rounded-xl border border-emerald-950/10 bg-white/70 p-5">
                {editingId === note.id ? <form onSubmit={(event) => void saveEdit(event, note.id)}>
                  <label htmlFor={`edit-body-${note.id}`} className="mb-2 block text-sm font-medium">メモを編集</label>
                  <textarea id={`edit-body-${note.id}`} value={editBody} onChange={(event) => setEditBody(event.target.value)} disabled={editSaving} rows={4}
                    aria-describedby={`edit-limit-${note.id}`}
                    className="w-full resize-y rounded-xl border border-emerald-950/15 bg-stone-50 p-4 text-sm leading-7 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 disabled:opacity-60" />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span id={`edit-limit-${note.id}`} className={`font-mono text-xs ${editLength > 500 ? 'text-red-700' : 'text-emerald-950/50'}`}>{editLength} / 500文字</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={cancelEditing} disabled={editSaving} className="rounded-lg border border-emerald-950/15 px-3 py-2 text-sm text-emerald-900 disabled:opacity-40">取り消し</button>
                      <button disabled={editSaving || editLength < 1 || editLength > 500} className="rounded-lg bg-emerald-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">{editSaving ? '保存中…' : '保存'}</button>
                    </div>
                  </div>
                </form> : <div className="flex items-start justify-between gap-4">
                  <p className="whitespace-pre-wrap break-words text-sm leading-7">{note.body}</p>
                  <button type="button" onClick={() => startEditing(note)} disabled={controlsDisabled} className="shrink-0 text-sm text-emerald-700 underline decoration-emerald-700/30 underline-offset-4 disabled:opacity-40">編集</button>
                </div>}
                <div className="mt-4 flex items-center justify-between gap-4">
                  <time dateTime={note.created_at} className="block font-mono text-xs text-emerald-950/45">{new Date(note.created_at).toLocaleString('ja-JP')}</time>
                  <button type="button" onClick={() => void remove(note)} disabled={controlsDisabled}
                    className="text-xs font-medium text-red-700 underline decoration-red-700/30 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-40">
                    {deletingId === note.id ? '削除中…' : '削除'}
                  </button>
                </div>
              </li>)}
            </ol>
            {notes.length === 100 && <p className="mt-3 text-xs text-emerald-950/55">最新100件を表示しています。</p>}
          </section>
        </div>
      </main>
    </div>
  )
}
