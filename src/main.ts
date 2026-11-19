import { mount } from 'svelte'
import './theme/tokens.css'
import './theme/base.css'
import './annotations'
import './tools'
import App from './App.svelte'
import { warmUpPdfWorker } from './core/viewer/pdfEngine'

const app = mount(App, { target: document.getElementById('app')! })

// After the first paint, so it never delays the window; before the first open.
setTimeout(warmUpPdfWorker, 0)

export default app
