import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | undefined

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Use devenv shell or devenv up.')
  }

  if (!cachedDb) {
    const client = postgres(process.env.DATABASE_URL, {
      max: 1,
      idle_timeout: 20,
    })

    cachedDb = drizzle(client, { schema })
  }

  return cachedDb
}
