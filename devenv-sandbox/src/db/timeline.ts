import { desc, eq, sql } from 'drizzle-orm'
import { getDb } from './client'
import { postReactions, posts, users } from './schema'

type AuthUserInput = {
  email: string
  id: string
  name?: string | null
}

export async function ensureSeedData() {
  const db = getDb()
  const [existing] = await db.select({ count: sql<number>`count(*)` }).from(users)

  if (Number(existing.count) > 0) {
    return
  }

  const seededUsers = await db
    .insert(users)
    .values([
      {
        avatar: 'TS',
        handle: 'tanstack_dev',
        name: 'TanStack Dev',
        bio: 'Full-stack React experiments.',
      },
      {
        avatar: 'DB',
        handle: 'drizzle_ops',
        name: 'Drizzle Ops',
        bio: 'Typed SQL and tidy schemas.',
      },
      {
        avatar: 'AI',
        handle: 'sandbox_ai',
        name: 'Sandbox AI',
        bio: 'Local-first product sketches.',
      },
    ])
    .returning()

  await db.insert(posts).values([
    {
      authorId: seededUsers[0].id,
      body: 'TanStack Start、Drizzle、Postgres、Tailwind を一つの砂場にまとめました。投稿フォームから DB に保存できます。',
      likes: 42,
      reposts: 9,
    },
    {
      authorId: seededUsers[1].id,
      body: 'devenv で Postgres を起動して、pnpm db:push を実行すると永続化が有効になります。',
      likes: 18,
      reposts: 4,
    },
    {
      authorId: seededUsers[2].id,
      body: 'タイムライン、投稿、いいね、リポスト、トレンド、プロフィール要約まで入れた Twitter ライクな初期版です。',
      likes: 64,
      reposts: 15,
    },
  ])
}

export async function getTimeline() {
  const db = getDb()
  await ensureSeedData()

  return await db.query.posts.findMany({
    columns: {
      id: true,
      authorId: true,
      body: true,
      replyToId: true,
      reposts: true,
      likes: true,
      createdAt: true,
    },
    with: {
      author: {
        columns: {
          avatar: true,
          handle: true,
          name: true,
        },
      },
    },
    orderBy: [desc(posts.createdAt), desc(posts.id)],
    limit: 30,
  })
}

export async function publishPost(body: string, authUser: AuthUserInput) {
  const db = getDb()
  const trimmed = body.trim().slice(0, 280)

  if (!trimmed) {
    return
  }

  await ensureSeedData()
  const author = await ensureTimelineUser(authUser)

  await db.insert(posts).values({
    authorId: author.id,
    body: trimmed,
  })
}

async function ensureTimelineUser(authUser: AuthUserInput) {
  const db = getDb()
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.authUserId, authUser.id))

  if (existing) {
    return existing
  }

  const displayName = authUser.name?.trim() || authUser.email.split('@')[0]
  const handle = `u_${authUser.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`
  const avatar = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const [created] = await db
    .insert(users)
    .values({
      authUserId: authUser.id,
      avatar: avatar || 'ME',
      bio: '',
      handle,
      name: displayName.slice(0, 80),
    })
    .returning()

  return created
}

export async function addReaction(
  postId: number,
  type: 'like' | 'repost',
  authUserId: string,
) {
  const db = getDb()
  const inserted = await db
    .insert(postReactions)
    .values({
      authUserId,
      postId,
      type,
    })
    .onConflictDoNothing()
    .returning({ id: postReactions.id })

  if (inserted.length === 0) {
    return
  }

  await db
    .update(posts)
    .set({
      likes: type === 'like' ? sql`${posts.likes} + 1` : undefined,
      reposts: type === 'repost' ? sql`${posts.reposts} + 1` : undefined,
    })
    .where(eq(posts.id, postId))
}
