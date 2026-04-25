import { createServerFn } from '@tanstack/react-start'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import {
  Bell,
  Bookmark,
  Compass,
  Heart,
  Home,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Search,
  Send,
  User,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { addReaction, getTimeline, publishPost } from '@/db/timeline'
import { authClient } from '@/lib/auth-client'
import { requireSession } from '@/lib/auth.functions'

const loadTimeline = createServerFn({ method: 'GET' }).handler(async () => {
  return await getTimeline()
})

const createPost = createServerFn({ method: 'POST' })
  .inputValidator((body: string) => body)
  .handler(async ({ data }) => {
    const session = await requireSession()
    await publishPost(data, session.user)
  })

const reactToPost = createServerFn({ method: 'POST' })
  .inputValidator((data: { postId: number; type: 'like' | 'repost' }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession()
    await addReaction(data.postId, data.type, session.user.id)
  })

export const Route = createFileRoute('/')({
  component: TimelinePage,
  loader: async () => await loadTimeline(),
  errorComponent: DatabaseError,
})

function TimelinePage() {
  const router = useRouter()
  const timeline = Route.useLoaderData()
  const session = authClient.useSession()
  const [draft, setDraft] = useState('')
  const [isPosting, setIsPosting] = useState(false)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const remaining = 280 - draft.length
  const trends = useMemo(
    () => [
      ['TanStack Start', '18.2K posts'],
      ['Drizzle ORM', '7,840 posts'],
      ['devenv', '3,219 posts'],
      ['Postgres', '21.4K posts'],
    ],
    [],
  )

  async function handleSubmit() {
    if (!draft.trim() || isPosting) {
      return
    }

    if (!session.data) {
      setIsAuthOpen(true)
      return
    }

    setIsPosting(true)
    try {
      await createPost({ data: draft })
      setDraft('')
      await router.invalidate()
    } catch (error) {
      if (isUnauthorizedError(error)) {
        setIsAuthOpen(true)
      }
    } finally {
      setIsPosting(false)
    }
  }

  async function handleReaction(postId: number, type: 'like' | 'repost') {
    if (!session.data) {
      setIsAuthOpen(true)
      return
    }

    try {
      await reactToPost({ data: { postId, type } })
      await router.invalidate()
    } catch (error) {
      if (isUnauthorizedError(error)) {
        setIsAuthOpen(true)
      }
    }
  }

  async function handleSignOut() {
    await authClient.signOut()
    await session.refetch()
  }

  return (
    <main className="min-h-screen bg-[#f7f9fb] text-[#101820]">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-0 lg:grid-cols-[240px_minmax(0,640px)_320px]">
        <aside className="sticky top-0 hidden h-screen border-r border-slate-200 bg-white px-4 py-5 lg:block">
          <div className="mb-8 text-2xl font-black tracking-normal text-[#1683a6]">
            EchoDeck
          </div>
          <nav className="space-y-1">
            <NavItem icon={<Home size={21} />} label="ホーム" active />
            <NavItem icon={<Search size={21} />} label="検索" />
            <NavItem icon={<Compass size={21} />} label="話題" />
            <NavItem icon={<Bell size={21} />} label="通知" />
            <NavItem icon={<Mail size={21} />} label="メッセージ" />
            <NavItem icon={<Bookmark size={21} />} label="保存" />
            <NavItem icon={<User size={21} />} label="プロフィール" />
          </nav>
          <UserPanel
            email={session.data?.user.email}
            name={session.data?.user.name}
            onLogin={() => setIsAuthOpen(true)}
            onSignOut={handleSignOut}
          />
        </aside>

        <section className="min-h-screen border-x border-slate-200 bg-white">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-black">ホーム</h1>
              <div className="flex items-center gap-2">
                <HeaderAccount
                  email={session.data?.user.email}
                  name={session.data?.user.name}
                  onLogin={() => setIsAuthOpen(true)}
                  onSignOut={handleSignOut}
                />
                <button
                  className="grid h-9 w-9 place-items-center rounded-md hover:bg-slate-100"
                  type="button"
                  aria-label="その他"
                >
                  <MoreHorizontal size={20} />
                </button>
              </div>
            </div>
          </header>

          <div className="border-b border-slate-200 px-4 py-4">
            <div className="flex gap-3">
              <Avatar label="AI" />
              <div className="min-w-0 flex-1">
                <textarea
                  className="min-h-24 w-full resize-none border-0 bg-transparent text-lg outline-none placeholder:text-slate-400"
                  maxLength={280}
                  placeholder="いま何が起きていますか？"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <span
                    className={`text-sm ${remaining < 24 ? 'text-rose-600' : 'text-slate-500'}`}
                  >
                    {remaining}
                  </span>
                  <button
                    className="inline-flex items-center gap-2 rounded-md bg-[#1683a6] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#116985] disabled:cursor-not-allowed disabled:bg-slate-300"
                    type="button"
                    disabled={!draft.trim() || isPosting}
                    onClick={handleSubmit}
                  >
                    <Send size={16} />
                    投稿
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div>
            {timeline.map((post) => (
              <article
                className="border-b border-slate-200 px-4 py-4 transition hover:bg-slate-50"
                key={post.id}
              >
                <div className="flex gap-3">
                  <Avatar label={post.author.avatar} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-bold">{post.author.name}</span>
                      <span className="text-sm text-slate-500">
                        @{post.author.handle}
                      </span>
                      <span className="text-sm text-slate-400">・</span>
                      <time className="text-sm text-slate-500">
                        {formatRelativeTime(post.createdAt)}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words leading-7">
                      {post.body}
                    </p>
                    <div className="mt-4 grid grid-cols-4 text-slate-500">
                      <MetricButton
                        icon={<MessageCircle size={18} />}
                        label="返信"
                        value={0}
                      />
                      <MetricButton
                        icon={<Repeat2 size={18} />}
                        label="リポスト"
                        value={post.reposts}
                        onClick={() => handleReaction(post.id, 'repost')}
                      />
                      <MetricButton
                        icon={<Heart size={18} />}
                        label="いいね"
                        value={post.likes}
                        onClick={() => handleReaction(post.id, 'like')}
                      />
                      <MetricButton icon={<Bookmark size={18} />} label="保存" />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="sticky top-0 hidden h-screen overflow-hidden bg-[#f7f9fb] px-5 py-5 lg:block">
          <div className="h-full space-y-4 overflow-y-auto pr-1">
            <label className="flex items-center gap-2 rounded-md bg-white px-3 py-3 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
              <Search size={18} />
              <input
                className="min-w-0 flex-1 bg-transparent outline-none"
                placeholder="検索"
              />
            </label>

            <section className="rounded-md bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-base font-black">いま話題</h2>
              <div className="mt-3 space-y-3">
                {trends.map(([name, count]) => (
                  <button
                    className="block w-full rounded-md px-2 py-2 text-left hover:bg-slate-50"
                    key={name}
                    type="button"
                  >
                    <div className="text-sm font-bold">{name}</div>
                    <div className="text-xs text-slate-500">{count}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-md bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-base font-black">おすすめユーザー</h2>
              <div className="mt-4 space-y-4">
                <Suggestion avatar="TS" name="TanStack Dev" handle="tanstack_dev" />
                <Suggestion avatar="DB" name="Drizzle Ops" handle="drizzle_ops" />
                <Suggestion avatar="AI" name="Sandbox AI" handle="sandbox_ai" />
              </div>
            </section>
          </div>
        </aside>
      </div>
      <AuthModal
        open={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthenticated={async () => {
          await session.refetch()
          setIsAuthOpen(false)
        }}
      />
    </main>
  )
}

function DatabaseError({ error }: { error: Error }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f9fb] px-5 text-[#101820]">
      <section className="w-full max-w-lg rounded-md bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-black">データベースに接続できません</h1>
        <p className="mt-3 leading-7 text-slate-600">
          Postgres を起動し、`pnpm db:push` でスキーマを反映してから再読み込みしてください。
        </p>
        <pre className="mt-4 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-white">
          {error.message}
        </pre>
      </section>
    </main>
  )
}

function NavItem({
  active,
  icon,
  label,
}: {
  active?: boolean
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-base font-semibold transition ${
        active ? 'bg-[#e7f4f7] text-[#116985]' : 'hover:bg-slate-100'
      }`}
      type="button"
    >
      {icon}
      {label}
    </button>
  )
}

function Avatar({ label }: { label: string }) {
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#dceff3] text-sm font-black text-[#116985]">
      {label}
    </div>
  )
}

function UserPanel({
  email,
  name,
  onLogin,
  onSignOut,
}: {
  email?: string
  name?: string
  onLogin: () => void
  onSignOut: () => void
}) {
  if (!email) {
    return (
      <button
        className="mt-6 w-full rounded-md bg-[#1683a6] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#116985]"
        type="button"
        onClick={onLogin}
      >
        ログインして投稿
      </button>
    )
  }

  return (
    <div className="mt-6 rounded-md bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="text-sm font-bold">{name || email}</div>
      <div className="truncate text-xs text-slate-500">{email}</div>
      <button
        className="mt-3 w-full rounded-md bg-white px-3 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
        type="button"
        onClick={onSignOut}
      >
        ログアウト
      </button>
    </div>
  )
}

function HeaderAccount({
  email,
  name,
  onLogin,
  onSignOut,
}: {
  email?: string
  name?: string
  onLogin: () => void
  onSignOut: () => void
}) {
  if (!email) {
    return (
      <button
        className="rounded-md px-3 py-2 text-sm font-bold text-[#116985] transition hover:bg-[#e7f4f7]"
        type="button"
        onClick={onLogin}
      >
        ログイン
      </button>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden max-w-32 truncate text-sm font-bold text-slate-600 sm:block">
        {name || email}
      </span>
      <button
        className="rounded-md px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
        type="button"
        onClick={onSignOut}
      >
        ログアウト
      </button>
    </div>
  )
}

function AuthModal({
  onAuthenticated,
  onClose,
  open,
}: {
  onAuthenticated: () => Promise<void>
  onClose: () => void
  open: boolean
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!open) {
    return null
  }

  async function handleAuthSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setError('')

    if (!email.trim() || password.length < 8) {
      setError('メールアドレスと 8 文字以上のパスワードを入力してください。')
      return
    }

    if (mode === 'signup' && !name.trim()) {
      setError('表示名を入力してください。')
      return
    }

    setIsSubmitting(true)

    try {
      const result =
        mode === 'signin'
          ? await authClient.signIn.email({
              email,
              password,
            })
          : await authClient.signUp.email({
              email,
              name,
              password,
            })

      if (result.error) {
        setError(getAuthErrorMessage(mode, result.error.message))
        return
      }

      await onAuthenticated()
    } catch (caughtError) {
      setError(getAuthErrorMessage(mode, getErrorMessage(caughtError)))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4">
      <form
        className="w-full max-w-md rounded-md bg-white p-5 shadow-xl ring-1 ring-slate-200"
        onSubmit={handleAuthSubmit}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black">
              {mode === 'signin' ? 'ログイン' : 'アカウント作成'}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              投稿、いいね、リポストにはログインが必要です。
            </p>
          </div>
          <button
            className="rounded-md px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
            type="button"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 rounded-md bg-slate-100 p-1">
          <button
            className={`rounded-md px-3 py-2 text-sm font-bold ${
              mode === 'signin' ? 'bg-white shadow-sm' : 'text-slate-600'
            }`}
            type="button"
            onClick={() => {
              setError('')
              setMode('signin')
            }}
          >
            ログイン
          </button>
          <button
            className={`rounded-md px-3 py-2 text-sm font-bold ${
              mode === 'signup' ? 'bg-white shadow-sm' : 'text-slate-600'
            }`}
            type="button"
            onClick={() => {
              setError('')
              setMode('signup')
            }}
          >
            新規作成
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {mode === 'signup' ? (
            <label className="block">
              <span className="text-sm font-bold text-slate-700">表示名</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 outline-none transition focus:border-[#1683a6]"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          ) : null}
          <label className="block">
            <span className="text-sm font-bold text-slate-700">
              メールアドレス
            </span>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 outline-none transition focus:border-[#1683a6]"
              autoComplete="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">パスワード</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 outline-none transition focus:border-[#1683a6]"
              autoComplete={
                mode === 'signin' ? 'current-password' : 'new-password'
              }
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <span className="mt-1 block text-xs text-slate-500">
              8 文字以上で入力してください。
            </span>
          </label>
        </div>

        {error ? (
          <div className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <button
          className="mt-5 w-full rounded-md bg-[#1683a6] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#116985] disabled:bg-slate-300"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? '送信中'
            : mode === 'signin'
              ? 'ログイン'
              : 'アカウントを作成'}
        </button>
      </form>
    </div>
  )
}

function MetricButton({
  icon,
  label,
  onClick,
  value,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  value?: number
}) {
  return (
    <button
      className="inline-flex min-h-9 items-center gap-2 rounded-md px-2 text-sm transition hover:bg-slate-100 hover:text-[#1683a6]"
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      {icon}
      {typeof value === 'number' ? <span>{value}</span> : null}
    </button>
  )
}

function Suggestion({
  avatar,
  handle,
  name,
}: {
  avatar: string
  handle: string
  name: string
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar label={avatar} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{name}</div>
        <div className="truncate text-xs text-slate-500">@{handle}</div>
      </div>
      <button className="rounded-md bg-[#101820] px-3 py-1.5 text-xs font-bold text-white">
        フォロー
      </button>
    </div>
  )
}

function formatRelativeTime(value: Date | string) {
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  const minutes = Math.max(1, Math.floor(diff / 60_000))

  if (minutes < 60) {
    return `${minutes}分`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    return `${hours}時間`
  }

  return `${Math.floor(hours / 24)}日`
}

function isUnauthorizedError(error: unknown) {
  return error instanceof Error && error.message.includes('Unauthorized')
}

function getAuthErrorMessage(mode: 'signin' | 'signup', detail?: string) {
  const fallback =
    mode === 'signin'
      ? 'ログインに失敗しました。'
      : 'アカウント作成に失敗しました。'

  if (!detail) {
    return fallback
  }

  return `${fallback} ${detail}`
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return ''
}
