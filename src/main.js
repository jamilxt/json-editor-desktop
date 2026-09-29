import App from './App.svelte'
import { mount } from 'svelte'
import 'svelte-jsoneditor/themes/jse-theme-dark.css'

const app = mount(App, { target: document.getElementById('app') })

export default app
