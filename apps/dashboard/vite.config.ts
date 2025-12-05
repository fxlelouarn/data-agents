import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Charger .env depuis la racine du monorepo (2 niveaux au-dessus)
  const rootDir = path.resolve(__dirname, '../..')
  const env = loadEnv(mode, rootDir, '')

  const dashboardPort = parseInt(env.VITE_PORT || '4000', 10)
  const apiPort = parseInt(env.PORT || '4001', 10)

  return {
    plugins: [react()],
    server: {
      port: dashboardPort,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  }
})
