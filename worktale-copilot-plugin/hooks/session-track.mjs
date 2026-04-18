#!/usr/bin/env node
// Worktale GitHub Copilot CLI session tracker.
//
// Parses `events.jsonl` files written by Copilot CLI under
// ~/.copilot/session-state/<sessionId>/ (or %LOCALAPPDATA%\copilot\
// session-state\<sessionId>\ on Windows) and records aggregate
// token usage + cost per session via `worktale session add`.
//
// Token + cost source: `assistant.usage` event (per API call), with
// pre-computed `cost` field — Copilot does the math itself, so no
// rate table is needed.
//
// Approach (similar to the Codex tracker):
//   1. On each invocation, scan recent session-state directories
//   2. Skip sessions already recorded (state in
//      ~/.worktale/copilot-processed.json)
//   3. Skip sessions whose events.jsonl was modified within STALE_MIN
//      minutes (treat as still-active — wait for next invocation)
//   4. For finished sessions: parse JSONL, aggregate, shell out to
//      `worktale session add`, mark processed.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  mkdirSync,
  readdirSync,
} from "node:fs"
import { join } from "node:path"
import { homedir, platform } from "node:os"
import { spawnSync } from "node:child_process"

const STATE_DIR = join(homedir(), ".worktale")
const STATE_FILE = join(STATE_DIR, "copilot-processed.json")
const STALE_MIN = 5
const SCAN_DAYS = 14
const MIN_TOKENS = 100
const DRY_RUN = process.env.WORKTALE_HOOK_DRY_RUN === "1"

function copilotStateRoots() {
  const roots = []
  if (process.env.COPILOT_HOME) roots.push(join(process.env.COPILOT_HOME, "session-state"))
  // Linux/macOS-style path (also used on Windows by some Copilot CLI versions)
  roots.push(join(homedir(), ".copilot", "session-state"))
  if (platform() === "win32") {
    const local = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
    roots.push(join(local, "copilot", "session-state"))
  }
  // De-dupe and keep only those that exist
  const seen = new Set()
  return roots.filter((r) => {
    if (seen.has(r)) return false
    seen.add(r)
    return existsSync(r)
  })
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { processed: {} }
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"))
  } catch {
    return { processed: {} }
  }
}

function saveState(state) {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8")
}

function listRecentSessionFiles(root) {
  if (!existsSync(root)) return []
  const out = []
  const cutoff = Date.now() - SCAN_DAYS * 24 * 60 * 60 * 1000
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const file = join(root, e.name, "events.jsonl")
    try {
      const st = statSync(file)
      if (st.mtimeMs >= cutoff) {
        out.push({ sessionId: e.name, path: file, mtime: st.mtimeMs })
      }
    } catch {
      // skip dirs without events.jsonl
    }
  }
  return out
}

function parseSessionFile(path) {
  const acc = {
    sessionId: null,
    cwd: null,
    model: null,
    copilotVersion: null,
    startTime: null,
    lastTime: null,
    input: 0,
    cached: 0,
    output: 0,
    cost: 0,
    tools: new Set(),
    mcpServers: new Set(),
    apiCalls: 0,
    hadAuthError: false,
  }

  let raw
  try {
    raw = readFileSync(path, "utf-8")
  } catch {
    return null
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let ev
    try {
      ev = JSON.parse(trimmed)
    } catch {
      continue
    }
    const t = ev.type
    const data = ev.data ?? {}
    const ts = ev.timestamp ? Date.parse(ev.timestamp) : null
    if (ts) {
      if (acc.startTime === null || ts < acc.startTime) acc.startTime = ts
      if (acc.lastTime === null || ts > acc.lastTime) acc.lastTime = ts
    }

    if (t === "session.start") {
      acc.sessionId = data.sessionId ?? acc.sessionId
      acc.copilotVersion = data.copilotVersion ?? acc.copilotVersion
      const ctx = data.context ?? {}
      acc.cwd = ctx.cwd ?? acc.cwd
      if (data.selectedModel && !acc.model) acc.model = data.selectedModel
      if (data.startTime) {
        const sT = Date.parse(data.startTime)
        if (!isNaN(sT)) acc.startTime = sT
      }
      continue
    }
    if (t === "session.error") {
      const msg = (data.message || "").toLowerCase()
      if (msg.includes("auth") || data.statusCode === 401 || data.statusCode === 403) {
        acc.hadAuthError = true
      }
      continue
    }
    if (t === "session.model_change") {
      if (data.newModel) acc.model = data.newModel
      continue
    }
    if (t === "assistant.usage") {
      acc.apiCalls += 1
      if (typeof data.inputTokens === "number") acc.input += data.inputTokens
      if (typeof data.cacheReadTokens === "number") acc.cached += data.cacheReadTokens
      if (typeof data.cacheWriteTokens === "number") acc.cached += data.cacheWriteTokens
      if (typeof data.outputTokens === "number") acc.output += data.outputTokens
      if (typeof data.cost === "number") acc.cost += data.cost
      if (data.model && !acc.model) acc.model = data.model
      continue
    }
    if (t === "tool.execution_start" || t === "tool.execution_complete") {
      const name = data.mcpToolName || data.toolName
      if (name) acc.tools.add(name)
      const mcp = data.mcpServerName
      if (mcp) acc.mcpServers.add(mcp)
      continue
    }
    if (t === "session.shutdown") {
      // Aggregate fallback if assistant.usage events were missing
      const mm = data.modelMetrics || {}
      let aggIn = 0, aggOut = 0, aggCost = 0
      let pickedModel = null
      let bestRequests = 0
      for (const [model, metrics] of Object.entries(mm)) {
        const usage = metrics.usage || {}
        aggIn += (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
        aggOut += usage.outputTokens ?? 0
        aggCost += metrics.requests?.cost ?? metrics.cost ?? 0
        const reqs = metrics.requests?.count ?? 0
        if (reqs > bestRequests) {
          bestRequests = reqs
          pickedModel = model
        }
      }
      if (acc.input + acc.output + acc.cached === 0 && (aggIn + aggOut) > 0) {
        acc.input = aggIn - acc.cached
        acc.output = aggOut
        acc.cost = aggCost
      }
      if (!acc.model && data.currentModel) acc.model = data.currentModel
      if (!acc.model && pickedModel) acc.model = pickedModel
      continue
    }
  }

  return acc
}

function callWorktale(args, cwd) {
  if (DRY_RUN) {
    console.log(JSON.stringify({ cwd, args }))
    return 0
  }
  const result = spawnSync("worktale", args, {
    cwd: cwd || process.cwd(),
    stdio: "ignore",
    shell: process.platform === "win32",
  })
  return result.status ?? 0
}

function main() {
  const roots = copilotStateRoots()
  if (roots.length === 0) process.exit(0)

  const state = loadState()
  state.processed ||= {}

  const files = roots
    .flatMap((r) => listRecentSessionFiles(r))
    .sort((a, b) => a.mtime - b.mtime)
  const now = Date.now()
  const staleCutoff = now - STALE_MIN * 60 * 1000

  let recorded = 0
  for (const f of files) {
    if (state.processed[f.sessionId]) continue
    if (f.mtime > staleCutoff) continue

    const parsed = parseSessionFile(f.path)
    if (!parsed) {
      state.processed[f.sessionId] = { recordedAt: now, status: "unreadable" }
      continue
    }
    if (parsed.hadAuthError && parsed.input + parsed.output + parsed.cached === 0) {
      state.processed[f.sessionId] = {
        recordedAt: now,
        status: "auth-error",
      }
      continue
    }
    const totalIn = parsed.input + parsed.cached
    if (totalIn + parsed.output < MIN_TOKENS) {
      state.processed[f.sessionId] = {
        recordedAt: now,
        status: "too-small",
        tokens: totalIn + parsed.output,
      }
      continue
    }

    const args = [
      "session", "add",
      "--provider", "github",
      "--tool", "copilot",
    ]
    if (parsed.model) args.push("--model", parsed.model)
    if (totalIn > 0) args.push("--input-tokens", String(totalIn))
    if (parsed.output > 0) args.push("--output-tokens", String(parsed.output))
    if (parsed.cost > 0) args.push("--cost", parsed.cost.toFixed(4))
    const durationSecs =
      parsed.startTime && parsed.lastTime
        ? Math.max(1, Math.round((parsed.lastTime - parsed.startTime) / 1000))
        : null
    if (durationSecs) args.push("--duration", String(durationSecs))
    if (parsed.tools.size > 0) args.push("--tools-used", [...parsed.tools].join(","))
    if (parsed.mcpServers.size > 0) args.push("--mcp-servers", [...parsed.mcpServers].join(","))

    const exit = callWorktale(args, parsed.cwd)
    state.processed[f.sessionId] = {
      recordedAt: now,
      status: exit === 0 ? "ok" : "failed",
      model: parsed.model,
      input: totalIn,
      output: parsed.output,
      cost: parsed.cost,
      apiCalls: parsed.apiCalls,
    }
    if (exit === 0) recorded += 1
  }

  // Cap state size
  const entries = Object.entries(state.processed)
  if (entries.length > 500) {
    const sorted = entries.sort((a, b) => (b[1].recordedAt || 0) - (a[1].recordedAt || 0))
    state.processed = Object.fromEntries(sorted.slice(0, 500))
  }
  saveState(state)

  if (DRY_RUN) console.log(`# recorded ${recorded} sessions`)
  process.exit(0)
}

main()
