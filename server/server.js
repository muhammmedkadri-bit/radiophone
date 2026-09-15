'use strict';

const express  = require('express');
const http     = require('http');
const https    = require('https');
const path     = require('path');
const fs       = require('fs');

const { ensureCertificates, getLocalIpAddresses } = require('./ssl');
const AudioGenerator    = require('./audio-generator');
const RadioStreamManager = require('./radio-stream');

const app = express();

// ── Disable X-Powered-By header (minor security hardening) ──────────────────
app.disable('x-powered-by');

// ── Static files (aggressive caching for assets) ────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '1d',
  etag:   true
}));

async function main() {
  const audioEngine   = new AudioGenerator({ frequency: 7.83 });
  audioEngine.start();
  const streamManager = new RadioStreamManager(audioEngine);

  // ── HLS Live Playlist ──────────────────────────────────────────────────────
  // All common HLS URL patterns — media players and browsers use different ones
  const HLS_ROUTES = ['/hls/live', '/hls/live.m3u8', '/live', '/live.m3u8', '/radio.m3u8'];
  app.get(HLS_ROUTES, (req, res) => streamManager.handleHlsPlaylist(req, res));

  // ── HLS Segments (.aac and .mp3) ──────────────────────────────────────────
  app.get(['/hls/segment_:id.aac', '/hls/segment_:id.mp3', '/hls/segment_:id'], (req, res) =>
    streamManager.handleHlsSegment(req, res, req.params.id)
  );

  // ── Direct Continuous Audio Stream ────────────────────────────────────────
  app.get('/stream', (req, res) => streamManager.handleDirectStream(req, res));

  // ── Root: smart dispatch ───────────────────────────────────────────────────
  // Native media players (AVPlayer, VLC) hit "/" — serve HLS playlist directly
  // Browsers hit "/" — serve the web app
  app.get('/', (req, res, next) => {
    const accept = req.headers['accept'] || '';
    const ua     = req.headers['user-agent'] || '';
    if (
      accept.includes('application/vnd.apple.mpegurl') ||
      accept.includes('application/x-mpegURL') ||
      accept.includes('audio/') ||
      ua.includes('AppleCoreMedia') ||
      ua.includes('VLC') ||
      ua.includes('QuickTime')
    ) {
      return streamManager.handleHlsPlaylist(req, res);
    }
    next();
  });

  // ── Web app fallback ───────────────────────────────────────────────────────
  app.get('/', (req, res) =>
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
  );

  // ── SSE (real-time stats to web UI) ───────────────────────────────────────
  app.get('/api/events', (req, res) => streamManager.handleSSE(req, res));

  // ── Status API ─────────────────────────────────────────────────────────────
  app.get('/api/status', (req, res) => {
    res.json({ station: 'Radiophone', ...streamManager.getStats() });
  });

  // ── CA Certificate download (local dev / self-signed trust) ───────────────
  app.get(['/ca.crt', '/cert/ca.crt'], (req, res) => {
    const caPath = path.join(__dirname, '..', 'certs', 'ca.crt');
    if (fs.existsSync(caPath)) {
      res.setHeader('Content-Disposition', 'attachment; filename="radiophone-ca.crt"');
      res.setHeader('Content-Type', 'application/x-x509-ca-cert');
      res.sendFile(caPath);
    } else {
      res.status(404).send('Not found');
    }
  });

  // ── Keep-alive ping (prevents Render free-plan spin-down) ─────────────────
  // Render free services sleep after 15 min of no inbound traffic.
  // Self-ping every 10 minutes keeps the process warm between real listeners.
  // This runs only in cloud env where process.env.RENDER is set.
  if (process.env.RENDER) {
    const SELF_URL = process.env.RENDER_EXTERNAL_URL || '';
    if (SELF_URL) {
      setInterval(() => {
        const mod = SELF_URL.startsWith('https') ? require('https') : require('http');
        mod.get(`${SELF_URL}/api/status`, (r) => r.resume()).on('error', () => {});
      }, 10 * 60 * 1000); // every 10 minutes
      console.log(`[KeepAlive] Self-ping active → ${SELF_URL}/api/status`);
    }
  }

  // ── Server startup ─────────────────────────────────────────────────────────
  const isCloud = Boolean(process.env.RENDER || process.env.PORT);
  const PORT    = parseInt(process.env.PORT, 10) || 3000;

  if (isCloud) {
    // Cloud: Render handles SSL at edge — we serve plain HTTP internally
    http.createServer(app).listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] Radiophone running on port ${PORT} (cloud mode)`);
      console.log(`[HLS]    ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}/live`);
    });
  } else {
    // Local dev: self-signed HTTPS for iOS Safari
    const HTTPS_PORT = parseInt(process.env.PORT_HTTPS, 10) || 3443;
    const sslOptions = ensureCertificates();

    http.createServer(app).listen(PORT, '0.0.0.0', () => {
      console.log(`[HTTP]  http://localhost:${PORT}`);
    });

    https.createServer({ key: sslOptions.key, cert: sslOptions.cert, ca: sslOptions.ca }, app)
      .listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log('='.repeat(56));
        console.log('📡 RADIOPHONE — LOCAL DEV');
        console.log('-'.repeat(56));
        const ips = sslOptions.localIps || getLocalIpAddresses();
        ips.filter(ip => ip !== 'localhost' && ip !== '127.0.0.1').forEach(ip => {
          console.log(`  Web : https://${ip}:${HTTPS_PORT}`);
          console.log(`  HLS : https://${ip}:${HTTPS_PORT}/live`);
        });
        console.log('='.repeat(56));
      });
  }
}

main().catch((err) => {
  console.error('[FATAL] Startup error:', err);
  process.exit(1);
});
