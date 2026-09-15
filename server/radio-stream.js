'use strict';

const EventEmitter = require('events');

class RadioStreamManager extends EventEmitter {
  constructor(audioEngine) {
    super();
    this.audioEngine = audioEngine;
    this.sseClients  = new Set();

    // Broadcast stats to all SSE clients every second
    this._statsInterval = setInterval(() => {
      if (this.sseClients.size > 0) {
        this._broadcastSSE('stats', this.getStats());
      }
    }, 1000);

    // Clean up on process exit
    process.on('exit', () => this._cleanup());
  }

  _cleanup() {
    clearInterval(this._statsInterval);
    for (const client of this.sseClients) {
      try { client.res.end(); } catch (_) {}
    }
    this.sseClients.clear();
  }

  // ── HLS Live Playlist (/hls/live.m3u8) ────────────────────────────────────
  handleHlsPlaylist(req, res) {
    const playlist = this.audioEngine.getHlsPlaylist();
    res.writeHead(200, {
      'Content-Type':  'application/vnd.apple.mpegurl; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma':        'no-cache',
      'Expires':       '0',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(playlist);
  }

  // ── AAC / MP3 Segment (/hls/segment_N.aac or /hls/segment_N.mp3) ────────
  handleHlsSegment(req, res, segmentId) {
    const cleanId = String(segmentId).replace(/\.(aac|mp3)$/i, '');
    const buffer  = this.audioEngine.getHlsSegment(cleanId);
    if (!buffer) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Segment not found');
    }
    const isAac = req.url.includes('.aac') || !req.url.includes('.mp3');
    res.writeHead(200, {
      'Content-Type':   isAac ? 'audio/aac' : 'audio/mpeg',
      'Content-Length': buffer.length,
      'Cache-Control':  'public, max-age=10',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(buffer);
  }

  // ── Direct Continuous Audio Stream (/stream) ──────────────────────────────
  handleDirectStream(req, res) {
    res.writeHead(200, {
      'Content-Type':      'audio/aac',
      'Cache-Control':     'no-cache, no-store, must-revalidate',
      'Connection':        'keep-alive',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial buffer immediately
    const initialBuf = this.audioEngine._segmentBuffer;
    if (initialBuf) res.write(initialBuf);

    // Stream subsequent segments as they are committed
    const onSegment = (seq) => {
      try {
        const buf = this.audioEngine.getHlsSegment(seq);
        if (buf) res.write(buf);
      } catch (_) {
        this.audioEngine.removeListener('segment', onSegment);
      }
    };

    this.audioEngine.on('segment', onSegment);
    req.on('close', () => {
      this.audioEngine.removeListener('segment', onSegment);
      res.end();
    });
  }

  // ── Server-Sent Events (/api/events) ──────────────────────────────────────
  handleSSE(req, res) {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`data: ${JSON.stringify({ type: 'init', stats: this.getStats() })}\n\n`);

    const client = { res };
    this.sseClients.add(client);

    req.on('close', () => this.sseClients.delete(client));
  }

  _broadcastSSE(type, data) {
    const payload = `data: ${JSON.stringify({ type, data })}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.res.write(payload);
      } catch (_) {
        this.sseClients.delete(client);
      }
    }
  }

  getStats() {
    return {
      activeListeners: this.sseClients.size,
      ...this.audioEngine.getState()
    };
  }
}

module.exports = RadioStreamManager;
