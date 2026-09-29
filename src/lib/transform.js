import jmespath from 'jmespath'
import _ from 'lodash-es'
import { jsonrepair } from 'jsonrepair'

function parse (text) {
  return JSON.parse(jsonrepair(text))
}

function parseOrThrow (text) {
  try {
    return JSON.parse(text)
  } catch (e) {
    // try repair, but surface original error if repair fails too
    try {
      return JSON.parse(jsonrepair(text))
    } catch (e2) {
      throw new Error('Document is not valid JSON: ' + e.message)
    }
  }
}

/* ---------------- JavaScript expressions ---------------- */

const BANNED = [/\bwhile\b/, /\bfor\s*\(/, /\bdo\s*\{/, /=>\s*\{/, /\bfunction\b/, /\brequire\b/, /\bprocess\b/, /\bglobalThis\b/, /\bwindow\b/, /\bdocument\b/, /\bfetch\b/, /\bXMLHttpRequest\b/, /\beval\b/, /\bFunction\s*\(/]

function evalJavaScript (text, expr) {
  if (!expr.trim()) return parseOrThrow(text)
  for (const re of BANNED) {
    if (re.test(expr)) {
      throw new Error('Blocked keyword in query: ' + re.source)
    }
  }
  const data = parseOrThrow(text)
  // NOTE: new Function() with the user-entered expression is deliberate here, mirroring
  // jsoneditoronline.org's Transform modal: the expression author IS the local user of
  // this offline desktop app (no remote/untrusted input reaches this code path).
  // A blocklist still guards against accidentally destructive constructs.
  const body = `"use strict"; return (${expr});`
  // eslint-disable-next-line no-new-func
  const fn = new Function('json', '_', 'get', 'map', 'filter', 'keys', 'values', 'size', 'sort', 'pick', 'groupBy', 'uniq', 'sum', 'flatten', 'round', 'pow', 'min', 'max', 'abs', 'reduce', 'includes', 'mapObject', 'mapValues', 'range', 'reverse', 'first', 'last', body)
  return fn(
    data,
    _,
    _.get,
    _.map,
    _.filter,
    _.keys,
    _.values,
    _.size,
    _.sortBy,
    _.pick,
    _.groupBy,
    _.uniq,
    _.sum,
    _.flatten,
    (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d,
    Math.pow,
    Math.min,
    Math.max,
    Math.abs,
    _.reduce,
    _.includes,
    _.mapObject,
    _.mapValues,
    _.range,
    _.reverse,
    _.first,
    _.last
  )
}

/* ---------------- lodash (expression on _ and json) ---------------- */

function evalLodash (text, expr) {
  if (!expr.trim()) return parseOrThrow(text)
  for (const re of BANNED) {
    if (re.test(expr)) {
      throw new Error('Blocked keyword in query: ' + re.source)
    }
  }
  const data = parseOrThrow(text)
  const body = `"use strict"; return (${expr});`
  // eslint-disable-next-line no-new-func
  const fn = new Function('json', '_', body)
  return fn(data, _)
}

/* ---------------- JMESPath ---------------- */

function evalJmesPath (text, query) {
  const data = parseOrThrow(text)
  if (!query.trim()) return data
  return jmespath.search(data, query)
}

/* ---------------- jq (via jq-wasm, async) ---------------- */

let jqModulePromise = null

async function getJq () {
  if (!jqModulePromise) {
    jqModulePromise = import('jq-wasm')
  }
  return jqModulePromise
}

async function evalJq (text, program) {
  if (!program.trim()) return parseOrThrow(text)
  const jq = await getJq()
  // jq-wasm returns the parsed JS value directly (third arg is a flags array)
  return jq.json(text, program)
}

export const transformers = {
  javascript: (text, q) => evalJavaScript(text, q),
  lodash: (text, q) => evalLodash(text, q),
  jmespath: evalJmesPath,
  jq: (text, q) => evalJq(text, q) // returns a Promise; callers handle both sync and async
}
