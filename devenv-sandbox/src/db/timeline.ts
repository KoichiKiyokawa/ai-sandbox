import { desc, eq, sql } from 'drizzle-orm'
import { getDb } from './client'
import { postReactions, posts, users } from './schema'

type AuthUserInput = {
  email: string
  id: string
  name?: string | null
}

export async function getTimeline() {
  const db = getDb()

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
