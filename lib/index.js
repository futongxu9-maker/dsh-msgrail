/**
 * Node half of the MsgRail plugin: exposes GET /api/msgrail/messages?sessionId=
 * returning the session's real user messages (seq/time/id/text) for the browser
 * rail. Reads the in-memory session first (full events, includes data.source);
 * falls back to sessionQuery (listEvents for seqs + readEvent for full events)
 * so the rail also works for sessions no longer resident in memory.
 */
export const inject = ['webServer']
export const name = 'msgrail'

// 冷会话（不在内存）的查询结果缓存：30s TTL。历史会话数据不常变，
// 避免反复切回同一会话时每次全量读取（listEvents + 并发 readEvent）。
const coldCache = new Map()
const COLD_TTL = 30 * 1000

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return
  const sessions = ctx.get('sessions')
  const sessionQuery = ctx.get('sessionQuery')

  const textOf = (blocks) => String((blocks || [])
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')).slice(0, 600)

  const writeJson = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }

  async function handleApi(req, res) {
    try {
      if (req.method !== 'GET') return writeJson(res, 405, { ok: false, error: 'GET only' })
      const url = new URL(req.url, 'http://localhost')
      const sessionId = url.searchParams.get('sessionId')
      if (!sessionId) return writeJson(res, 400, { ok: false, error: 'missing sessionId' })

      const items = []
      // 路径1：内存 session（完整事件，含 data.source）
      const mem = sessions && sessions.get(sessionId)
      if (mem && Array.isArray(mem.events)) {
        for (const e of mem.events) {
          if (!e || e.type !== 'user/message' || !e.data || !e.data.source) continue
          if (e.data.source.kind !== 'user') continue
          items.push({ seq: e.seq, time: e.time || 0, id: String(e.data.id), text: textOf(e.data.content) })
        }
      } else if (sessionQuery) {
        // 路径2：持久化兜底——冷会话结果缓存 30s，命中直接返回
        const now = Date.now()
        const cached = coldCache.get(sessionId)
        if (cached !== undefined && now - cached.at < COLD_TTL) {
          return writeJson(res, 200, { ok: true, items: cached.items, cached: true })
        }
        // listEvents 拿轻量记录（seq/type/time），readEvent 并发取完整事件
        const records = await sessionQuery.listEvents(sessionId)
        const userSeqs = (records || [])
          .filter((r) => r && r.type === 'user/message')
          .map((r) => r.seq)
        const windows = await Promise.all(userSeqs.map((seq) =>
          sessionQuery.readEvent({ sessionId, seq }).catch(() => null)))
        for (const win of windows) {
          const e = win && win.target
          if (!e || e.type !== 'user/message' || !e.data || !e.data.source) continue
          if (e.data.source.kind !== 'user') continue
          items.push({ seq: e.seq, time: e.time || 0, id: String(e.data.id), text: textOf(e.data.content) })
        }
        coldCache.set(sessionId, { items, at: Date.now() })
      }
      return writeJson(res, 200, { ok: true, items })
    } catch (err) {
      return writeJson(res, 500, { ok: false, error: String(err && err.message || err) })
    }
  }

  try {
    webServer.register({ kind: 'exact', path: '/api/msgrail/messages', handler: handleApi })
  } catch {
    // 路由已存在（热重载重复挂载）——继续服务
  }
}
