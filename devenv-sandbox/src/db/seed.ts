import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.ts'
import { posts, users } from './schema.ts'

function createSeedDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Use devenv shell or devenv up.')
  }

  const client = postgres(process.env.DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
  })

  return {
    client,
    db: drizzle(client, { schema }),
  }
}

export async function ensureSeedData() {
  const { client, db } = createSeedDb()

  try {
    const [existing] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)

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
  } finally {
    await client.end()
  }
}

async function main() {
  await ensureSeedData()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
