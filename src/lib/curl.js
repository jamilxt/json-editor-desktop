// Parse a curl command into { url, options } and execute it over fetch.
// Pure renderer-side: supports the flags people actually paste for JSON APIs.

/**
 * Tokenize a shell-style command line, respecting single quotes, double quotes,
 * backslash escapes, and $'...' ANSI-C quoting (common in copied curl commands).
 */
export function tokenize (input) {
  const tokens = []
  let cur = ''
  let hasCur = false
  let i = 0

  const push = () => {
    if (hasCur) tokens.push(cur)
    cur = ''
    hasCur = false
  }

  while (i < input.length) {
    const c = input[i]

    // backslash escape (outside quotes)
    if (c === '\\') {
      if (i + 1 < input.length) {
        cur += input[i + 1]
        hasCur = true
        i += 2
        continue
      }
      i++
      continue
    }

    // single-quoted string
    if (c === "'") {
      i++
      while (i < input.length && input[i] !== "'") {
        cur += input[i]
        i++
      }
      i++ // closing quote
      hasCur = true
      continue
    }

    // double-quoted string (handles \" escapes)
    if (c === '"') {
      i++
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && (input[i + 1] === '"' || input[i + 1] === '\\' || input[i + 1] === '$' || input[i + 1] === '`')) {
          cur += input[i + 1]
          i += 2
          continue
        }
        cur += input[i]
        i++
      }
      i++ // closing quote
      hasCur = true
      continue
    }

    // ANSI-C quoting: $'...'
    if (c === '$' && input[i + 1] === "'") {
      i += 2
      while (i < input.length && input[i] !== "'") {
        if (input[i] === '\\') {
          const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'" }
          cur += map[input[i + 1]] ?? input[i + 1]
          i += 2
          continue
        }
        cur += input[i]
        i++
      }
      i++
      hasCur = true
      continue
    }

    // whitespace
    if (/\s/.test(c)) {
      push()
      i++
      continue
    }

    cur += c
    hasCur = true
    i++
  }
  push()
  return tokens
}

/**
 * Parse tokens after 'curl' into a request descriptor.
 */
export function parseCurl (command) {
  const trimmed = String(command || '').trim()
  if (!trimmed) throw new Error('Empty command')
  const tokens = tokenize(trimmed)

  // allow a leading shell prompt or line continuations already joined
  let idx = tokens.findIndex((t) => t === 'curl')
  if (idx === -1) {
    // tolerate "curl.exe", "/usr/bin/curl", "./curl"
    idx = tokens.findIndex((t) => /(^|\/)curl(\.exe)?$/.test(t))
  }
  if (idx === -1) throw new Error('Not a curl command: it must start with "curl"')

  const req = {
    method: null,
    url: null,
    headers: [],
    body: null,
    insecure: false,
    followRedirects: true,
    auth: null // { user, pass }
  }

  const rest = tokens.slice(idx + 1)
  let i = 0
  while (i < rest.length) {
    let t = rest[i]

    if (t === '\\') { i++; continue } // safety, tokenizer normally eats these

    // -X/--request METHOD
    if (t === '-X' || t === '--request') {
      req.method = (rest[++i] || '').toUpperCase()
      i++
      continue
    }
    // -H/--header "K: V"
    if (t === '-H' || t === '--header') {
      const h = rest[++i]
      if (h) {
        const sep = h.indexOf(':')
        if (sep > 0) {
          req.headers.push({ name: h.slice(0, sep).trim(), value: h.slice(sep + 1).trim() })
        } else if (h.trim()) {
          // bare "Header;" (e.g. "Accept;" removes the header) - record as removal
          req.headers.push({ name: h.replace(/;$/, '').trim(), value: null })
        }
      }
      i++
      continue
    }
    // -d/--data/--data-raw/--data-ascii/--data-binary "body"
    if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-ascii' || t === '--data-binary' || t === '--data-urlencode') {
      const b = rest[++i]
      if (b !== undefined) req.body = b
      if (!req.method) req.method = 'POST'
      i++
      continue
    }
    // --json "body" (curl 7.82+): sets POST + content-type + accept
    if (t === '--json') {
      const b = rest[++i]
      if (b !== undefined) req.body = b
      req.headers.push({ name: 'Content-Type', value: 'application/json' })
      req.headers.push({ name: 'Accept', value: 'application/json' })
      if (!req.method) req.method = 'POST'
      i++
      continue
    }
    // -F/--form
    if (t === '-F' || t === '--form') {
      const f = rest[++i]
      if (f !== undefined) {
        req.form = req.form || []
        req.form.push(f)
      }
      if (!req.method) req.method = 'POST'
      i++
      continue
    }
    // -u/--user user:pass
    if (t === '-u' || t === '--user') {
      const a = rest[++i] || ''
      const sep = a.indexOf(':')
      req.auth = { user: sep === -1 ? a : a.slice(0, sep), pass: sep === -1 ? '' : a.slice(sep + 1) }
      i++
      continue
    }
    // -L/--location
    if (t === '-L' || t === '--location') {
      req.followRedirects = true
      i++
      continue
    }
    // -k/--insecure
    if (t === '-k' || t === '--insecure') {
      req.insecure = true
      i++
      continue
    }
    // compressed, silent, verbose, show-error, progress etc: ignore quietly
    if (
      t === '--compressed' || t === '-s' || t === '--silent' || t === '-v' || t === '--verbose' ||
      t === '-S' || t === '--show-error' || t === '-#' || t === '--progress-bar' ||
      t === '-i' || t === '--include' || t === '-4' || t === '-6' || t === '--http1.1' ||
      t === '--http2' || t === '--no-buffer' || t === '-N'
    ) {
      i++
      continue
    }
    // flags with a value we must skip: -o/--output, -A/--user-agent, -e/--referer, --retry, --max-time, --connect-timeout
    if (['-o', '--output', '-A', '--user-agent', '-e', '--referer', '--retry', '--max-time', '--connect-timeout', '--max-filesize'].includes(t)) {
      i += 2
      continue
    }
    // unknown flag: skip it (and its value if the next token doesn't start with '-')
    if (t.startsWith('-')) {
      i++
      if (rest[i] !== undefined && !rest[i].startsWith('-')) i++
      continue
    }
    // positional URL
    if (!req.url) {
      req.url = t
    }
    i++
  }

  if (!req.url) throw new Error('No URL found in the curl command')
  if (!/^https?:\/\//i.test(req.url)) {
    // tolerate scheme-less URLs copied from examples
    req.url = 'https://' + req.url.replace(/^\/+/, '')
  }
  if (!req.method) req.method = 'GET'

  return req
}

/**
 * Execute a parsed request over fetch. Enforces http(s) only.
 * Returns { status, statusText, headers, bodyText, durationMs, sizeBytes }.
 */
export async function executeRequest (req, { timeoutMs = 30000 } = {}) {
  if (!/^https?:\/\//i.test(req.url)) {
    throw new Error('Only http and https URLs are supported (offline app, no other schemes)')
  }

  const headers = {}
  for (const h of req.headers || []) {
    if (h.value === null) continue
    headers[h.name] = h.value
  }

  if (req.auth) {
    headers.Authorization = 'Basic ' + btoa(`${req.auth.user}:${req.auth.pass}`)
  }

  const init = {
    method: req.method,
    headers,
    redirect: req.followRedirects ? 'follow' : 'manual'
  }

  if (req.body !== null && req.body !== undefined && !['GET', 'HEAD'].includes(req.method)) {
    init.body = req.body
  } else if (req.form && req.form.length && !['GET', 'HEAD'].includes(req.method)) {
    const fd = new FormData()
    for (const f of req.form) {
      const eq = f.indexOf('=')
      const name = eq === -1 ? f : f.slice(0, eq)
      let value = eq === -1 ? '' : f.slice(eq + 1)
      // file uploads (@path) are not supported offline: send the literal text
      if (value.startsWith('@')) value = value.slice(1)
      fd.append(name, value)
    }
    init.body = fd
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  init.signal = controller.signal

  const started = performance.now()
  try {
    const res = await fetch(req.url, init)
    const bodyText = await res.text()
    const durationMs = Math.round(performance.now() - started)
    const responseHeaders = {}
    res.headers.forEach((v, k) => { responseHeaders[k] = v })

    return {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
      bodyText,
      durationMs,
      sizeBytes: new TextEncoder().encode(bodyText).length
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs} ms`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}
