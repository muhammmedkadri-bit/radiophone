/**
 * Radiophone — Client App
 *
 * Responsibilities:
 *  1. Power button → start/stop HLS playback
 *  2. Dual-engine playback:
 *     - Native AVPlayer HLS on Safari (iOS & macOS) for native lock-screen LIVE radio
 *     - Hls.js on Chrome / Firefox / Edge / Android for full cross-browser support
 *     - Direct /stream fallback
 *  3. iOS MediaSession → lock screen / Control Center appearance as LIVE RADIO
 *  4. Autoplay watchdog → resume after audio interruptions (calls, notifications)
 */

'use strict';

const powerBtn    = document.getElementById('powerBtn');
const statusLabel = document.getElementById('statusLabel');
const statusDot   = document.getElementById('statusDot');
const footerInfo  = document.getElementById('footerInfo');
const audio       = document.getElementById('radioAudio');

const HLS_URL     = '/hls/live.m3u8';
let hlsInstance   = null;
let wantsPlay     = false;
let isInitialized = false;
let retryTimer    = null;

// ── MediaSession (iOS Control Center / Lock Screen) ──────────────────────────
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title:   'Radiophone',
    artist:  'Canlı Yayın',
    album:   '7.83 Hz Schumann Resonance',
    artwork: [
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' }
    ]
  });

  // Remove seek controls → iOS renders Apple Music "LIVE" badge instead
  ['seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack'].forEach(a => {
    try { navigator.mediaSession.setActionHandler(a, null); } catch (_) {}
  });

  navigator.mediaSession.setActionHandler('play',  () => startRadio());
  navigator.mediaSession.setActionHandler('pause', () => stopRadio());
  navigator.mediaSession.setActionHandler('stop',  () => stopRadio());
}

setupMediaSession();

// ── Stream Initialization (Safari Native vs Hls.js vs Direct) ────────────────
function initStream() {
  if (isInitialized) return;
  isInitialized = true;

  // 1. Safari (iOS & macOS) — Native AVPlayer HLS support
  if (audio.canPlayType('application/vnd.apple.mpegurl')) {
    console.log('[Radiophone] Using native Safari HLS engine');
    audio.src = HLS_URL;
  }
  // 2. Chrome / Firefox / Edge / Android — Hls.js MSE support
  else if (window.Hls && Hls.isSupported()) {
    console.log('[Radiophone] Using Hls.js engine');
    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30
    });
    hlsInstance.loadSource(HLS_URL);
    hlsInstance.attachMedia(audio);

    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      console.warn('[Radiophone] Hls.js error:', data.type, data.details);
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log('[Radiophone] Network error, recovering...');
            hlsInstance.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('[Radiophone] Media error, recovering...');
            hlsInstance.recoverMediaError();
            break;
          default:
            console.log('[Radiophone] Unrecoverable error, destroying and restarting...');
            hlsInstance.destroy();
            hlsInstance = null;
            isInitialized = false;
            if (wantsPlay) setTimeout(startRadio, 2000);
            break;
        }
      }
    });
  }
  // 3. Fallback for any other environment: direct stream
  else {
    console.log('[Radiophone] Using direct stream fallback');
    audio.src = '/stream';
  }
}

// ── Playback Control ─────────────────────────────────────────────────────────
async function startRadio() {
  wantsPlay = true;
  setUI('connecting');
  clearTimeout(retryTimer);

  initStream();

  try {
    const p = audio.play();
    if (p !== undefined) {
      await p;
    }
  } catch (err) {
    console.warn('[Radiophone] play() error:', err.message);
    // If user intended to play, keep connecting state and retry
    if (wantsPlay) {
      retryTimer = setTimeout(() => {
        if (wantsPlay && audio.paused) {
          audio.play().catch(() => {});
        }
      }, 1500);
    }
  }
}

function stopRadio() {
  wantsPlay = false;
  clearTimeout(retryTimer);
  audio.pause();
  setUI('idle');
}

// ── UI State ─────────────────────────────────────────────────────────────────
function setUI(state) {
  if (state === 'active') {
    document.body.classList.add('is-active');
    powerBtn.classList.add('active');
    statusLabel.textContent = '● CANLI YAYINDA';
    footerInfo.textContent  = 'Canlı HLS • 7.83 Hz Schumann';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  } else if (state === 'connecting') {
    statusLabel.textContent = 'BAĞLANILIYOR...';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
  } else {
    document.body.classList.remove('is-active');
    powerBtn.classList.remove('active');
    statusLabel.textContent = 'DOKUN VE BAŞLAT';
    footerInfo.textContent  = 'Canlı HLS • 7.83 Hz';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }
}

// ── Button ───────────────────────────────────────────────────────────────────
powerBtn.addEventListener('click', () => {
  if (!wantsPlay) startRadio();
  else            stopRadio();
});

// ── Audio Element Events ─────────────────────────────────────────────────────
audio.addEventListener('playing', () => {
  if (wantsPlay) setUI('active');
});

audio.addEventListener('pause', () => {
  if (!wantsPlay) setUI('idle');
});

audio.addEventListener('waiting', () => {
  if (wantsPlay && !powerBtn.classList.contains('active')) {
    setUI('connecting');
  }
});

audio.addEventListener('stalled', () => {
  if (wantsPlay) setTimeout(tryResume, 2000);
});

audio.addEventListener('error', (e) => {
  console.warn('[Radiophone] Audio element error:', audio.error);
  if (wantsPlay) {
    setUI('connecting');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (wantsPlay) {
        if (audio.canPlayType('application/vnd.apple.mpegurl')) {
          audio.src = HLS_URL + '?t=' + Date.now();
          audio.load();
        } else if (hlsInstance) {
          hlsInstance.loadSource(HLS_URL + '?t=' + Date.now());
        }
        audio.play().catch(() => {});
      }
    }, 2000);
  }
});

// ── Watchdog: Resume After Interruptions (Calls, Lock Screen, Tab Switch) ─────
async function tryResume() {
  if (!wantsPlay || !audio.paused) return;
  try {
    await audio.play();
  } catch (_) {}
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && wantsPlay) tryResume();
});

window.addEventListener('focus', () => {
  if (wantsPlay) tryResume();
});

window.addEventListener('pageshow', () => {
  if (wantsPlay) tryResume();
});

setInterval(() => {
  if (wantsPlay && audio.paused) tryResume();
}, 3000);
