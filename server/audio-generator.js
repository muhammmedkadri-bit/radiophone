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
