import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('./local/',import.meta.url)),publicDir:fileURLToPath(new URL('./public/',import.meta.url)),plugins:[react()],build:{outDir:fileURLToPath(new URL('./dist-local/client/',import.meta.url)),emptyOutDir:true},server:{host:'127.0.0.1'}});
