/**
 * Radiophone — Pure Minimalist Apple HLS Live Radio Console
 */

const powerBtn = document.getElementById('powerBtn');
const statusLabel = document.getElementById('statusLabel');
const footerInfo = document.getElementById('footerInfo');
const radioAudio = document.getElementById('radioAudio');

let shouldBePlaying = false;
let isAudioActive = false;

// Initialize iOS MediaSession Metadata immediately
function initMediaSession() {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Radiophone',
      artist: 'Canlı Radyo',
      album: '7.83 Hz Infrasound',
      artwork: [
        { src: `${window.location.origin}/icon-512.png`, sizes: '512x512', type: 'image/png' },
        { src: `${window.location.origin}/icon-192.png`, sizes: '192x192', type: 'image/png' }
      ]
    });

    // Remove 15s forward/backward skip buttons so iOS displays Apple Music Live Radio layout
    const disabledActions = ['seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack'];
    disabledActions.forEach(action => {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch (e) {}
    });

    navigator.mediaSession.setActionHandler('play', () => startRadio());
    navigator.mediaSession.setActionHandler('pause', () => stopRadio());
    navigator.mediaSession.setActionHandler('stop', () => stopRadio());
  }
}

initMediaSession();

async function startRadio() {
  shouldBePlaying = true;
  statusLabel.textContent = 'BAĞLANILIYOR...';

  try {
    // If the audio element needs to reload
    if (radioAudio.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      radioAudio.load();
    }

    await radioAudio.play();
    setUIActive(true);
  } catch (err) {
    console.warn('Play interrupted or gesture required:', err.message);
    // Keep shouldBePlaying true; watchdog or gesture will continue
  }
}

function stopRadio() {
  shouldBePlaying = false;
  radioAudio.pause();
  setUIActive(false);
}

function setUIActive(active) {
  isAudioActive = active;
  if (active) {
    document.body.classList.add('is-active');
    powerBtn.classList.add('active');
    statusLabel.textContent = '● CANLI YAYINDA';
    footerInfo.textContent = 'Canlı HLS • 7.83 Hz Schumann';
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
      initMediaSession();
    }
  } else {
    document.body.classList.remove('is-active');
    powerBtn.classList.remove('active');
    statusLabel.textContent = 'DOKUN VE BAŞLAT';
    footerInfo.textContent = 'Canlı HLS • Tam Sessiz';
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }
}

powerBtn.addEventListener('click', () => {
  if (!shouldBePlaying) {
    startRadio();
  } else {
    stopRadio();
  }
});

// ----------------------------------------------------
// CONTINUOUS BACKGROUND AUTOPLAY WATCHDOG
// ----------------------------------------------------
async function attemptAutoResume() {
  if (!shouldBePlaying) return;

  if (radioAudio.paused) {
    try {
      await radioAudio.play();
      setUIActive(true);
    } catch (e) {
      // Waiting for audio focus release
    }
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && shouldBePlaying) {
    attemptAutoResume();
  }
});

window.addEventListener('focus', attemptAutoResume);
window.addEventListener('pageshow', attemptAutoResume);

setInterval(() => {
  if (shouldBePlaying && radioAudio.paused) {
    attemptAutoResume();
  }
}, 2000);

radioAudio.addEventListener('playing', () => {
  setUIActive(true);
});

radioAudio.addEventListener('pause', () => {
  if (!shouldBePlaying) {
    setUIActive(false);
  }
});

radioAudio.addEventListener('error', (e) => {
  console.warn('Audio stream error, recovering:', e);
  if (shouldBePlaying) {
    setTimeout(attemptAutoResume, 1500);
  }
});
