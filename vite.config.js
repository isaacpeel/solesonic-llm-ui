import {defineConfig, loadEnv} from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from "@tailwindcss/vite";

const DEFAULT_APPLICATION_TITLE = 'Solesonic LLM'

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

// https://vite.dev/config/
export default defineConfig(({mode}) => {
    const environment = loadEnv(mode, process.cwd(), 'VITE_')
    const applicationTitle = environment.VITE_APP_TITLE?.trim() || DEFAULT_APPLICATION_TITLE

    return {
        plugins: [react(), tailwindcss(), applicationTitlePlugin(applicationTitle)],
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
