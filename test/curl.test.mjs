import { tokenize, parseCurl } from '../src/lib/curl.js'
import assert from 'assert'

// tokenizer: single quotes, double quotes with escapes, $'...'
assert.deepStrictEqual(
  tokenize(`curl -H 'Accept: application/json' -d '{"a": 1}' https://x.y`),
  ['curl', '-H', 'Accept: application/json', '-d', '{"a": 1}', 'https://x.y']
)
assert.deepStrictEqual(tokenize("$'line1\\nline2' x"), ['line1\nline2', 'x'])
assert.deepStrictEqual(tokenize('curl "a \\"b\\"" x'), ['curl', 'a "b"', 'x'])

// full-featured POST
const p1 = parseCurl(String.raw`curl -X POST 'https://api.example.com/users' -H 'Content-Type: application/json' -H 'Authorization: Bearer tok123' -d '{"name":"jamil"}' -s --compressed`)
assert.strictEqual(p1.method, 'POST')
assert.strictEqual(p1.url, 'https://api.example.com/users')
assert.deepStrictEqual(p1.headers, [
  { name: 'Content-Type', value: 'application/json' },
  { name: 'Authorization', value: 'Bearer tok123' }
])
assert.strictEqual(p1.body, '{"name":"jamil"}')

// --data-raw implies POST, scheme-less URL gets https
const p2 = parseCurl("curl api.github.com/users/josdejong --data-raw '{}'")
assert.strictEqual(p2.method, 'POST')
assert.strictEqual(p2.url, 'https://api.github.com/users/josdejong')

// --json flag
const p3 = parseCurl('curl --json "{"q":1}" https://a.b/c')
assert.strictEqual(p3.method, 'POST')
assert.ok(p3.headers.some((h) => h.name === 'Content-Type' && h.value === 'application/json'))

// plain GET
const p4 = parseCurl('curl https://httpbin.org/get')
assert.strictEqual(p4.method, 'GET')
assert.strictEqual(p4.body, null)

// basic auth + -L -k + ignored -o flag with value
const p5 = parseCurl('curl -u user:secret -L -k https://a.b/x -o /tmp/out.json')
assert.deepStrictEqual(p5.auth, { user: 'user', pass: 'secret' })
assert.strictEqual(p5.url, 'https://a.b/x')
assert.strictEqual(p5.followRedirects, true)

// multiline command with backslashes already joined by the caller
const p6 = parseCurl("curl -X PUT 'https://a.b/1' -d 'x=1'")
assert.strictEqual(p6.method, 'PUT')

// errors
assert.throws(() => parseCurl('wget https://a.b'), /must start with "curl"/)
assert.throws(() => parseCurl('curl -X GET'), /No URL found/)

console.log('All curl parser tests passed')
