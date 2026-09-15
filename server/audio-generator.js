const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

// Pre-encoded mathematically pure 2.0-second silent AAC ADTS segment (22.05 kHz Mono)
// Completely eliminates afconvert / ffmpeg / native binary dependencies on Linux (Render.com)
const SILENT_AAC_BASE64 =
  '//lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//' +
  'lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//' +
  'lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//' +
  'lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//' +
  'lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//' +
  'lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//' +
  'lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAH//' +
  'lcYAFgAADQAAf/+VxgAWAAANAAB//5XGABYAAA0AAc=';

class AudioGenerator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.sampleRate = options.sampleRate || 22050;
    this.channels = 1;
    this.kbps = 32;

    // 7.83 Hz Schumann Earth Resonance
    this.frequency = options.frequency || 7.83;

    // HLS parameters
    this.segmentDurationSec = 2.0;
    this.segmentIntervalMs = 2000;
    this.segmentSequence = 1;
    this.hlsSegments = new Map();
    this.maxHlsSegments = 25; // ~50s buffer

    // Initialize silent AAC buffer from file or embedded base64
    const localAacPath = path.join(__dirname, 'silent_segment.aac');
    if (fs.existsSync(localAacPath)) {
      this.cachedSilentAacBuffer = fs.readFileSync(localAacPath);
    } else {
      this.cachedSilentAacBuffer = Buffer.from(SILENT_AAC_BASE64, 'base64');
    }

    this.intervalId = null;
    this.startTime = Date.now();
    this.totalBytesStreamed = 0;
  }

  start() {
    if (this.intervalId) return;
    this.startTime = Date.now();

    // Pre-populate initial 4 segments so HLS playlist is immediately available on startup
    for (let i = 0; i < 4; i++) {
      this.commitSegment();
    }

    // Schedule subsequent segments every 2 seconds in-memory (0 CPU, 0 disk I/O)
    this.intervalId = setInterval(() => {
      this.commitSegment();
    }, this.segmentIntervalMs);

    console.log(`[AudioEngine] 7.83 Hz Infrasound Radio started (100% Silent, Zero-Noise Apple AAC HLS)`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  commitSegment() {
    const seq = this.segmentSequence++;
    const aacBuffer = this.cachedSilentAacBuffer;

    this.totalBytesStreamed += aacBuffer.length;
    this.hlsSegments.set(seq, {
      buffer: aacBuffer,
      duration: this.segmentDurationSec
    });

    while (this.hlsSegments.size > this.maxHlsSegments) {
      const oldestSeq = this.hlsSegments.keys().next().value;
      this.hlsSegments.delete(oldestSeq);
    }

    this.emit('newHlsSegment', seq);
  }

  getHlsPlaylist() {
    const seqs = Array.from(this.hlsSegments.keys());
    if (seqs.length === 0) {
      return `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:3\n#EXT-X-MEDIA-SEQUENCE:1\n`;
    }

    const firstSeq = seqs[0];
    let playlist = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:3\n#EXT-X-MEDIA-SEQUENCE:${firstSeq}\n`;

    for (const s of seqs) {
      const seg = this.hlsSegments.get(s);
      playlist += `#EXTINF:${seg.duration.toFixed(3)},\n/hls/segment_${s}.aac\n`;
    }

    return playlist;
  }

  getHlsSegment(seqId) {
    const item = this.hlsSegments.get(parseInt(seqId, 10));
    return item ? item.buffer : null;
  }

  getState() {
    return {
      frequency: this.frequency,
      sampleRateKHz: this.sampleRate / 1000,
      format: 'Apple AAC HLS (Zero-Noise)',
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      totalBytesStreamed: this.totalBytesStreamed,
      hlsSegmentsCount: this.hlsSegments.size
    };
  }
}

module.exports = AudioGenerator;
