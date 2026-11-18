import { cpSync } from 'node:fs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, type Plugin } from 'vite'

// Copies the pdf.js runtime assets (cmaps, fonts, wasm, ICC profiles) into
// public/pdfjs so text and images render offline in dev and in builds.
function pdfjsAssets(): Plugin {
  return {
    name: 'juliepdf:pdfjs-assets',
    buildStart() {
      for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
        cpSync(`node_modules/pdfjs-dist/${dir}`, `public/pdfjs/${dir}`, { recursive: true })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), pdfjsAssets()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
})
