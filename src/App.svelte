<script>
  import { onMount } from 'svelte'
  import { JSONEditor } from 'svelte-jsoneditor'
  import { jsonrepair } from 'jsonrepair'
  import Ajv from 'ajv'
  import Modal from './Modal.svelte'
  import CurlModal from './CurlModal.svelte'
  import PathNavigator from './PathNavigator.svelte'
  import { deepDiff } from './lib/diff.js'
  import { parseCsv, rowsToObjects, jsonToCsv, detectDelimiter } from './lib/csv.js'
  import { formatBytes, isValidJsonText, contentToText } from './lib/utils.js'

  /* ---------- panel state ---------- */

  let leftHolder
  let rightHolder
  let leftEditor // svelte-jsoneditor component ref: scrollTo/expand methods
  let rightEditor
  let leftContent = { json: sampleJson() }
  let rightContent = { text: '' }
  let leftMode = 'tree'
  let rightMode = 'tree'
  let leftFilePath = null
  let leftDirty = false
  let rightFilePath = null
  let leftSchema = null
  let rightSchema = null

  /* ---------- app state ---------- */

  let darkMode = false
  let modal = null // null | { kind: 'transform' | 'schema' | 'curl' | 'about', target: 'left' | 'right' }
  let appVersion = ''
  let compareRows = null // null | array of diffs
  let recentFiles = []
  let statusMsg = ''
  let schemaErrors = []
  let fsSupported = typeof window !== 'undefined' && !!window.desktop

  function sampleJson () {
    return {
      name: 'JSON Editor Desktop',
      offline: true,
      features: ['tree', 'text', 'table', 'transform', 'compare', 'repair', 'csv', 'schema']
    }
  }

  /* ---------- init ---------- */

  onMount(async () => {
    if (fsSupported) {
      const s = await window.desktop.loadSettings()
      darkMode = !!s.darkMode
      recentFiles = s.recentFiles || []
      window.desktop.onMenu(async (action) => {
        if (action === 'open-file') await openInto('left')
        if (action === 'about') showAbout()
        if (action === 'save-and-quit') {
          await saveSide('left')
          // after save, dirty is false -> the pending close proceeds
          window.desktop.setDirty(false)
          window.close()
        }
      })
      if (window.desktop.appInfo) {
        window.desktop.appInfo().then((i) => { appVersion = i.version }).catch(() => {})
      }
    }
    applyTheme()
  })

  function persist () {
    if (fsSupported) {
      window.desktop.saveSettings({ darkMode, recentFiles })
    }
  }

  function applyTheme () {
    document.documentElement.classList.toggle('dark-mode', darkMode)
  }

  /* ---------- window title: filename + dirty dot ---------- */

  $: baseTitle = leftFilePath ? leftFilePath.split(/[\\/]/).pop() : 'untitled'
  $: document.title = (leftDirty ? '\u25cf ' : '') + baseTitle + ' - JSON Editor'
  $: if (window.desktop.setDirty) window.desktop.setDirty(leftDirty)

  function toggleDark () {
    darkMode = !darkMode
    applyTheme()
    persist()
  }

  function addRecent (p) {
    if (!p) return
    recentFiles = [p, ...recentFiles.filter((x) => x !== p)].slice(0, 10)
    persist()
  }

  /* ---------- parsing ---------- */

  function tryParse (content) {
    const text = contentToText(content)
    if (!text.trim()) return { ok: true, value: null }
    try {
      return { ok: true, value: JSON.parse(text) }
    } catch (e) {
      return { ok: false, value: null }
    }
  }

  /* ---------- open / save / drag-drop ---------- */

  async function openInto (side) {
    if (!fsSupported) return
    const res = await window.desktop.openFile({ kind: 'json' })
    if (!res) return
    loadContent(side, res.content, res.path)
  }

  function loadContent (side, rawText, filePath) {
    let text = String(rawText ?? '')

    // CSV import
    if (/\.csv$/i.test(filePath || '')) {
      try {
        const rows = parseCsv(text, detectDelimiter(text))
        text = JSON.stringify(rowsToObjects(rows), null, 2)
      } catch (e) {
        status('CSV import failed: ' + e.message)
        return
      }
    }

    let content
    try {
      content = { json: JSON.parse(text) }
    } catch (e) {
      // auto-repair like jsoneditoronline.org
      try {
        content = { json: JSON.parse(jsonrepair(text)) }
        status('Invalid JSON was repaired automatically')
      } catch (e2) {
        content = { text }
        status('Could not parse as JSON (loaded as text)')
      }
    }

    if (side === 'left') {
      leftContent = content
      leftFilePath = filePath || null
      leftDirty = false
      leftMode = 'tree'
      leftSchema = null
    } else {
      rightContent = content
      rightFilePath = filePath || null
      rightMode = 'tree'
      rightSchema = null
    }
    if (filePath) addRecent(filePath)
    compareRows = null
    schemaErrors = []
  }

  async function saveSide (side, asCsv = false) {
    if (!fsSupported) return
    const content = side === 'left' ? leftContent : rightContent
    let outText
    let outContent = content
    let defaultName
    if (asCsv) {
      const parsed = tryParse(content)
      if (!parsed.ok) {
        status('Cannot export: document is not valid JSON')
        return
      }
      outText = jsonToCsv(parsed.value)
      defaultName = 'export.csv'
    } else {
      if (contentToText(content).trim() === '') {
        status('Nothing to save')
        return
      }
      const parsed = tryParse(content)
      if (!parsed.ok) {
        const r = await window.desktop.confirm(
          'The document is not valid JSON. Save anyway?',
          ['Cancel', 'Repair and save', 'Save as-is'],
          'Invalid JSON'
        )
        if (r === 0) return
        if (r === 1) {
          try {
            outContent = { json: JSON.parse(jsonrepair(contentToText(content))) }
          } catch (e) {
            status('Repair failed: ' + e.message)
            return
          }
          if (side === 'left') {
            leftContent = outContent
          } else {
            rightContent = outContent
          }
        }
      }
      outText = JSON.stringify(tryParse(outContent).value, null, 2)
      const existing = side === 'left' ? leftFilePath : rightFilePath
      defaultName = existing ? existing.split(/[\\/]/).pop() : 'untitled.json'
    }

    const savedPath = await window.desktop.saveFile(outText, defaultName)
    if (savedPath) {
      if (side === 'left') { leftFilePath = savedPath; leftDirty = false }
      else rightFilePath = savedPath
      addRecent(savedPath)
      status('Saved: ' + savedPath)
    }
  }

  function handleDrop (side, event) {
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => loadContent(side, String(reader.result), file.name)
    reader.readAsText(file)
  }

  function handleDragOver (event) {
    event.preventDefault()
  }

  /* ---------- copy ---------- */

  async function copySide (side, formatted) {
    const content = side === 'left' ? leftContent : rightContent
    let text
    if (formatted) {
      const parsed = tryParse(content)
      if (!parsed.ok) {
        status('Cannot copy formatted: document is not valid JSON')
        return
      }
      text = JSON.stringify(parsed.value, null, 2)
    } else {
      text = contentToText(content)
    }
    await navigator.clipboard.writeText(text)
    status('Copied to clipboard' + (formatted ? ' (formatted)' : ''))
  }

  async function copyDiff () {
    if (!compareRows) return
    await navigator.clipboard.writeText(JSON.stringify(compareRows, null, 2))
    status('Differences copied to clipboard')
  }

  function copyFromRightToLeft () {
    if (contentToText(rightContent).trim() === '') {
      status('Right panel is empty')
      return
    }
    leftContent = rightContent
    leftFilePath = rightFilePath
    leftMode = rightMode
    compareRows = null
    status('Copied right document to left panel')
  }

  function copyFromLeftToRight () {
    leftContent = ensureLoaded(leftContent)
    rightContent = leftContent
    rightFilePath = null
    rightMode = leftMode
    compareRows = null
    status('Copied left document to right panel')
  }

  function ensureLoaded (content) {
    if (contentToText(content).trim() === '') {
      return { json: sampleJson() }
    }
    return content
  }

  /* ---------- transform / schema modal ---------- */

  function openTransform (side) {
    const content = side === 'left' ? leftContent : rightContent
    if (!isValidJsonText(contentToText(content))) {
      status('Fix the document first: it is not valid JSON')
      return
    }
    modal = { kind: 'transform', target: side }
  }

  function openSchema (side) {
    modal = { kind: 'schema', target: side }
  }

  function openCurl () {
    modal = { kind: 'curl', target: 'left' }
  }

  /* ---------- about / github ---------- */

  const REPO_URL = 'https://github.com/jamilxt/json-editor-desktop'

  function openGitHub () {
    window.desktop.openExternal(REPO_URL)
  }

  function showAbout () {
    modal = { kind: 'about' }
  }

  /* ---------- path navigator ---------- */

  async function navigateTo (side, path) {
    const editor = side === 'left' ? leftEditor : rightEditor
    const content = side === 'left' ? leftContent : rightContent
    if (!editor || !path.length) return
    if (!isValidJsonText(contentToText(content))) {
      status('Document is not valid JSON')
      return
    }
    try {
      editor.expand(path)
      await editor.scrollTo(path)
      status('Jumped to ' + (side === 'left' ? 'left' : 'right') + ' panel: ' + path.join('.'))
    } catch (e) {
      status('Could not jump: ' + (e.message || e))
    }
  }

  function onCurlApply (e) {
    const { content, side } = e.detail
    if (side === 'right') {
      rightContent = content
      rightFilePath = null
    } else {
      leftContent = content
      leftFilePath = null
    }
    compareRows = null
    modal = null
    status('Response placed in ' + side + ' panel')
  }

  function onModalApply (e) {
    const json = e.detail.json
    if (modal?.target === 'right') {
      rightContent = { json }
      rightFilePath = null
    } else {
      leftContent = { json }
      leftFilePath = null
    }
    compareRows = null
    modal = null
    status('Transform applied')
  }

  function onModalApplySchema (e) {
    const schema = e.detail.schema
    if (modal?.target === 'right') {
      rightSchema = schema
    } else {
      leftSchema = schema
    }
    validateSchemas()
    modal = null
    status(schema ? 'JSON Schema active' : 'JSON Schema removed')
  }

  function validateSchemas () {
    schemaErrors = []
    const ajv = new Ajv({ allErrors: true, strict: false })
    for (const [side, content, schema] of [
      ['Left', leftContent, leftSchema],
      ['Right', rightContent, rightSchema]
    ]) {
      if (!schema) continue
      const parsed = tryParse(content)
      if (!parsed.ok) {
        schemaErrors.push(side + ': document is not valid JSON')
        continue
      }
      try {
        const validate = ajv.compile(schema)
        if (!validate(parsed.value)) {
          for (const err of validate.errors || []) {
            schemaErrors.push(side + ' ' + (err.instancePath || '(root)') + ': ' + err.message)
          }
        }
      } catch (e) {
        schemaErrors.push(side + ': schema error: ' + e.message)
      }
    }
  }

  $: if (leftContent && rightContent && leftSchema !== undefined) {
    // re-validate on content changes (cheap guard, schema only applied when set)
  }

  /* ---------- compare ---------- */

  function runCompare () {
    const l = tryParse(leftContent)
    const r = tryParse(rightContent)
    if (!l.ok || !r.ok) {
      status('Both panels must contain valid JSON to compare')
      return
    }
    compareRows = deepDiff(l.value, r.value)
    if (!compareRows.length) {
      status('Documents are identical')
    }
  }

  /* ---------- status bar ---------- */

  let statusTimer

  function status (msg) {
    statusMsg = msg
    clearTimeout(statusTimer)
    statusTimer = setTimeout(() => {
      statusMsg = ''
    }, 4000)
  }

  $: leftText = contentToText(leftContent)
  $: leftBytes = new TextEncoder().encode(leftText).length
  $: leftValid = isValidJsonText(leftText)
  $: rightText = contentToText(rightContent)
  $: rightBytes = new TextEncoder().encode(rightText).length
  $: rightValid = isValidJsonText(rightText)
  $: leftParsed = leftValid ? tryParse(leftContent).value : null
  $: rightParsed = rightValid ? tryParse(rightContent).value : null

  /* ---------- keyboard shortcuts ---------- */

  function onKeyDown (e) {
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return
    const k = e.key.toLowerCase()
    if (k === 'o') {
      e.preventDefault()
      openInto('left')
    } else if (k === 's') {
      e.preventDefault()
      saveSide('left')
    } else if (k === 'd') {
      e.preventDefault()
      toggleDark()
    }
  }
</script>

<svelte:window on:keydown={onKeyDown} />

<div class="app-shell">
  <div class="toolbar">
    <span class="brand">JSON Editor</span>
    <button class="appbtn" title="Open file into the left panel (Ctrl+O)" on:click={() => openInto('left')}>Open</button>
    <button class="appbtn" title="Save left document (Ctrl+S)" on:click={() => saveSide('left')}>Save</button>
    <button class="appbtn" title="Copy left document to clipboard, formatted" on:click={() => copySide('left', true)}>Copy formatted</button>
    <button class="appbtn" title="Export left document as CSV" on:click={() => saveSide('left', true)}>Export CSV</button>
    <span class="toolbar-sep"></span>
    <button class="appbtn" title="Query and transform the left document" on:click={() => openTransform('left')}>Transform</button>
    <button class="appbtn" title="Validate left document against a JSON Schema" on:click={() => openSchema('left')}>Schema</button>
    <button class="appbtn" title="Run a curl command and load the response into a panel" on:click={openCurl}>Curl</button>
    <span class="toolbar-sep"></span>
    <button class="appbtn" title="Compare left and right documents" on:click={runCompare}>Compare</button>
    <span class="spacer"></span>
    <button class="appbtn" title="Star or fork the project on GitHub" on:click={openGitHub}>GitHub</button>
    <button class="appbtn" title="About this app" on:click={showAbout}>About</button>
    <button class="appbtn" title="Toggle dark mode (Ctrl+D)" on:click={toggleDark}>{darkMode ? 'Light mode' : 'Dark mode'}</button>
  </div>

  <div class="panels">
    <section
      class="panel editor-container"
      class:jse-theme-dark={darkMode}
      class:dark-editor={darkMode}
      bind:this={leftHolder}
      aria-label="Left editor"
      on:dragover={handleDragOver}
      on:drop={(e) => handleDrop('left', e)}
    >
      <div class="editor-holder">
        {#if leftMode === 'tree'}
          <PathNavigator json={leftParsed} label="Go to" on:navigate={(e) => navigateTo('left', e.detail.path)} />
        {/if}
        <JSONEditor
          bind:this={leftEditor}
          content={leftContent}
          mode={leftMode}
          mainMenuBar={true}
          navigationBar={true}
          statusBar={false}
          on:change={(e) => {
            leftContent = e.detail.content
            leftDirty = true
            compareRows = null
          }}
        />
      </div>
    </section>

    <div class="center-col" role="group" aria-label="Panel actions">
      <div class="center-group">
        <div class="center-label">Copy</div>
        <button class="center-btn" title="Copy left document to the right panel" on:click={copyFromLeftToRight}>&rsaquo;</button>
        <button class="center-btn" title="Copy right document to the left panel" on:click={copyFromRightToLeft}>&lsaquo;</button>
      </div>
      <div class="center-group">
        <div class="center-label">Transform</div>
        <button class="center-btn" title="Transform the left document" on:click={() => openTransform('left')}>&rsaquo;</button>
        <button class="center-btn" title="Transform the right document" on:click={() => openTransform('right')}>&lsaquo;</button>
      </div>
      <div class="center-group">
        <div class="center-label">Differences</div>
        <button class="center-btn wide" title="Compare left and right documents" on:click={runCompare}>Compare</button>
      </div>
    </div>

    <section
      class="panel editor-container"
      class:jse-theme-dark={darkMode}
      class:dark-editor={darkMode}
      bind:this={rightHolder}
      aria-label="Right editor"
      on:dragover={handleDragOver}
      on:drop={(e) => handleDrop('right', e)}
    >
      <div class="editor-holder">
        {#if rightMode === 'tree'}
          <PathNavigator json={rightParsed} label="Go to" on:navigate={(e) => navigateTo('right', e.detail.path)} />
        {/if}
        <JSONEditor
          bind:this={rightEditor}
          content={rightContent}
          mode={rightMode}
          mainMenuBar={true}
          navigationBar={true}
          statusBar={false}
          on:change={(e) => {
            rightContent = e.detail.content
            compareRows = null
          }}
        />
      </div>
    </section>
  </div>

  {#if compareRows}
    <div class="modal-backdrop" role="presentation" on:click={(e) => { if (e.target === e.currentTarget) compareRows = null }}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Differences">
        <h2>Differences ({compareRows.length})</h2>
        <div class="modal-body">
          {#if compareRows.length === 0}
            <p>The two documents are identical.</p>
          {:else}
            <table class="diff-table">
              <thead>
                <tr><th>Path</th><th>Change</th><th>Left</th><th>Right</th></tr>
              </thead>
              <tbody>
                {#each compareRows as row}
                  <tr>
                    <td class="diff-path">{row.path}</td>
                    <td><span class="diff-badge {row.type}">{row.type}</span></td>
                    <td class="diff-val">{row.left ?? ''}</td>
                    <td class="diff-val">{row.right ?? ''}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
        <div class="modal-actions">
          <button class="appbtn" on:click={copyDiff}>Copy</button>
          <button class="appbtn" on:click={() => { compareRows = null }}>Close</button>
        </div>
      </div>
    </div>
  {/if}

  {#if modal?.kind === 'about'}
    <div class="modal-backdrop" role="presentation" on:click={(e) => { if (e.target === e.currentTarget) modal = null }}>
      <div class="modal about-modal" role="dialog" aria-modal="true" aria-label="About JSON Editor">
        <div class="about-logo">{`{ }`}</div>
        <h2>JSON Editor</h2>
        <p class="about-version">Version {appVersion}</p>
        <div class="modal-body">
          <p>A free, offline desktop app for viewing, editing, formatting, querying and comparing JSON.</p>
          <p class="about-muted">
            Open source under the MIT license. Editor powered by
            <strong>svelte-jsoneditor</strong> by Jos de Jong (Apache-2.0).
            This app is not affiliated with jsoneditoronline.org.
          </p>
        </div>
        <div class="modal-actions">
          <button class="appbtn primary" on:click={openGitHub}>GitHub Project</button>
          <button class="appbtn" on:click={() => { modal = null }}>Close</button>
        </div>
      </div>
    </div>
  {:else if modal?.kind === 'curl'}
    <CurlModal target={modal.target} on:close={() => { modal = null }} on:apply={onCurlApply} />
  {:else if modal}
    <Modal
      mode={modal.kind}
      leftText={modal.target === 'right' ? rightText : leftText}
      schemaJson={modal.target === 'right' ? rightSchema : leftSchema}
      on:close={() => { modal = null }}
      on:apply={onModalApply}
      on:applySchema={onModalApplySchema}
    />
  {/if}

  <div class="statusbar">
    <span class="status-item" class:ok={leftValid} class:bad={!leftValid}>
      Left: {leftValid ? 'valid' : 'invalid'} | {formatBytes(leftBytes)}
    </span>
    <span class="status-item" class:ok={rightValid} class:bad={!rightValid}>
      Right: {rightValid ? 'valid' : 'invalid'} | {formatBytes(rightBytes)}
    </span>
    {#if leftSchema}
      <span class="status-item">Schema: active</span>
    {/if}
    {#if schemaErrors.length}
      <span class="status-item bad" title={schemaErrors.join('\n')}>
        Schema: {schemaErrors.length} error{schemaErrors.length > 1 ? 's' : ''}
      </span>
    {/if}
    <span class="spacer"></span>
    <span class="status-item">{statusMsg}</span>
  </div>
</div>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--je-topbar-bg);
    border-bottom: 1px solid var(--je-topbar-border);
    flex: 0 0 auto;
    flex-wrap: wrap;
  }

  .brand {
    font-weight: 700;
    margin-right: 8px;
  }

  .toolbar-sep {
    width: 1px;
    height: 20px;
    background: var(--je-divider);
    margin: 0 4px;
  }

  .spacer {
    flex: 1;
  }

  .panels {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  /* center column between panels (jsoneditoronline-style) */
  .center-col {
    flex: 0 0 76px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 18px;
    padding: 14px 6px;
    border-left: 1px solid var(--je-divider);
    border-right: 1px solid var(--je-divider);
    background: var(--je-topbar-bg);
  }

  .center-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .center-label {
    font-size: 11px;
    color: var(--je-text-muted);
    margin-bottom: 2px;
  }

  .center-btn {
    width: 30px;
    height: 30px;
    border: 1px solid var(--je-btn-border);
    background: var(--je-btn-bg);
    color: var(--je-text);
    border-radius: 6px;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }

  .center-btn:hover {
    background: var(--je-btn-hover);
  }

  .center-btn.wide {
    width: auto;
    padding: 0 10px;
    font-size: 12px;
  }

  :global(html.dark-mode) .center-col {
    border-color: var(--je-divider);
  }

  .panel {
    flex: 1 1 0%;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--je-divider);
    background: var(--je-panel-bg);
  }

  .panel:last-child {
    border-right: none;
  }








  .appbtn.small {
    padding: 3px 8px;
    font-size: 12px;
  }

  .editor-holder {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .editor-holder :global(.jse-main) {
    flex: 1;
    min-height: 0;
  }

  .diff-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 12px;
  }

  .diff-table th,
  .diff-table td {
    text-align: left;
    padding: 5px 8px;
    border-bottom: 1px solid var(--je-divider);
    vertical-align: top;
  }

  .diff-path {
    font-family: ui-monospace, Menlo, Consolas, monospace;
    white-space: nowrap;
  }

  .diff-val {
    font-family: ui-monospace, Menlo, Consolas, monospace;
    word-break: break-all;
    max-width: 260px;
  }

  .diff-badge {
    font-size: 11px;
    border-radius: 4px;
    padding: 1px 6px;
    white-space: nowrap;
  }

  .diff-badge.added {
    background: #dcf5e0;
    color: #116329;
  }

  .diff-badge.removed {
    background: #ffe1e1;
    color: #a40e26;
  }

  .diff-badge.changed {
    background: #fff2d9;
    color: #7a4100;
  }

  :global(html.dark-mode) .diff-badge.added {
    background: #12351c;
    color: #7ee2a0;
  }

  :global(html.dark-mode) .diff-badge.removed {
    background: #43111a;
    color: #ff9aa5;
  }

  :global(html.dark-mode) .diff-badge.changed {
    background: #3d2e00;
    color: #ffd479;
  }

  .statusbar .status-item.ok {
    color: #1a7f37;
  }

  .statusbar .status-item.bad {
    color: #cf222e;
  }

  :global(html.dark-mode) .statusbar .status-item.ok {
    color: #7ee2a0;
  }

  /* ---- dark mode for the editors themselves ---- */
  /* jse-theme-dark class on the panel toggles all --jse-* variables (theme css
     is imported in main.js). Class must be on an ancestor of the editor. */
  :global(html.dark-mode) .editor-container {
    background: #1e1e1e;
  }

  /* ---- about modal ---- */
  .about-modal {
    max-width: 420px;
  }

  .about-modal :global(.modal-body) {
    text-align: left;
  }

  .about-logo {
    width: 64px;
    height: 64px;
    margin: 8px auto 4px;
    border-radius: 14px;
    background: var(--je-accent);
    color: #fff;
    font-size: 22px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: ui-monospace, Menlo, Consolas, monospace;
  }

  .about-version {
    margin: 2px 0 10px;
    color: var(--je-text-muted);
    font-size: 12px;
  }

  .about-muted {
    color: var(--je-text-muted);
    font-size: 12px;
    line-height: 1.5;
    margin-top: 8px;
  }

  .appbtn.primary {
    background: var(--je-accent);
    border-color: var(--je-accent);
    color: #fff;
  }

  .appbtn.primary:hover {
    filter: brightness(1.08);
  }

  :global(html.dark-mode) .statusbar .status-item.bad {
    color: #ff9aa5;
  }
</style>
