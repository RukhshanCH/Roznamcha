import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: './',
  plugins: [command === 'serve' ? inspectAttr() : null, react()].filter(Boolean),
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('src/db/')) return 'db';
          // existing vendor chunks
          if (id.includes('react') && id.includes('node_modules')) return 'vendor-react';
          if (id.includes('jotai') || id.includes('lucide-react')) return 'vendor-ui';
          if (id.includes('@radix-ui')) return 'vendor-radix';
        },
      },
    },
  },
}));
