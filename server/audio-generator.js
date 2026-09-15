/**
 * AudioGenerator — 7.83 Hz Schumann Resonance AAC HLS Live Radio
 *
 * Pre-encoded 100% compliant AAC-LC ADTS audio segment (Mono, 32 kHz, 32 kbps).
 * Contains real 7.83 Hz infrasound sine wave (completely inaudible to human ear,
 * but fully recognized as active audio by iOS / AudioToolbox / AVPlayer).
 *
 * Segment validated with macOS AudioToolbox (afinfo / afplay / AppleCoreMedia).
 * Zero CPU per tick at runtime.
 */

'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

// Embedded fallback base64 (7,516 bytes binary)
const FALLBACK_SEGMENT_BASE64 = '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';

class AudioGenerator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.sampleRate         = 32000;
    this.frequency          = options.frequency || 7.83;
    this.segmentDurationSec = 2.046;
    this.segmentIntervalMs  = 2000;
    this.segmentSequence    = 1;
    this.hlsSegments        = new Map();
    this.maxHlsSegments     = 20;       // ~40s rolling buffer

    this.intervalId         = null;
    this.startTime          = Date.now();
    this.totalBytesStreamed  = 0;

    // Load segment buffer
    const localPath = path.join(__dirname, 'segment.aac');
    if (fs.existsSync(localPath)) {
      this._segmentBuffer = fs.readFileSync(localPath);
    } else {
      this._segmentBuffer = Buffer.from(FALLBACK_SEGMENT_BASE64, 'base64');
    }
    this._segmentBytes = this._segmentBuffer.length;
  }

  start() {
    if (this.intervalId) return;
    this.startTime = Date.now();

    // Pre-populate 5 segments so new listeners get instant playback without buffering wait
    for (let i = 0; i < 5; i++) this._commit();

    // Emit new segment every 2 seconds
    this.intervalId = setInterval(() => this._commit(), this.segmentIntervalMs);

    console.log(
      `[AudioEngine] STARTED | ${this.frequency} Hz | ` +
      `${this.sampleRate / 1000} kHz mono 32 kbps AAC | ` +
      `segment=${this._segmentBytes} B | zero CPU per tick`
    );
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  _commit() {
    const seq = this.segmentSequence++;
    this.totalBytesStreamed += this._segmentBytes;
    this.hlsSegments.set(seq, {
      buffer: this._segmentBuffer,
      duration: this.segmentDurationSec
    });

    // Evict oldest beyond rolling window
    while (this.hlsSegments.size > this.maxHlsSegments) {
      this.hlsSegments.delete(this.hlsSegments.keys().next().value);
    }
    this.emit('segment', seq);
  }

  getHlsPlaylist() {
    const seqs = Array.from(this.hlsSegments.keys());
    if (seqs.length === 0) {
      return '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:3\n#EXT-X-MEDIA-SEQUENCE:1\n';
    }
    const firstSeq = seqs[0];
    // No #EXT-X-ENDLIST signals LIVE stream to all HLS clients
    let pl = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:3\n#EXT-X-MEDIA-SEQUENCE:' + firstSeq + '\n';
    for (const s of seqs) {
      pl += '#EXTINF:' + this.segmentDurationSec.toFixed(3) + ',\n/hls/segment_' + s + '.aac\n';
    }
    return pl;
  }

  getHlsSegment(seqId) {
    const cleanId = parseInt(seqId, 10);
    const item = this.hlsSegments.get(cleanId);
    if (item) return item.buffer;
    // Robust fallback: if an older segment was evicted from rolling map or slightly ahead,
    // return the valid segment buffer so playback NEVER halts on a 404
    if (!isNaN(cleanId) && cleanId > 0) {
      return this._segmentBuffer;
    }
    return null;
  }

  getState() {
    return {
      frequency:          this.frequency,
      sampleRateKHz:      this.sampleRate / 1000,
      format:             'AAC ADTS HLS Live',
      uptimeSeconds:      Math.floor((Date.now() - this.startTime) / 1000),
      totalBytesStreamed: this.totalBytesStreamed,
      hlsSegmentsCount:   this.hlsSegments.size
    };
  }
}

module.exports = AudioGenerator;
