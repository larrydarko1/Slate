import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    main: {
        resolve: {
            alias: {
                '@/main': fileURLToPath(new URL('./src/main', import.meta.url)),
                '@/schemas': fileURLToPath(new URL('./src/schemas', import.meta.url)),
            },
        },
        esbuild: { tsconfigRaw: { compilerOptions: { target: 'ESNext' } } },
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/main/index.ts'),
                },
            },
        },
    },
    preload: {
        resolve: {
            alias: {
                '@/preload': fileURLToPath(new URL('./src/preload', import.meta.url)),
                '@/schemas': fileURLToPath(new URL('./src/schemas', import.meta.url)),
            },
        },
        esbuild: { tsconfigRaw: { compilerOptions: { target: 'ESNext' } } },
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/preload/index.ts'),
                },
                output: {
                    format: 'cjs',
                    entryFileNames: 'index.cjs',
                },
            },
        },
    },
    renderer: {
        plugins: [vue()],
        resolve: {
            alias: {
                '@/renderer': fileURLToPath(new URL('./src/renderer', import.meta.url)),
                '@/schemas': fileURLToPath(new URL('./src/schemas', import.meta.url)),
            },
        },
        css: {
            preprocessorOptions: {
                scss: {
                    // Puts the design tokens and mixins in scope for every SFC without
                    // an import line. Nothing in src/renderer/styles/ records that it is
                    // depended on this way, so removing it breaks all 15 components at
                    // once with an undefined-variable error and no obvious cause.
                    // Only _variables.scss is injected, because it emits nothing; the
                    // index.scss entry would ship every global rule once per component.
                    // Files inside styles/ are exempt: they @use _variables.scss
                    // themselves, and index.scss is imported by main.ts.
                    additionalData: (source: string, filename: string) =>
                        filename.replace(/\\/g, '/').includes('/renderer/styles/')
                            ? source
                            : `@use '@/renderer/styles/variables' as *;\n${source}`,
                },
            },
        },
        base: './',
        root: resolve(__dirname, 'src/renderer'),
        publicDir: resolve(__dirname, 'public'),
        server: {
            port: 3000,
            strictPort: true,
        },
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/renderer/index.html'),
                },
            },
        },
    },
});
