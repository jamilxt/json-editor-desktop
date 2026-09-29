export function formatBytes (n) {
  if (n === 0) return '0 B'
  if (!n && n !== 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return (i === 0 ? v : v.toFixed(1)) + ' ' + units[i]
}

export function isValidJsonText (text) {
  try {
    JSON.parse(text)
    return true
  } catch (e) {
    return false
  }
}

export function contentToText (content) {
  if (!content) return ''
  if ('json' in content) {
    try {
      return JSON.stringify(content.json, null, 2)
    } catch (e) {
      return ''
    }
  }
  return content.text || ''
}
