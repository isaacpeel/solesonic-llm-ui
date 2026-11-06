import {defineConfig, loadEnv} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";

const DEFAULT_APPLICATION_TITLE = 'Solesonic LLM'
const APPLICATION_THEME_COLOR = '#1e1e1e'

function escapeHtmlText(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

// Rewrites the <title> in index.html at build/serve time so deployments can
// override it with VITE_APP_TITLE without editing the HTML shell.
function applicationTitlePlugin(applicationTitle) {
    return {
        name: 'application-title',
        transformIndexHtml(html) {
            return html.replace(
                /<title>[\s\S]*?<\/title>/,
                `<title>${escapeHtmlText(applicationTitle)}</title>`
            )
        }
    }
}

function buildApplicationManifest(applicationTitle) {
    return {
        name: applicationTitle,
        short_name: applicationTitle,
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: APPLICATION_THEME_COLOR,
        theme_color: APPLICATION_THEME_COLOR,
        icons: [
            {src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png'},
            {src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png'},
            {src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
        ],
    }
}

// Generates the web app manifest from VITE_APP_TITLE so its name never drifts from <title>.
function applicationManifestPlugin(applicationTitle) {
    const manifestSource = JSON.stringify(buildApplicationManifest(applicationTitle), null, 2)

    return {
        name: 'application-manifest',
        configureServer(server) {
            server.middlewares.use('/manifest.webmanifest', (request, response) => {
                response.setHeader('Content-Type', 'application/manifest+json')
                response.end(manifestSource)
            })
        },
        generateBundle() {
            this.emitFile({type: 'asset', fileName: 'manifest.webmanifest', source: manifestSource})
        },
    }
}

// https://vite.dev/config/
export default defineConfig(({mode}) => {
    const environment = loadEnv(mode, process.cwd(), 'VITE_')
    const applicationTitle = environment.VITE_APP_TITLE?.trim() || DEFAULT_APPLICATION_TITLE

    return {
        plugins: [react(), tailwindcss(), applicationTitlePlugin(applicationTitle), applicationManifestPlugin(applicationTitle)],
        server: {
            port: 3000,
        },
        build: {
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        // Split dependencies into separate chunks
                        if (id.includes('node_modules')) {
                            return 'vendor'; // This will create a separate chunk for vendor dependencies
                        }

                        // Additional custom chunking rules can go here
                        // E.g., split large modules into their own chunk
                    }
                }
            },
            chunkSizeWarningLimit: 1000, // Increase the warning limit to 1MB (1000KB)
        },
        test: {
            include: ['**/*.test*jsx', '**/*.test*js'],
            globals: true,
            environment: 'jsdom',
            setupFiles: './vitest.setup.js',
            coverage: {
                provider: 'v8',
                reporter: ['lcov', 'text'],
                reportOnFailure: true,
            },
        }
    }
})
