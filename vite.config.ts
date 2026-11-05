import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        // 大体积依赖各自独立分包：可并行下载；业务代码改动不会使 vendor 缓存失效
        manualChunks: {
          plotly: ['plotly.js-dist-min'],
          mathjs: ['mathjs'],
          katex: ['katex'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
