/**
 * Radiophone — Client App
 *
 * Responsibilities:
 *  1. Power button → start/stop HLS playback
 *  2. iOS MediaSession → lock screen / Control Center appearance as LIVE RADIO
 *  3. Autoplay watchdog → resume after audio interruptions (calls, notifications)
 *  4. Background autoplay → if user was playing, resume when returning to tab
 */

'use strict';

const powerBtn    = document.getElementById('powerBtn');
const statusLabel = document.getElementById('statusLabel');
const statusDot   = document.getElementById('statusDot');
const footerInfo  = document.getElementById('footerInfo');
const audio       = document.getElementById('radioAudio');

let wantsPlay = false;  // user intent — true after pressing Play, false after Stop

// ── MediaSession (iOS Control Center / lock screen) ─────────────────────────
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
  ['seekbackward','seekforward','seekto','previoustrack','nexttrack'].forEach(a => {
    try { navigator.mediaSession.setActionHandler(a, null); } catch (_) {}
  });

  navigator.mediaSession.setActionHandler('play',  () => startRadio());
  navigator.mediaSession.setActionHandler('pause', () => stopRadio());
  navigator.mediaSession.setActionHandler('stop',  () => stopRadio());
}

setupMediaSession();

// ── Playback control ─────────────────────────────────────────────────────────
async function startRadio() {
  wantsPlay = true;
  setUI('connecting');

  // Force reload if network went idle
  if (audio.networkState === HTMLMediaElement.NETWORK_EMPTY ||
      audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
    audio.load();
  }

  try {
    await audio.play();
    // setUI('active') is handled by the 'playing' event listener
  } catch (err) {
    // AutoPlay blocked or interrupted — watchdog will retry
    console.warn('[Radiophone] play() deferred:', err.message);
    setUI('idle');
  }
}

function stopRadio() {
  wantsPlay = false;
  audio.pause();
  setUI('idle');
}

// ── UI state ─────────────────────────────────────────────────────────────────
function setUI(state) {
  if (state === 'active') {
    document.body.classList.add('is-active');
    powerBtn.classList.add('active');
    statusLabel.textContent = '● CANLI YAYINDA';
    footerInfo.textContent  = 'Canlı HLS • 7.83 Hz Schumann';
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  } else if (state === 'connecting') {
    statusLabel.textContent = 'BAĞLANILIYOR...';
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

// ── Audio element events ─────────────────────────────────────────────────────
audio.addEventListener('playing', () => setUI('active'));

audio.addEventListener('pause', () => {
  // Distinguish user-initiated pause from OS interruption
  if (!wantsPlay) setUI('idle');
});

audio.addEventListener('error', () => {
  if (wantsPlay) {
    setUI('connecting');
    setTimeout(tryResume, 2000);
  }
});

audio.addEventListener('stalled', () => {
  if (wantsPlay) setTimeout(tryResume, 3000);
});

audio.addEventListener('waiting', () => {
  if (wantsPlay) setUI('connecting');
});

// ── Watchdog: resume after interruptions ─────────────────────────────────────
async function tryResume() {
  if (!wantsPlay || !audio.paused) return;
  try {
    await audio.play();
  } catch (_) {
    // Will retry via next watchdog tick
  }
}

// Visibility change: user returns to tab / app
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && wantsPlay) tryResume();
});

// Window regains focus (e.g. after notification dismissal)
window.addEventListener('focus', () => { if (wantsPlay) tryResume(); });

// pageshow fires when navigating back (bfcache restore on Safari)
window.addEventListener('pageshow', () => { if (wantsPlay) tryResume(); });

// Periodic watchdog — catches edge cases where events don't fire
setInterval(() => {
  if (wantsPlay && audio.paused) tryResume();
}, 3000);
