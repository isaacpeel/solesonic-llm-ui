import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import Inspect from 'vite-plugin-inspect';
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), Inspect(), tailwindcss()],
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
    }
})
