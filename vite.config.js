import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  logLevel: 'error',

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  plugins: [
    // base44({
    //   legacySDKImports:
    //     process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
    //   hmrNotifier: true,
    //   navigationNotifier: true,
    //   visualEditAgent: false,
    // }),
    react(),
  ],
})
