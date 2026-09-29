<script>
  import { createEventDispatcher } from 'svelte'

  // Props: the parsed JSON document, and a label to show
  export let json = null
  export let label = 'Go to'

  const dispatch = createEventDispatcher()

  // Chosen path as a list of segments: [{type:'key'|'index', value}]
  let segments = []
  let jsonText = ''

  $: jsonText = json === undefined ? 'null' : JSON.stringify(json)

  // Reset when the document changes structurally
  $: if (jsonText !== undefined) {
    pruneSegments(json)
  }

  function pruneSegments (doc) {
    // walk segments; drop trailing ones that no longer resolve
    let node = doc
    let i = 0
    while (i < segments.length) {
      const seg = segments[i]
      if (node === null || typeof node !== 'object') break
      if (seg.type === 'index') {
        if (!Array.isArray(node) || seg.value >= node.length) break
        node = node[seg.value]
      } else {
        if (!(seg.value in node)) break
        node = node[seg.value]
      }
      i++
    }
    if (i < segments.length) segments = segments.slice(0, i)
  }

  $: current = resolve(json, segments)
  $: options = getOptions(current)
  $: pathString = segmentsToPath(segments)

  function resolve (doc, segs) {
    let node = doc
    for (const seg of segs) {
      if (node === null || typeof node !== 'object') return node
      node = seg.type === 'index' ? node?.[seg.value] : node?.[seg.value]
    }
    return node
  }

  function getOptions (node) {
    if (node === null || node === undefined) return []
    if (Array.isArray(node)) {
      return node.map((_, i) => ({
        value: String(i),
        label: String(i),
        preview: previewOf(node[i])
      }))
    }
    if (typeof node === 'object') {
      return Object.keys(node).map((k) => ({
        value: k,
        label: k,
        preview: previewOf(node[k])
      }))
    }
    return []
  }

  function previewOf (v) {
    if (v === null) return 'null'
    if (Array.isArray(v)) return `[${v.length}]`
    if (typeof v === 'object') return `{${Object.keys(v).length}}`
    if (typeof v === 'string') return v.length > 40 ? `"${v.slice(0, 37)}..."` : `"${v}"`
    return String(v)
  }

  function segmentsToPath (segs) {
    if (!segs.length) return '(root)'
    return segs
      .map((s, i) => (s.type === 'index' ? `[${s.value}]` : i === 0 ? s.value : `.${s.value}`))
      .join('')
  }

  function onPick (e) {
    const value = e.target.value
    if (value === '') return
    const isNumericKey = current !== null && Array.isArray(current)
    segments = [...segments, { type: isNumericKey ? 'index' : 'key', value: isNumericKey ? Number(value) : value }]
  }

  function goBack () {
    segments = segments.slice(0, -1)
  }

  function reset () {
    segments = []
  }

  function go () {
    if (!segments.length) return
    dispatch('navigate', { path: segments.map((s) => String(s.value)) })
  }
</script>

<div class="pathnav" role="group" aria-label="Path navigator">
  <span class="nav-label">{label}</span>
  {#if segments.length}
    <button class="appbtn small" title="Up one level" on:click={goBack}>&#8592;</button>
  {/if}
  {#if options.length}
    <select class="nav-select" on:change={onPick} value="">
      <option value="" disabled selected>{segments.length ? '...' : 'choose'}</option>
      {#each options as o}
        <option value={o.value}>{o.label} : {o.preview}</option>
      {/each}
    </select>
  {:else if segments.length}
    <span class="leaf">{previewOf(current)}</span>
  {/if}
  {#if segments.length}
    <button class="appbtn small primary" title="Scroll the editor to this path" on:click={go}>Go</button>
    <button class="appbtn small" title="Reset" on:click={reset}>&#10005;</button>
    <code class="path-string">{pathString}</code>
  {/if}
</div>

<style>
  .pathnav {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    flex-wrap: wrap;
    font-size: 12px;
  }

  .nav-label {
    font-weight: 600;
    color: var(--je-text-muted);
  }

  .nav-select {
    background: var(--je-btn-bg);
    color: var(--je-text);
    border: 1px solid var(--je-btn-border);
    border-radius: 6px;
    padding: 3px 6px;
    font-size: 12px;
    max-width: 260px;
  }

  .leaf {
    color: var(--je-text-muted);
    font-family: ui-monospace, Menlo, Consolas, monospace;
  }

  .path-string {
    color: var(--je-text-muted);
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 11px;
  }

  .appbtn.primary {
    border-color: var(--je-accent);
    color: var(--je-accent);
  }
</style>
