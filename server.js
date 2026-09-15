// EmirX TikTok Mods - Bridge Sunucusu
//
// Bu kod Minecraft sunucusunun (Aternos) UZERINDE degil, ayrica calisir:
// senin bilgisayarinda ya da ucretsiz bir Node.js host'unda (Render, Railway vb.)
// TikTok'un kendisi ile bunun disinda hicbir sey konusamaz - Minecraft tarafi
// buraya sadece /poll ile "yeni bir sey var mi?" diye HTTPS uzerinden sorar.
//
// Kurulum:
//   cd bridge
//   npm install
//   EMIRX_TIKTOK_TOKEN=gizli-bir-sifre node server.js
//
// ONEMLI: @minecraft/server-net sadece HTTPS (TLS) isteklere izin veriyor.
// Yani bu sunucuyu localhost'ta birakip Aternos'un ona ulasmasini bekleyemezsin.
// Bir tunnel (cloudflared / ngrok) ya da HTTPS destekleyen ucretsiz bir host
// (Render.com gibi) arkasina koyman gerekiyor.

const express = require("express");
const { WebcastPushConnection } = require("tiktok-live-connector");

const app = express();
app.use(express.json());

const AUTH_TOKEN = process.env.EMIRX_TIKTOK_TOKEN || "emirx_tk_9f3a71c2";
const PORT = process.env.PORT || 3000;

let connection = null;
let currentStreamer = null;
let eventQueue = [];

function requireAuth(req, res, next) {
  if (req.headers["x-auth"] !== AUTH_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

function resetConnection() {
  if (connection) {
    try { connection.disconnect(); } catch (_) { /* zaten kopmus olabilir */ }
  }
  connection = null;
  currentStreamer = null;
  eventQueue = [];
}

// /emirx:tiktok connect <yayinci_ismi> komutu buraya dusuyor
app.post("/connect", requireAuth, async (req, res) => {
  const streamer = (req.body && req.body.streamer || "").trim();
  if (!streamer) {
    return res.status(400).json({ error: "streamer required" });
  }

  resetConnection();
  connection = new WebcastPushConnection(streamer);

  connection.on("chat", (data) => {
    eventQueue.push({
      type: "chat",
      user: data.nickname || data.uniqueId || "?",
      message: data.comment || "",
    });
  });

  connection.on("gift", (data) => {
    // Streak (arka arkaya ayni hediye) bittiginde tek mesaj gonder,
    // her ara tick'te tekrar tekrar spam atmamak icin.
    if (data.giftType === 1 && data.repeatEnd !== true) return;
    eventQueue.push({
      type: "gift",
      user: data.nickname || data.uniqueId || "?",
      giftName: data.giftName || "Hediye",
      count: data.repeatCount || 1,
    });
  });

  connection.on("disconnected", () => {
    currentStreamer = null;
  });

  connection.on("streamEnd", () => {
    currentStreamer = null;
  });

  try {
    await connection.connect();
    currentStreamer = streamer;
    res.json({ ok: true, streamer });
  } catch (err) {
    resetConnection();
    res.status(502).json({ error: String(err && err.message || err) });
  }
});

// /emirx:tiktok off komutu buraya dusuyor
app.post("/disconnect", requireAuth, (req, res) => {
  resetConnection();
  res.json({ ok: true });
});

// Mod her ~1 saniyede bir burayi cagirip kuyruktaki yeni olaylari aliyor
app.get("/poll", requireAuth, (req, res) => {
  const events = eventQueue;
  eventQueue = [];
  res.json({ connected: !!connection, streamer: currentStreamer, events });
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`emirx tiktok bridge dinleniyor: ${PORT}`);
});
