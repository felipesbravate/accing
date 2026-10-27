// Retries a request when the connection itself fails (timeout, reset, DNS), never when the server answered.
// Nothing reached the server in those cases, so retrying a POST is safe. Seen 2026-10-27: Node timed out connecting
// to Google while curl reached the same address.
const RETRIES = 3;
const realFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await realFetch(...args);
    } catch (e) {
      const code = e.cause?.code || '';
      const network = e.message === 'fetch failed' || /TIMEOUT|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ENETUNREACH|UND_ERR/.test(code);
      if (!network || attempt > RETRIES) throw e;
      const wait = 2000 * attempt;
      console.log(`(connection failed: ${code || e.message}; retrying in ${wait / 1000}s, ${attempt}/${RETRIES})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
};
