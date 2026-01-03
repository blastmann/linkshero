import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/scanner.ts'),
        options: resolve(__dirname, 'options.html')
      },
      output: {
        manualChunks: undefined,
        entryFileNames: chunk => {
          if (chunk.name === 'background') {
            return 'background.js'
          }
          if (chunk.name === 'content') {
            return 'content.js'
          }
          if (chunk.name === 'options') {
            return 'assets/options.js'
          }
          return 'assets/[name].js'
        },
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
})

