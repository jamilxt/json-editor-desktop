<script>
  import { createEventDispatcher, onMount } from 'svelte'
  import { parseCurl, executeRequest } from './lib/curl.js'

  export let target = 'left' // default panel for the response

  const dispatch = createEventDispatcher()

  let command = ''
  let running = false
  let error = ''
  let result = null // { status, statusText, headers, bodyText, durationMs, sizeBytes }
  let parsed = null // pretty-printed JSON if the response is JSON
  let targetSide = target
  let modalEl
  let textareaEl

  onMount(() => {
    textareaEl?.focus()
  })

  async function run () {
    error = ''
    result = null
    parsed = null
    running = true
    try {
      const req = parseCurl(command)
      const res = await executeRequest(req)
      result = res
      const ct = (res.headers['content-type'] || '')
      if (ct.includes('json') || /^[\s\r\n]*[[{]/.test(res.bodyText)) {
        try {
          parsed = JSON.stringify(JSON.parse(res.bodyText), null, 2)
        } catch (e) {
          parsed = null
        }
      }
    } catch (e) {
      error = e.message || String(e)
    } finally {
      running = false
    }
  }

  function place (side) {
    if (!result) {
      error = 'Run the request first'
      return
    }
    let content
    if (parsed !== null) {
      content = { json: JSON.parse(parsed) }
    } else {
      content = { text: result.bodyText }
    }
    dispatch('apply', { content, side: targetSide })
    dispatch('close')
  }

  function onKeyDown (e) {
    if (e.key === 'Escape') dispatch('close')
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      run()
    }
  }
</script>

<div class="modal-backdrop" role="presentation" on:click={(e) => { if (e.target === e.currentTarget) dispatch('close') }}>
  <div class="modal wide" role="dialog" aria-modal="true" bind:this={modalEl} on:keydown={onKeyDown}>
    <h2>Execute curl command</h2>
    <div class="modal-body">
      <textarea
        rows="5"
        bind:this={textareaEl}
        bind:value={command}
        placeholder={'curl -X POST "https://api.example.com/users" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"name": "jamil"}\''}
        spellcheck="false"
      ></textarea>
      <div class="run-row">
        <label for="curl-target">Response goes to</label>
        <select id="curl-target" bind:value={targetSide}>
          <option value="left">Left panel</option>
          <option value="right">Right panel</option>
        </select>
        <span class="spacer"></span>
        <span class="hint">Ctrl+Enter to run</span>
        <button class="appbtn" disabled={running || !command.trim()} on:click={run}>
          {running ? 'Running...' : 'Run'}
        </button>
      </div>
      {#if error}
        <p class="error">{error}</p>
      {/if}
      {#if result}
        <div class="meta">
          <span class="status-pill {'s' + Math.floor(result.status / 100)}">{result.status} {result.statusText}</span>
          <span>{result.durationMs} ms</span>
          <span>{result.sizeBytes} B</span>
          {#if parsed !== null}
            <span class="json-badge">JSON</span>
          {/if}
        </div>
        <div class="preview">{parsed ?? (result.bodyText.length > 20000 ? result.bodyText.slice(0, 20000) + '\n...' : result.bodyText)}</div>
      {/if}
    </div>
    <div class="modal-actions">
      <button class="appbtn" on:click={() => dispatch('close')}>Cancel</button>
      <button class="appbtn" disabled={!result} on:click={() => place('left')}>Place in {targetSide} panel</button>
    </div>
  </div>
</div>

<style>
  .modal.wide {
    min-width: 640px;
    max-width: 90vw;
  }

  textarea {
    resize: vertical;
  }

  .run-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 0;
  }

  .run-row label {
    font-size: 13px;
  }

  .run-row select {
    background: var(--je-bg);
    color: var(--je-text);
    border: 1px solid var(--je-btn-border);
    border-radius: 6px;
    padding: 5px 8px;
  }

  .spacer {
    flex: 1;
  }

  .hint {
    font-size: 12px;
    color: var(--je-text-muted);
  }

  .error {
    color: #d13b3b;
    font-size: 13px;
    margin: 8px 0;
    white-space: pre-wrap;
  }

  .meta {
    display: flex;
    gap: 14px;
    align-items: center;
    font-size: 12px;
    color: var(--je-text-muted);
    margin-bottom: 6px;
  }

  .status-pill {
    border-radius: 10px;
    padding: 1px 8px;
    font-weight: 600;
  }

  .status-pill.s2 {
    background: #dcf5e0;
    color: #116329;
  }

  .status-pill.s3 {
    background: #ddf1fc;
    color: #0550ae;
  }

  .status-pill.s4,
  .status-pill.s5 {
    background: #ffe1e1;
    color: #a40e26;
  }

  :global(html.dark-mode) .status-pill.s2 {
    background: #12351c;
    color: #7ee2a0;
  }

  :global(html.dark-mode) .status-pill.s3 {
    background: #0c2d45;
    color: #79c0ff;
  }

  :global(html.dark-mode) .status-pill.s4,
  :global(html.dark-mode) .status-pill.s5 {
    background: #43111a;
    color: #ff9aa5;
  }

  .json-badge {
    border: 1px solid var(--je-btn-border);
    border-radius: 4px;
    padding: 0 6px;
    font-weight: 600;
  }
</style>
