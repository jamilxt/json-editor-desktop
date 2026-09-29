// Minimal RFC-4180-style CSV parser and serializer.

export function detectDelimiter (text) {
  const line = text.split(/\r?\n/).find((l) => l.trim() !== '') || ''
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = 0
  for (const d of candidates) {
    const count = line.split(d).length - 1
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

export function parseCsv (text, delimiter = ',') {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === delimiter) {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += c
    i++
  }
  row.push(field)
  rows.push(row)

  // drop trailing fully-empty rows
  while (rows.length && rows[rows.length - 1].every((f) => f === '')) rows.pop()
  return rows
}

export function rowsToObjects (rows) {
  if (!rows.length) return []
  const header = rows[0]
  return rows.slice(1).map((r) => {
    const obj = {}
    header.forEach((h, idx) => {
      obj[h === '' ? `column_${idx + 1}` : h] = coerce(r[idx] ?? '')
    })
    return obj
  })
}

function coerce (s) {
  if (s === '') return ''
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null') return null
  if (s !== '' && !isNaN(Number(s))) return Number(s)
  return s
}

// Flatten nested objects with dot-notation keys; arrays become JSON strings.
export function flattenRow (obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flattenRow(v, key, out)
    } else if (Array.isArray(v)) {
      out[key] = JSON.stringify(v)
    } else {
      out[key] = v
    }
  }
  return out
}

export function jsonToCsv (json, delimiter = ',') {
  let items
  if (Array.isArray(json)) {
    items = json
  } else if (json !== null && typeof json === 'object') {
    items = [json]
  } else {
    items = [{ value: json }]
  }

  const flat = items.map((it) =>
    it !== null && typeof it === 'object' && !Array.isArray(it) ? flattenRow(it) : { value: it }
  )

  // union of columns, preserving first-seen order
  const cols = []
  const seen = new Set()
  for (const row of flat) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k)
        cols.push(k)
      }
    }
  }

  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    if (s.includes(delimiter) || s.includes('"') || /[\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }

  const lines = [cols.map(escape).join(delimiter)]
  for (const row of flat) {
    lines.push(cols.map((c) => escape(row[c])).join(delimiter))
  }
  return lines.join('\n')
}
