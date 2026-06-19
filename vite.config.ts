import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, join } from 'path';
import { existsSync, statSync, readFileSync } from 'fs';
import { VitePWA } from 'vite-plugin-pwa';

// MIME type mapping for serving static files
const mimeTypes: Record<string, string> = {
  'html': 'text/html; charset=utf-8',
  'htm': 'text/html; charset=utf-8',
  'js': 'application/javascript; charset=utf-8',
  'mjs': 'application/javascript; charset=utf-8',
  'cjs': 'application/javascript; charset=utf-8',
  'ts': 'application/typescript; charset=utf-8',
  'css': 'text/css; charset=utf-8',
  'json': 'application/json; charset=utf-8',
  'yaml': 'text/yaml; charset=utf-8',
  'yml': 'text/yaml; charset=utf-8',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'svg': 'image/svg+xml',
  'ico': 'image/x-icon',
  'webp': 'image/webp',
  'woff': 'font/woff',
  'woff2': 'font/woff2',
  'ttf': 'font/ttf',
  'otf': 'font/otf',
  'eot': 'application/vnd.ms-fontobject',
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'txt': 'text/plain; charset=utf-8',
  'md': 'text/markdown; charset=utf-8',
  'xml': 'application/xml; charset=utf-8',
  'wasm': 'application/wasm',
};

// Get MIME type from file extension
function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return mimeTypes[ext] || 'application/octet-stream';
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'maskable-icon.png'],
      manifest: {
        name: 'Feature Desk',
        short_name: 'Feature Desk',
        description: 'A revolutionary smart study desk with integrated AI-powered educational platform.',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'any',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5 MiB
      }
    }),
    // Custom plugin to serve /lab folder as static files for PhET simulations
    {
      name: 'serve-lab-folder',
      configureServer(server) {
        // This middleware serves the entire lab folder at /lab path
        // Handles all file types and nested directories
        server.middlewares.use('/lab', (req, res, next) => {
          try {
            // Get the requested file path
            let url = req.url || '/';

            // Remove query string if present
            const queryIndex = url.indexOf('?');
            if (queryIndex !== -1) {
              url = url.substring(0, queryIndex);
            }

            // Decode URI and resolve file path
            const decodedUrl = decodeURIComponent(url);
            const filePath = resolve(__dirname, 'lab', decodedUrl.slice(1) || '');

            // Check if file exists
            if (existsSync(filePath)) {
              const stat = statSync(filePath);

              if (stat.isFile()) {
                // Read and serve the file
                const content = readFileSync(filePath);
                const mimeType = getMimeType(filePath);

                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Length', stat.size);
                res.setHeader('Cache-Control', 'no-cache');
                res.statusCode = 200;
                res.end(content);
                return;
              } else if (stat.isDirectory()) {
                // Try to serve index.html from directory
                const indexFile = join(filePath, 'index.html');
                if (existsSync(indexFile)) {
                  const content = readFileSync(indexFile);
                  res.setHeader('Content-Type', 'text/html; charset=utf-8');
                  res.statusCode = 200;
                  res.end(content);
                  return;
                }
              }
            }

            // File not found, continue to next middleware
            next();
          } catch (error) {
            console.error('[lab-server] Error:', error);
            next();
          }
        });
      }
    }
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
    entries: [
      'src/**/*.{ts,tsx}',
      'index.html'
    ]
  },
  // Serve public folder for static assets
  publicDir: 'public',
  server: {
    watch: {
      // Don't watch lab folders to improve performance
      ignored: ['**/lab/**', '**/Physics_lab/**', '**/node_modules/**']
    },
    headers: {
      // Allow unsafe-eval for PhET simulations which require eval()
      'Content-Security-Policy': "script-src 'self' 'unsafe-inline' 'unsafe-eval'; default-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https: wss: ws:;"
    },
    // Allow accessing files in lab and Physics_lab folders
    fs: {
      allow: ['..', 'lab', 'Physics_lab']
    }
  },
  build: {
    // Increase chunk size warning threshold (our app is large)
    chunkSizeWarningLimit: 1000,
    // No sourcemaps in production (reduces deploy size)
    sourcemap: false,
    rollupOptions: {
      external: [/\/lab\/.*/],
      output: {
        // Manual chunk splitting for stable, predictable chunk names
        // This prevents chunk hash changes from breaking cached dynamic imports
        manualChunks: {
          // Core React
          'vendor-react': ['react', 'react-dom'],
          // Supabase client
          'vendor-supabase': ['@supabase/supabase-js'],
          // Gemini AI
          'vendor-gemini': ['@google/generative-ai']
        }
      }
    }
  }
});
