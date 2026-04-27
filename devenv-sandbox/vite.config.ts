import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { createLogger, defineConfig, type Logger, type Plugin } from 'vite'

function hideLocalUrlLogger(): Logger {
  const logger = createLogger()
  const info = logger.info.bind(logger)

  logger.info = (message, options) => {
    const plainMessage = message.replace(/\x1b\[[0-9;]*m/g, '')
    if (plainMessage.includes('Local:')) {
      return
    }

    info(message, options)
  }

  return logger
}

function printPublicDevUrl(): Plugin {
  return {
    name: 'print-public-dev-url',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        setTimeout(() => {
          console.log(`  -> Public:  ${process.env.PORTLESS_URL ?? 'https://echodeck.localhost:1355'}`)
        }, 100)
      })
    },
  }
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  customLogger: hideLocalUrlLogger(),
  plugins: [tanstackStart(), viteReact(), tailwindcss(), printPublicDevUrl()],
})
