import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

export const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  const { auth } = await import('./auth')

  return await auth.api.getSession({
    headers: getRequestHeaders(),
  })
})

export async function requireSession() {
  const { auth } = await import('./auth')
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
  })

  if (!session) {
    throw new Error('Unauthorized')
  }

  return session
}
