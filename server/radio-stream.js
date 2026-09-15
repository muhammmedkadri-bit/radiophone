const EventEmitter = require('events');

class RadioStreamManager extends EventEmitter {
  constructor(audioEngine) {
    super();
    this.audioEngine = audioEngine;
    this.sseClients = new Set();
    this.activeListeners = 0;

    // Periodic stats broadcast
    setInterval(() => {
      this.broadcastSSE('stats', this.getStats());
    }, 1000);
  }

  // Apple HLS Live Playlist (/hls/live.m3u8)
  handleHlsPlaylist(req, res) {
    const playlist = this.audioEngine.getHlsPlaylist();
    res.writeHead(200, {
      'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': 'Content-Type, Content-Length'
    });
    res.end(playlist);
  }

  // Apple HLS AAC Segment (/hls/segment_:id.aac)
  handleHlsSegment(req, res, segmentId) {
    const buffer = this.audioEngine.getHlsSegment(segmentId);
    if (!buffer) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Segment not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'audio/aac',
      'Content-Length': buffer.length,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(buffer);
  }

  handleSSERequest(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    res.write(`data: ${JSON.stringify({ type: 'init', stats: this.getStats(), state: this.audioEngine.getState() })}\n\n`);

    const sseClient = { res };
    this.sseClients.add(sseClient);

    req.on('close', () => {
      this.sseClients.delete(sseClient);
    });
  }

  broadcastSSE(type, data) {
    const payload = `data: ${JSON.stringify({ type, data })}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.res.write(payload);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }

  getStats() {
    return {
      activeListeners: this.sseClients.size || 1,
      ...this.audioEngine.getState()
    };
  }
}

module.exports = RadioStreamManager;
