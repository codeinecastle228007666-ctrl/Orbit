/* ═══ PTM — Focus Player ═══ */

let audioCtx = null, currentPlayerTrack = null, playerPlaying = false, playerVolume = 0.4;
let playerSources = [], playerPanel = null;
let playerMode = 'synth'; // 'synth' | 'youtube'
let ytPlayer = null, ytReady = false, ytPendingStart = false;

function extractYoutubeId(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function loadYtApi(cb) {
  if (window.YT && window.YT.Player) { cb(); return; }
  if (window._ytLoading) return;
  window._ytLoading = true;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = cb;
}

function initYtPlayer(videoId, callback) {
  const container = playerPanel.querySelector('#fp-yt-container');
  if (!container) return;
  container.innerHTML = '<div id="fp-yt-embed"></div>';
  ytPlayer = new YT.Player('fp-yt-embed', {
    height: '80',
    width: '100%',
    videoId: videoId,
    playerVars: { autoplay: 0, controls: 1, modestbranding: 1, rel: 0, showinfo: 0 },
    events: {
      onReady: () => { ytReady = true; if (ytPendingStart) { ytPlayer.playVideo(); ytPendingStart = false; } if (callback) callback(); },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) {
          playerPlaying = true;
          playerPanel.querySelector('#fp-play').textContent = '⏸️';
          playerPanel.querySelector('#fp-now').textContent = '▶ ' + (ytPlayer.getVideoData().title || 'YouTube');
        } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
          playerPlaying = false;
          playerPanel.querySelector('#fp-play').textContent = '▶️';
          if (e.data === YT.PlayerState.ENDED) playerPanel.querySelector('#fp-now').textContent = '⏹ Завершено';
        }
      }
    }
  });
}

const TRACKS = [
  { id:'lofi1', name:'Lo-fi Chill', icon:'🎵', desc:'Мягкий lo-fi бит', color:'#e0b05c',
    create(ctx, vol) {
      const nodes = [];
      const kickGain = ctx.createGain(); kickGain.gain.value = vol * 0.6; kickGain.connect(ctx.destination);
      const kickTimer = setInterval(() => {
        if (!playerPlaying) { clearInterval(kickTimer); return; }
        const osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.05);
        const g = ctx.createGain(); g.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(g); g.connect(kickGain); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
      }, 1800);
      nodes.push({ type:'interval', ref: kickTimer });
      const padOsc = ctx.createOscillator(); padOsc.type = 'sine'; padOsc.frequency.value = 220;
      const padGain = ctx.createGain(); padGain.gain.value = vol * 0.12;
      padOsc.connect(padGain); padGain.connect(ctx.destination); padOsc.start();
      nodes.push({ type:'osc', ref: padOsc });
      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.03;
      const noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = noiseBuffer; noiseSrc.loop = true;
      const noiseFilter = ctx.createBiquadFilter(); noiseFilter.type = 'highpass'; noiseFilter.frequency.value = 2000;
      const noiseGain = ctx.createGain(); noiseGain.gain.value = vol * 0.04;
      noiseSrc.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(ctx.destination); noiseSrc.start();
      nodes.push({ type:'src', ref: noiseSrc });
      return nodes;
    }
  },
  { id:'whitenoise', name:'Белый шум', icon:'🌊', desc:'Классический белый шум', color:'#a0b4c8',
    create(ctx, vol) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 8000;
      const gain = ctx.createGain(); gain.gain.value = vol * 0.15;
      src.connect(filter); filter.connect(gain); gain.connect(ctx.destination); src.start();
      return [{ type:'src', ref: src }];
    }
  },
  { id:'brownnoise', name:'Коричневый шум', icon:'🌑', desc:'Глубокий басовый шум', color:'#8a7a6a',
    create(ctx, vol) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const data = buffer.getChannelData(0); let last = 0;
      for (let i = 0; i < data.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; data[i] = last * 3.5; }
      const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 400;
      const gain = ctx.createGain(); gain.gain.value = vol * 0.2;
      src.connect(filter); filter.connect(gain); gain.connect(ctx.destination); src.start();
      return [{ type:'src', ref: src }];
    }
  },
  { id:'rain', name:'Дождь', icon:'🌧️', desc:'Успокаивающий шум дождя', color:'#7a9eb8',
    create(ctx, vol) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
      const filterLow = ctx.createBiquadFilter(); filterLow.type = 'lowpass'; filterLow.frequency.value = 600;
      const filterHigh = ctx.createBiquadFilter(); filterHigh.type = 'highpass'; filterHigh.frequency.value = 100;
      const gain = ctx.createGain(); gain.gain.value = vol * 0.3;
      src.connect(filterHigh); filterHigh.connect(filterLow); filterLow.connect(gain); gain.connect(ctx.destination); src.start();
      return [{ type:'src', ref: src }];
    }
  },
  { id:'nature', name:'Лесной ручей', icon:'🌿', desc:'Птицы, вода и ветер', color:'#90b880',
    create(ctx, vol) {
      const nodes = [];
      const waterBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const data = waterBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const waterSrc = ctx.createBufferSource(); waterSrc.buffer = waterBuffer; waterSrc.loop = true;
      const waterFilter = ctx.createBiquadFilter(); waterFilter.type = 'bandpass'; waterFilter.frequency.value = 800; waterFilter.Q.value = 0.8;
      const waterGain = ctx.createGain(); waterGain.gain.value = vol * 0.15;
      waterSrc.connect(waterFilter); waterFilter.connect(waterGain); waterGain.connect(ctx.destination); waterSrc.start();
      nodes.push({ type:'src', ref: waterSrc });
      const birdGain = ctx.createGain(); birdGain.gain.value = vol * 0.1; birdGain.connect(ctx.destination);
      const birdTimer = setInterval(() => {
        if (!playerPlaying) { clearInterval(birdTimer); return; }
        if (Math.random() > 0.6) {
          const freq = 800 + Math.random() * 2000;
          const osc = ctx.createOscillator(); osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          osc.frequency.setValueAtTime(freq * 1.3, ctx.currentTime + 0.05);
          osc.frequency.setValueAtTime(freq * 0.9, ctx.currentTime + 0.1);
          const g = ctx.createGain(); g.gain.setValueAtTime(vol * 0.04, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
          osc.connect(g); g.connect(birdGain); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        }
      }, 3000);
      nodes.push({ type:'interval', ref: birdTimer });
      return nodes;
    }
  },
  { id:'ocean', name:'Океанские волны', icon:'🌊', desc:'Ритмичный шум прибоя', color:'#6a9ab5',
    create(ctx, vol) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 8, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        const wave = Math.pow(Math.sin(t * 0.15 * Math.PI * 2) * 0.5 + 0.5, 2);
        data[i] = (Math.random() * 2 - 1) * wave;
      }
      const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1500;
      const gain = ctx.createGain(); gain.gain.value = vol * 0.3;
      src.connect(filter); filter.connect(gain); gain.connect(ctx.destination); src.start();
      return [{ type:'src', ref: src }];
    }
  },
  { id:'fireplace', name:'Камин', icon:'🔥', desc:'Треск дров и тепло огня', color:'#e8833a',
    create(ctx, vol) {
      const nodes = [];
      const crackleBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const cd = crackleBuf.getChannelData(0);
      for (let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1;
      const crackleSrc = ctx.createBufferSource(); crackleSrc.buffer = crackleBuf; crackleSrc.loop = true;
      const cFilt = ctx.createBiquadFilter(); cFilt.type = 'highpass'; cFilt.frequency.value = 800;
      const cGain = ctx.createGain(); cGain.gain.value = vol * 0.2;
      crackleSrc.connect(cFilt); cFilt.connect(cGain); cGain.connect(ctx.destination); crackleSrc.start();
      nodes.push({ type:'src', ref: crackleSrc });
      const rumbleOsc = ctx.createOscillator(); rumbleOsc.type = 'triangle'; rumbleOsc.frequency.value = 55;
      const rumbleGain = ctx.createGain(); rumbleGain.gain.value = vol * 0.06;
      rumbleOsc.connect(rumbleGain); rumbleGain.connect(ctx.destination); rumbleOsc.start();
      nodes.push({ type:'osc', ref: rumbleOsc });
      return nodes;
    }
  },
];

function buildPlayerPanel() {
  if (playerPanel) return;
  playerPanel = document.createElement('div');
  playerPanel.id = 'focus-player';
  playerPanel.innerHTML = `<div class="fp-header"><span>🎧 Фокус-плеер</span><div><button id="fp-mini-btn" style="background:none;border:none;color:var(--text-secondary);font-size:18px;cursor:pointer;padding:0 6px">−</button><button id="fp-close-btn" style="background:none;border:none;color:var(--text-secondary);font-size:16px;cursor:pointer">×</button></div></div>
    <div id="fp-visualizer">${'<div class="vis-bar"></div>'.repeat(20)}</div>
    <div class="fp-tracks" id="fp-tracks"></div>
    <div id="fp-yt-row" style="display:flex;gap:6px;padding:4px 0;margin-bottom:6px">
      <input id="fp-yt-input" type="text" placeholder="YouTube URL..." style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-tertiary);color:var(--text-primary);font-size:11px;font-family:inherit;outline:none">
      <button id="fp-yt-btn" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-tertiary);color:var(--text-secondary);cursor:pointer;font-size:11px">▶</button>
    </div>
    <div id="fp-yt-container" style="margin-bottom:6px;border-radius:8px;overflow:hidden;display:none"></div>
    <div class="fp-controls">
      <button id="fp-prev">⏮</button>
      <button id="fp-play" style="background:var(--accent);color:#1a1815;font-weight:600;flex:1">▶️</button>
      <button id="fp-next">⏭</button>
      <input type="range" id="fp-volume" min="0" max="100" value="40" class="fp-volume">
    </div>
    <div class="fp-now-playing" id="fp-now">Выберите трек</div>`;
  document.body.appendChild(playerPanel);

  const tracksEl = playerPanel.querySelector('#fp-tracks');
  TRACKS.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'fp-track-row';
    row.innerHTML = `<span style="font-size:18px">${t.icon}</span><span style="flex:1">${t.name}</span>`;
    row.onclick = () => playTrack(i);
    tracksEl.appendChild(row);
  });

  // YouTube input
  playerPanel.querySelector('#fp-yt-btn').onclick = () => loadYoutubeUrl();
  playerPanel.querySelector('#fp-yt-input').addEventListener('keydown', e => { if (e.key === 'Enter') loadYoutubeUrl(); });

  playerPanel.querySelector('#fp-prev').onclick = () => { if (playerMode === 'youtube') return; const idx = (currentPlayerTrack || 0) - 1 + TRACKS.length; playTrack(idx % TRACKS.length); };
  playerPanel.querySelector('#fp-play').onclick = togglePlay;
  playerPanel.querySelector('#fp-next').onclick = () => { if (playerMode === 'youtube') return; const idx = (currentPlayerTrack || 0) + 1; playTrack(idx % TRACKS.length); };
  playerPanel.querySelector('#fp-volume').oninput = function () { setVolume(parseInt(this.value) / 100); };
  playerPanel.querySelector('#fp-close-btn').onclick = () => {
    stopAudio();
    playerMode = 'synth';
    ytPlayer = null; ytReady = false; ytPendingStart = false;
    const c = playerPanel.querySelector('#fp-yt-container');
    if (c) { c.style.display = 'none'; c.innerHTML = ''; }
    const vis = playerPanel.querySelector('#fp-visualizer');
    if (vis) vis.style.display = 'flex';
    playerPanel.style.display = 'none';
  };
  playerPanel.querySelector('#fp-mini-btn').onclick = () => { playerPanel.classList.toggle('mini'); };
  playerPanel.style.display = 'none';
  startVisualizer();
}

function loadYoutubeUrl() {
  const input = playerPanel.querySelector('#fp-yt-input');
  const url = input.value.trim();
  const vid = extractYoutubeId(url);
  if (!vid) { showToast('Неверная YouTube ссылка', 'error'); return; }
  stopAudio();
  playerMode = 'youtube';
  const container = playerPanel.querySelector('#fp-yt-container');
  container.style.display = 'block';
  playerPanel.querySelector('#fp-visualizer').style.display = 'none';
  playerPanel.querySelectorAll('.fp-track-row').forEach(r => { r.style.background = 'var(--bg-tertiary)'; r.style.borderColor = 'var(--border-soft)'; });
  loadYtApi(() => initYtPlayer(vid));
  playerPanel.querySelector('#fp-play').textContent = '▶️';
  playerPanel.querySelector('#fp-now').textContent = '⏳ Загрузка YouTube...';
  showToast('🎬 YouTube загружается', 'success');
}

function stopAudio() {
  if (playerMode === 'youtube' && ytPlayer && ytReady) {
    try { ytPlayer.pauseVideo(); } catch (_) {}
    ytPendingStart = false;
  }
  playerPlaying = false;
  playerSources.forEach(node => {
    try {
      if (node.type === 'interval') clearInterval(node.ref);
      else if (node.ref && typeof node.ref.stop === 'function') { node.ref.stop(); }
    } catch (_) {}
  });
  playerSources = [];
  if (audioCtx && audioCtx.state !== 'closed') { try { audioCtx.close(); } catch (_) {} }
  audioCtx = null;
}

function playTrack(index) {
  playerMode = 'synth';
  const container = playerPanel.querySelector('#fp-yt-container');
  if (container) { container.style.display = 'none'; container.innerHTML = ''; }
  const vis = playerPanel.querySelector('#fp-visualizer');
  if (vis) vis.style.display = 'flex';
  ytPlayer = null; ytReady = false; ytPendingStart = false;

  stopAudio();
  playerPlaying = true;
  currentPlayerTrack = index;
  const track = TRACKS[index];
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    playerSources = track.create(audioCtx, playerVolume);
    playerPanel.querySelector('#fp-play').textContent = '⏸️';
    playerPanel.querySelector('#fp-now').textContent = '🔊 ' + track.name + ' · ' + track.desc;
    playerPanel.querySelectorAll('.fp-track-row').forEach((r, i) => {
      r.style.background = i === index ? 'var(--accent-soft)' : 'var(--bg-tertiary)';
      r.style.borderColor = i === index ? 'var(--accent)' : 'var(--border-soft)';
    });
  } catch (e) { playerPlaying = false; }
}

function togglePlay() {
  if (playerMode === 'youtube') {
    if (!ytPlayer || !ytReady) return;
    if (playerPlaying) { ytPlayer.pauseVideo(); }
    else { ytPlayer.playVideo(); }
    return;
  }
  if (currentPlayerTrack === null) { playTrack(0); return; }
  if (playerPlaying) { stopAudio(); playerPanel.querySelector('#fp-play').textContent = '▶️'; playerPanel.querySelector('#fp-now').textContent = '⏸ Пауза'; }
  else { playTrack(currentPlayerTrack); }
}

function setVolume(v) {
  playerVolume = Math.max(0, Math.min(1, v));
  if (playerMode === 'synth' && playerPlaying && currentPlayerTrack !== null) {
    const idx = currentPlayerTrack;
    playerPlaying = false;
    playerSources.forEach(node => {
      try {
        if (node.type === 'interval') clearInterval(node.ref);
        else if (node.ref && typeof node.ref.stop === 'function') { node.ref.stop(); }
      } catch (_) {}
    });
    playerSources = [];
    playerPlaying = true;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      playerSources = TRACKS[idx].create(audioCtx, playerVolume);
    } catch (e) { playerPlaying = false; }
  }
  // YouTube volume handled by iframe player controls
}

let visAnimFrame = null;
function startVisualizer() {
  function animate() {
    const bars = document.querySelectorAll('#fp-visualizer .vis-bar');
    if (!bars.length || !playerPanel || playerPanel.style.display === 'none') { visAnimFrame = null; return; }
    bars.forEach((bar, i) => {
      if (playerPlaying && playerMode === 'synth') {
        const base = 4 + Math.random() * 6;
        const beat = Math.sin(Date.now() * 0.003 + i * 0.4) * 0.5 + 0.5;
        bar.style.height = (base + beat * (16 + Math.random() * 8)) + 'px';
        bar.style.background = TRACKS[currentPlayerTrack]?.color || 'var(--accent)';
        bar.style.opacity = '0.6';
      } else {
        bar.style.height = (playerMode === 'youtube' ? 0 : 2 + Math.sin(Date.now() * 0.001 + i * 0.3)) + 'px';
        bar.style.background = 'var(--text-tertiary)';
        bar.style.opacity = '0.3';
      }
    });
    visAnimFrame = requestAnimationFrame(animate);
  }
  visAnimFrame = requestAnimationFrame(animate);
}
