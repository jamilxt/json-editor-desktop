// Deep diff between two JSON values.
// Returns a list of differences: { path: string, type: 'added'|'removed'|'changed', left, right }

function pathToString (path) {
  return path.length ? path.join('.') : '(root)'
}

function short (v) {
  if (v === undefined) return undefined
  try {
    const s = JSON.stringify(v)
    return s !== undefined && s.length > 120 ? s.slice(0, 117) + '...' : s
  } catch (e) {
    return String(v)
  }
}

export function deepDiff (a, b, path = [], out = []) {
  const aType = typeOf(a)
  const bType = typeOf(b)

  if (aType === 'missing' && bType === 'missing') return out

  if (aType === 'missing') {
    out.push({ path: pathToString(path), type: 'added', left: undefined, right: short(b) })
    return out
  }
  if (bType === 'missing') {
    out.push({ path: pathToString(path), type: 'removed', left: short(a), right: undefined })
    return out
  }
  if (aType !== bType) {
    out.push({ path: pathToString(path), type: 'changed', left: short(a), right: short(b) })
    return out
  }

  if (aType === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      deepDiff(a[k], b[k], [...path, k], out)
    }
    return out
  }

  if (aType === 'array') {
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i++) {
      deepDiff(a[i], b[i], [...path, `[${i}]`], out)
    }
    return out
  }

  if (a !== b) {
    out.push({ path: pathToString(path), type: 'changed', left: short(a), right: short(b) })
  }
  return out
}

function typeOf (v) {
  if (v === undefined) return 'missing'
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'object') return 'object'
  return 'value'
}
