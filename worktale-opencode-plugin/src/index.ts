/**
 * Worktale plugin for OpenCode (https://opencode.ai)
 *
 * Listens for assistant message completions, aggregates tokens + cost
 * (already pre-computed by OpenCode) and tool usage per session, then
 * shells out to `worktale session add` after a debounced idle period.
 *
 * Install: see README.md
 */

import type { Plugin } from "@opencode-ai/plugin"
import { spawnSync } from "node:child_process"

const FLUSH_DELAY_MS = 60_000  // flush a session after 60s of inactivity
const MIN_TOKENS = 100         // ignore sessions with negligible activity
const DRY_RUN = process.env.WORKTALE_PLUGIN_DRY_RUN === "1"

interface MessageState {
  cost: number
  input: number
  cached: number
  output: number
  reasoning: number
  model: string
  provider: string
}

interface SessionState {
  messages: Map<string, MessageState>  // by messageID — latest snapshot wins
  tools: Set<string>
  startedAt: number
  lastTouched: number
}

const sessions = new Map<string, SessionState>()
const timers = new Map<string, NodeJS.Timeout>()

function getSession(sessionID: string): SessionState {
  let s = sessions.get(sessionID)
  if (!s) {
    s = {
      messages: new Map(),
      tools: new Set(),
      startedAt: Date.now(),
      lastTouched: Date.now(),
    }
    sessions.set(sessionID, s)
  }
  s.lastTouched = Date.now()
  return s
}

function aggregateTotals(s: SessionState) {
  let input = 0, cached = 0, output = 0, reasoning = 0, cost = 0
  let model = "", provider = ""
  for (const m of s.messages.values()) {
    input += m.input
    cached += m.cached
    output += m.output
    reasoning += m.reasoning
    cost += m.cost
    if (m.model) model = m.model
    if (m.provider) provider = m.provider
  }
  return { input, cached, output, reasoning, cost, model, provider }
}

function flush(sessionID: string, cwd: string) {
  const s = sessions.get(sessionID)
  if (!s) return
  const t = aggregateTotals(s)
  const totalIn = t.input + t.cached
  if (totalIn + t.output < MIN_TOKENS) {
    sessions.delete(sessionID)
    return
  }

  const args = [
    "session", "add",
    "--provider", t.provider || "unknown",
    "--tool", "opencode",
  ]
  if (t.model) args.push("--model", t.model)
  if (totalIn > 0) args.push("--input-tokens", String(totalIn))
  const totalOut = t.output + t.reasoning
  if (totalOut > 0) args.push("--output-tokens", String(totalOut))
  if (t.cost > 0) args.push("--cost", t.cost.toFixed(4))
  const dur = Math.max(1, Math.round((s.lastTouched - s.startedAt) / 1000))
  args.push("--duration", String(dur))
  if (s.tools.size > 0) args.push("--tools-used", [...s.tools].join(","))

  if (DRY_RUN) {
    // eslint-disable-next-line no-console
    console.log("[worktale-opencode-plugin] would record:", JSON.stringify({ sessionID, cwd, args }))
  } else {
    spawnSync("worktale", args, {
      cwd,
      stdio: "ignore",
      shell: process.platform === "win32",
    })
  }

  sessions.delete(sessionID)
}

function scheduleFlush(sessionID: string, cwd: string) {
  const existing = timers.get(sessionID)
  if (existing) clearTimeout(existing)
  const t = setTimeout(() => {
    timers.delete(sessionID)
    flush(sessionID, cwd)
  }, FLUSH_DELAY_MS)
  if (typeof t.unref === "function") t.unref()
  timers.set(sessionID, t)
}

export const Worktale: Plugin = async (input) => {
  const cwd = input.directory || input.worktree || process.cwd()

  return {
    /**
     * The catch-all event hook. We filter for `message.updated` events on
     * assistant messages — that's where OpenCode publishes per-message
     * cost and token totals (including cached input + reasoning tokens).
     */
    event: async ({ event }: any) => {
      if (!event || event.type !== "message.updated") return
      const info = event.properties?.info ?? event.info
      if (!info || info.role !== "assistant") return
      const sessionID = info.sessionID ?? info.session_id
      const messageID = info.id ?? info.messageID ?? info.message_id
      if (!sessionID || !messageID) return

      const tokens = info.tokens ?? {}
      const cache = tokens.cache ?? {}
      const state = getSession(sessionID)
      // Latest snapshot wins for this messageID — assistant messages
      // are updated multiple times during streaming
      state.messages.set(messageID, {
        cost: typeof info.cost === "number" ? info.cost : 0,
        input: typeof tokens.input === "number" ? tokens.input : 0,
        cached:
          (typeof cache.read === "number" ? cache.read : 0) +
          (typeof cache.write === "number" ? cache.write : 0),
        output: typeof tokens.output === "number" ? tokens.output : 0,
        reasoning: typeof tokens.reasoning === "number" ? tokens.reasoning : 0,
        model: typeof info.modelID === "string" ? info.modelID : "",
        provider: typeof info.providerID === "string" ? info.providerID : "",
      })
      scheduleFlush(sessionID, cwd)
    },

    /**
     * Capture which tools were invoked. Each tool execution adds the
     * tool name to the session's tool set; the aggregate is included
     * in the final `worktale session add` call.
     */
    "tool.execute.after": async (ti: any) => {
      if (!ti?.sessionID || !ti?.tool) return
      const state = getSession(ti.sessionID)
      state.tools.add(ti.tool)
      scheduleFlush(ti.sessionID, cwd)
    },
  }
}

export default Worktale
