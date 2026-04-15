import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import process from 'node:process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory
  const env = loadEnv(mode, process.cwd(), '')
  
  // Determine if this is production build
  const isProduction = mode === 'production'
  const isDevelopment = mode === 'development'
  
  // API URL from environment or default
  const apiUrl = env.VITE_API_URL || (isDevelopment ? 'http://localhost:3000' : 'https://api.villageapi.com')
  
  return {
    plugins: [react()],
    
    // Path aliases for cleaner imports
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@pages': path.resolve(__dirname, './src/pages'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@store': path.resolve(__dirname, './src/store'),
        '@utils': path.resolve(__dirname, './src/utils'),
        '@styles': path.resolve(__dirname, './src/styles'),
        '@assets': path.resolve(__dirname, './src/assets'),
      }
    },
    
    // Server configuration
    server: {
      port: parseInt(env.VITE_PORT || '5173'),
      host: env.VITE_HOST || 'localhost',
      strictPort: false, // Don't exit if port is already in use
      open: env.VITE_OPEN_BROWSER === 'true', // Auto-open browser
      hmr: {
        overlay: true, // Show errors as overlay
      },
      // Proxy configuration for API requests
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          secure: isProduction,
          rewrite: (path) => path, // Keep the path as-is
          configure: (proxy) => {
            proxy.on('error', (err) => {
              console.log('Proxy error:', err)
            })
            proxy.on('proxyReq', (proxyReq, req) => {
              void proxyReq
              console.log(`Proxying: ${req.method} ${req.url} -> ${apiUrl}`)
            })
          }
        },
        '/v1': {
          target: apiUrl,
          changeOrigin: true,
          secure: isProduction,
        },
        '/admin': {
          target: apiUrl,
          changeOrigin: true,
          secure: isProduction,
        },
        '/auth': {
          target: apiUrl,
          changeOrigin: true,
          secure: isProduction,
        },
        '/b2b': {
          target: apiUrl,
          changeOrigin: true,
          secure: isProduction,
        },
        '/payments': {
          target: apiUrl,
          changeOrigin: true,
          secure: isProduction,
        },
        '/teams': {
          target: apiUrl,
          changeOrigin: true,
          secure: isProduction,
        },
        '/webhooks': {
          target: apiUrl,
          changeOrigin: true,
          secure: isProduction,
        },
        '/health': {
          target: apiUrl,
          changeOrigin: true,
          secure: isProduction,
        },
      },
      // CORS headers for development
      cors: true,
      // Watch for changes
      watch: {
        usePolling: env.VITE_USE_POLLING === 'true',
        interval: 1000,
      },
    },
    
    // Preview configuration (for production preview)
    preview: {
      port: parseInt(env.VITE_PREVIEW_PORT || '4173'),
      host: 'localhost',
      strictPort: false,
    },
    
    // Build configuration
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: isDevelopment ? 'inline' : true, // Sourcemaps in development, separate in production
      minify: isProduction ? 'esbuild' : false,
      target: 'es2020',
      chunkSizeWarningLimit: 1000, // kB
      rollupOptions: {
        output: {
          // Manual chunks for better caching
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('react') || id.includes('react-router-dom')) return 'react-vendor'
            if (id.includes('recharts')) return 'chart-vendor'
            if (id.includes('zustand')) return 'state-vendor'
            if (id.includes('react-hot-toast')) return 'ui-vendor'
            return 'vendor'
          },
          // Asset file names
          assetFileNames: (assetInfo) => {
            const assetName = assetInfo.name || assetInfo.names?.[0] || 'asset'
            let extType = assetName.split('.').at(1) || 'misc'
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
              extType = 'img'
            }
            return `assets/${extType}/[name]-[hash][extname]`
          },
          // Chunk file names
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
        },
        // External dependencies (if any)
        external: [],
      },
      // Generate manifest for PWA or service workers
      manifest: true,
      // Enable CSS code splitting
      cssCodeSplit: true,
      // Empty outDir before building
      emptyOutDir: true,
    },
    
    // CSS configuration
    css: {
      modules: {
        localsConvention: 'camelCase',
        generateScopedName: isDevelopment 
          ? '[name]__[local]__[hash:base64:5]'
          : '[hash:base64:8]',
      },
      preprocessorOptions: {
        scss: {
          additionalData: `@import "@/styles/variables.scss";`,
        },
      },
      devSourcemap: isDevelopment,
    },
    
    // Environment variables to expose to the client
    define: {
      // Expose environment variables (only VITE_ prefixed are automatically exposed)
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    
    // Optimize dependencies
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'recharts',
        'zustand',
        'react-hot-toast',
      ],
      exclude: [],
    },
    
    // ESBuild configuration
    esbuild: {
      // Drop console logs in production
      drop: isProduction ? ['console', 'debugger'] : [],
      // Keep comments in development
      legalComments: isDevelopment ? 'inline' : 'none',
    },
    
    // Development server features
    logLevel: 'info',
    clearScreen: false,
  }
})
