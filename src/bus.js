// Basit SSE yayın merkezi — tarayıcıya canlı pipeline durumu gönderir.
const clients = new Set();

export function sseHandler(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": bağlandı\n\n");
  clients.add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 20000);
  req.on("close", () => { clearInterval(ping); clients.delete(res); });
}

export function emit(type, payload) {
  const msg = `data: ${JSON.stringify({ type, ...payload })}\n\n`;
  for (const c of clients) { try { c.write(msg); } catch {} }
}
