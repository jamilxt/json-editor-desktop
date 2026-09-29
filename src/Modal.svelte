<script>
  import { createEventDispatcher, onMount } from 'svelte'
  import { JSONEditor } from 'svelte-jsoneditor'
  import { jsonrepair } from 'jsonrepair'
  import { transformers } from './lib/transform.js'

  export let mode = 'transform' // 'transform' | 'schema'
  export let leftText = ''
  export let schemaJson = null

  const dispatch = createEventDispatcher()

  let lang = 'javascript'
  let query = ''
  let resultJson = null
  let resultText = ''
  let error = ''
  let editor
  let modalEl
  let schemaText = ''

  $: if (mode === 'schema') {
    schemaText = schemaJson ? JSON.stringify(schemaJson, null, 2) : ''
  }

  onMount(() => {
    if (modalEl) modalEl.focus()
  })

  async function runQuery () {
    error = ''
    resultJson = null
    resultText = ''
    try {
      resultJson = await transformers[lang](leftText, query)
      resultText = JSON.stringify(resultJson, null, 2)
    } catch (e) {
      error = e.message || String(e)
    }
  }

  async function apply () {
    if (resultJson === null && !error) await runQuery()
    if (error) return
    dispatch('apply', { json: resultJson })
    dispatch('close')
  }

  function saveSchema () {
    let schema = null
    try {
      schema = schemaText.trim() ? JSON.parse(jsonrepair(schemaText)) : null
    } catch (e) {
      error = 'Invalid schema JSON: ' + e.message
      return
    }
    error = ''
    dispatch('applySchema', { schema })
    dispatch('close')
  }

  function clearSchema () {
    schemaText = ''
    error = ''
    dispatch('applySchema', { schema: null })
    dispatch('close')
  }

  function onKeyDown (e) {
    if (e.key === 'Escape') dispatch('close')
  }
</script>

<div class="modal-backdrop" role="presentation" on:click={(e) => { if (e.target === e.currentTarget) dispatch('close') }}>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    bind:this={modalEl}
    on:keydown={onKeyDown}
  >
    {#if mode === 'transform'}
      <h2>Transform</h2>
      <div class="modal-body">
        <div class="formrow">
          <label for="tlang">Query language</label>
          <select id="tlang" bind:value={lang} on:change={() => { resultJson = null; resultText = '' }}>
            <option value="javascript">JavaScript</option>
            <option value="jmespath">JMESPath</option>
            <option value="lodash">lodash</option>
            <option value="jq">jq</option>
          </select>
        </div>
        <div class="formrow">
          <label for="tquery">Query</label>
          <input
            id="tquery"
            type="text"
            bind:value={query}
            placeholder={lang === 'javascript'
              ? 'getProperties().filter(...)'
              : lang === 'jmespath'
                ? 'users[?age > 18].name'
                : lang === 'lodash'
                  ? '_.map(users, "name")'
                  : '.users[].name'}
            on:keydown={(e) => { if (e.key === 'Enter') runQuery() }}
          />
        </div>
        {#if error}
          <p class="error">{error}</p>
        {/if}
        {#if resultText}
          <div class="preview">{resultText.length > 20000 ? resultText.slice(0, 20000) + '\n...' : resultText}</div>
        {/if}
      </div>
      <div class="modal-actions">
        <button class="appbtn" on:click={() => dispatch('close')}>Cancel</button>
        <button class="appbtn" on:click={runQuery}>Preview</button>
        <button class="appbtn" on:click={apply}>Apply</button>
      </div>
    {:else}
      <h2>JSON Schema</h2>
      <div class="modal-body">
        <p class="hint">
          Paste a JSON Schema here to validate the document against it. Validation errors are
          shown in the status bar and highlighted in the editor.
        </p>
        <textarea rows="12" bind:value={schemaText} placeholder={'{ "type": "object", ... }'}></textarea>
        {#if error}
          <p class="error">{error}</p>
        {/if}
      </div>
      <div class="modal-actions">
        {#if schemaJson}
          <button class="appbtn" on:click={clearSchema}>Remove schema</button>
        {/if}
        <button class="appbtn" on:click={() => dispatch('close')}>Cancel</button>
        <button class="appbtn" on:click={saveSchema}>Save</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .formrow {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .formrow label {
    min-width: 110px;
  }
  .error {
    color: #d13b3b;
    font-size: 13px;
    margin: 8px 0;
    white-space: pre-wrap;
  }
  .hint {
    font-size: 13px;
    color: var(--je-text-muted);
    margin-top: 0;
  }
</style>
