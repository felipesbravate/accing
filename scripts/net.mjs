// Retries a request when the connection fails (timeout, reset, DNS) or the server says it is busy (429, 500, 502,
// 503, 504: e.g. Gemini "503 Deadline expired"), waiting 2, 4, 8 s. Never retries other answers. Bodies are strings
// or form data built once, so resending is safe. Seen 2026-10-27: Node connect timeouts and Gemini 503s.
const RETRIES = 3;
const BUSY = new Set([429, 500, 502, 503, 504]);
const realFetch = globalThis.fetch;
const wait = (attempt) => new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
globalThis.fetch = async (...args) => {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await realFetch(...args);
    } catch (e) {
      const code = e.cause?.code || '';
      const network = e.message === 'fetch failed' || /TIMEOUT|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ENETUNREACH|UND_ERR/.test(code);
      if (!network || attempt > RETRIES) throw e;
      console.log(`(connection failed: ${code || e.message}; retrying in ${2 * 2 ** (attempt - 1)}s, ${attempt}/${RETRIES})`);
      await wait(attempt);
      continue;
    }
    if (!BUSY.has(res.status) || attempt > RETRIES) return res;
    console.log(`(server busy: ${res.status}; retrying in ${2 * 2 ** (attempt - 1)}s, ${attempt}/${RETRIES})`);
    await res.body?.cancel?.().catch(() => {});
    await wait(attempt);
  }
};
