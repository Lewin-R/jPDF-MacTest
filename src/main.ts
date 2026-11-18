import { mount } from 'svelte'
import './theme/tokens.css'
import './theme/base.css'
import './annotations'
import App from './App.svelte'

const app = mount(App, { target: document.getElementById('app')! })

export default app
