const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const { ensureCertificates, getLocalIpAddresses } = require('./ssl');
const AudioGenerator = require('./audio-generator');
const RadioStreamManager = require('./radio-stream');

const app = express();
app.use(express.json());

async function main() {
  const audioEngine = new AudioGenerator({
    frequency: 7.83,
    sampleRate: 22050
  });

  audioEngine.start();
  const streamManager = new RadioStreamManager(audioEngine);

  // 1. Apple HLS Live Playlist Endpoints
  const hlsRoutes = [
    '/hls/live',
    '/hls/live.m3u8',
    '/live',
    '/live.m3u8',
    '/stream',
    '/radio',
    '/radio.m3u8'
  ];

  app.get(hlsRoutes, (req, res) => {
    streamManager.handleHlsPlaylist(req, res);
  });

  // Root endpoint:
  // If an external media player (Apple AVPlayer, VLC, QuickTime, curl) hits '/', serve HLS directly!
  // If a web browser hits '/', serve the web app.
  app.get('/', (req, res, next) => {
    const accept = req.headers['accept'] || '';
    const ua = req.headers['user-agent'] || '';

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

  // 2. AAC Segments
  app.get('/hls/segment_:id.aac', (req, res) => {
    streamManager.handleHlsSegment(req, res, req.params.id);
  });

  // 3. Static Files (public/)
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // 4. Fallback for root
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // 5. CA Certificate download (for local self-signed testing)
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

  // 6. Telemetry & status
  app.get('/api/status', (req, res) => {
    res.json({
      station: 'Radiophone',
      ...streamManager.getStats(),
      localIps: getLocalIpAddresses()
    });
  });

  // Port configuration (Render.com uses process.env.PORT)
  const isCloudEnv = Boolean(process.env.RENDER || process.env.PORT || process.env.RAILWAY_STATIC_URL);
  const PORT = parseInt(process.env.PORT, 10) || 3000;

  if (isCloudEnv) {
    // Render / Cloud deployment: Cloud edge handles SSL automatically
    const server = http.createServer(app);
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[Cloud Server] Radiophone is running on port ${PORT}`);
      console.log(`[Cloud Server] Ready for Render.com traffic with automated edge SSL.`);
    });
  } else {
    // Local development: dual HTTP (3000) and HTTPS (3443)
    const sslOptions = ensureCertificates();
    const HTTPS_PORT = parseInt(process.env.PORT_HTTPS, 10) || 3443;

    const httpServer = http.createServer(app);
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[HTTP Server] Listening on http://0.0.0.0:${PORT}`);
    });

    const httpsServer = https.createServer({
      key: sslOptions.key,
      cert: sslOptions.cert,
      ca: sslOptions.ca
    }, app);

    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`[HTTPS Server] Listening on https://0.0.0.0:${HTTPS_PORT}`);
      console.log('========================================================');
      console.log('📡 RADIOPHONE UNIVERSAL APPLE HLS RADIO IS LIVE!');
      console.log('--------------------------------------------------------');
      console.log('📱 iPhone Safari (Local Wi-Fi):');
      sslOptions.localIps.forEach(ip => {
        if (ip !== 'localhost' && ip !== '127.0.0.1') {
          console.log(`   Web Konsolu: https://${ip}:${HTTPS_PORT}`);
          console.log(`   HLS Direkt : https://${ip}:${HTTPS_PORT}/live`);
        }
      });
      console.log('========================================================');
    });
  }
}

main().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
