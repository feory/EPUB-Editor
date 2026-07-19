import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3999'
    }
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        // Granular chunking for better caching and performance
        manualChunks: (id) => {
          // PDF.js workers
          if (id.includes('pdfjs-dist')) {
            return 'pdf-worker';
          }
          // TinyMCE core + plugins bundled together
          if (id.includes('node_modules/tinymce')) {
            return 'tinymce';
          }
          // TinyMCE React wrapper
          if (id.includes('@tinymce/tinymce-react')) {
            return 'tinymce-react';
          }
          // React core libraries (trailing slash → don't catch react-virtuoso/react-router etc.)
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          // Router
          if (id.includes('react-router')) {
            return 'router';
          }
          // Large utilities
          if (id.includes('jszip') || id.includes('file-saver')) {
            return 'file-utils';
          }
          // Query/State management
          if (id.includes('@tanstack/react-query')) {
            return 'react-query';
          }
          // Icons
          if (id.includes('lucide-react')) {
            return 'icons';
          }
        }
      }
    }
  }
})
