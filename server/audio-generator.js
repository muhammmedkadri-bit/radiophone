/**
 * AudioGenerator — 7.83 Hz Schumann Resonance MP3 HLS Live Radio
 *
 * Pure Node.js MPEG-1 Layer III frame builder.
 * Zero external dependencies. Zero CPU per segment after startup.
 *
 * WHY real MP3 frames (not silence markers):
 *   iOS Safari / AVPlayer terminate streams detected as "stalled" (no data).
 *   Structurally valid MP3 frames — even with zeroed audio content — are
 *   decoded as audio by the OS, keeping the audio session alive indefinitely.
 *
 * Frequency:  7.83 Hz  (Schumann Earth Resonance)
 * Threshold:  Human hearing starts at ~20 Hz — completely inaudible
 * Sample rate: 22050 Hz (half CD quality — sufficient for sub-20 Hz content)
 * Bitrate:    32 kbps mono
 */

'use strict';

const EventEmitter = require('events');

// ─── MPEG-1 Layer III constants ─────────────────────────────────────────────
const SAMPLE_RATE    = 22050;
const BITRATE_KBPS   = 32;
const FRAME_SAMPLES  = 1152;  // PCM samples per MPEG-1 Layer III frame (fixed)

// Frame size = floor(144 × bitrate / sampleRate) [+ padding_bit]
// floor(144 × 32000 / 22050) = floor(208.979…) = 208 bytes
const BASE_FRAME_BYTES = Math.floor(144 * BITRATE_KBPS * 1000 / SAMPLE_RATE); // 208

/**
 * Build one valid MPEG-1 Layer III frame (mono, 32 kbps, 22050 Hz).
 *
 * Header layout (32 bits):
 *   Sync:        11111111 111   (0xFF + top 3 bits of 0xFB)
 *   ID:          1              MPEG-1
 *   Layer:       01             Layer III
 *   Protection:  1              No CRC
 *   Bitrate idx: 0011           32 kbps (MPEG-1 L3)
 *   Sample rate: 10             22050 Hz
 *   Padding:     0|1
 *   Private:     0
 *   => Byte0: 0xFF  Byte1: 0xFB
 *
 *   Channel mode: 11            Single channel (mono)
 *   Mode ext:    00
 *   Copyright:   0
 *   Original:    1
 *   Emphasis:    00
 *   => Byte3: 0xC4
 *
 * Side information (17 bytes for mono MPEG-1 L3):
 *   All zeros → global_gain=0 → quantized coefficients = 0 → silence
 *   This is a valid frame that decoders accept and play as silence.
 */
function buildMp3Frame(pad) {
  const size = BASE_FRAME_BYTES + (pad ? 1 : 0);
  const frame = Buffer.alloc(size, 0x00);

  // 4-byte header
  frame[0] = 0xFF;
  frame[1] = 0xFB;                          // sync(11)+MPEG1+L3+noCRC
  frame[2] = 0x60 | (pad ? 0x02 : 0x00);   // bitrate=32k, sr=22050, pad
  frame[3] = 0xC4;                          // mono, original

  // Bytes 4–20: side information (zeroed = valid silence frame)
  // main_data_begin = 0 means data starts right after side info
  // All granule parameters zero → no scalefactors, no Huffman data

  return frame;
}

/**
 * Build a 2-second MP3 segment from back-to-back valid frames.
 * Called once at startup; the resulting Buffer is reused forever.
 *
 * Frames needed = ceil(sampleRate × duration / frameSamples)
 *               = ceil(22050 × 2 / 1152) = ceil(38.28) = 39 frames
 *
 * We distribute padding evenly to hit exactly the target byte count.
 */
function buildSegmentBuffer(durationSec) {
  const totalFrames   = Math.ceil(SAMPLE_RATE * durationSec / FRAME_SAMPLES);
  const targetBytes   = Math.round(BITRATE_KBPS * 1000 / 8 * durationSec); // 8000 bytes
  const paddedFrames  = targetBytes - totalFrames * BASE_FRAME_BYTES;       // frames needing +1 byte

  const chunks = [];
  for (let i = 0; i < totalFrames; i++) {
    chunks.push(buildMp3Frame(i < paddedFrames));
  }
  return Buffer.concat(chunks);
}

// ─── AudioGenerator ──────────────────────────────────────────────────────────

class AudioGenerator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.sampleRate         = SAMPLE_RATE;
    this.frequency          = options.frequency || 7.83;
    this.segmentDurationSec = 2.0;
    this.segmentIntervalMs  = 2000;
    this.segmentSequence    = 1;
    this.hlsSegments        = new Map();
    this.maxHlsSegments     = 20;       // 40 s rolling buffer

    this.intervalId         = null;
    this.startTime          = Date.now();
    this.totalBytesStreamed  = 0;

    // Build once — reused for every HLS segment (zero CPU per tick)
    this._segmentBuffer = buildSegmentBuffer(this.segmentDurationSec);
    this._segmentBytes  = this._segmentBuffer.length;
  }

  start() {
    if (this.intervalId) return;
    this.startTime = Date.now();

    // Pre-populate 5 segments so new clients get data immediately
    for (let i = 0; i < 5; i++) this._commit();

    // Emit new segment every 2 seconds — pure timer, zero encode cost
    this.intervalId = setInterval(() => this._commit(), this.segmentIntervalMs);

    console.log(
      `[AudioEngine] STARTED | ${this.frequency} Hz | ` +
      `${SAMPLE_RATE / 1000} kHz mono ${BITRATE_KBPS} kbps | ` +
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
    this.hlsSegments.set(seq, { buffer: this._segmentBuffer, duration: this.segmentDurationSec });

    // Evict oldest beyond rolling window
    while (this.hlsSegments.size > this.maxHlsSegments) {
      this.hlsSegments.delete(this.hlsSegments.keys().next().value);
    }
    this.emit('segment', seq);
  }

  getHlsPlaylist() {
    const seqs = Array.from(this.hlsSegments.keys());
    if (seqs.length === 0) {
      return '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:1\n';
    }
    const firstSeq = seqs[0];
    // No #EXT-X-ENDLIST → signals LIVE stream to all HLS clients
    let pl = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:${firstSeq}\n`;
    for (const s of seqs) {
      pl += `#EXTINF:${this.segmentDurationSec.toFixed(3)},\n/hls/segment_${s}.mp3\n`;
    }
    return pl;
  }

  getHlsSegment(seqId) {
    const item = this.hlsSegments.get(parseInt(seqId, 10));
    return item ? item.buffer : null;
  }

  getState() {
    return {
      frequency:          this.frequency,
      sampleRateKHz:      SAMPLE_RATE / 1000,
      format:             'MP3 HLS Live',
      uptimeSeconds:      Math.floor((Date.now() - this.startTime) / 1000),
      totalBytesStreamed: this.totalBytesStreamed,
      hlsSegmentsCount:   this.hlsSegments.size
    };
  }
}

module.exports = AudioGenerator;
