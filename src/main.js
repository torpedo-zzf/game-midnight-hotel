import { initialState, update } from './story.js';

const $ = (selector) => document.querySelector(selector);
const stage = $('#stage');
const startButton = $('#startButton');
const assets = ['./assets/room.png', './assets/mira.png'];
let state = initialState();
let settingsOpen = false;
let confirmOpen = false;
let muted = false;
let audioContext;
let masterGain;
let rainSource;
let lastFrame = performance.now();
let renderedPanel = null;
let currentVoiceId = null;
const voice = new Audio();
voice.preload = 'auto';

function dispatch(action) {
  const previous = state;
  state = update(state, action);
  if (!previous.knockHeard && state.knockHeard) playKnock();
  if (action.type === 'PAUSE') {
    audioContext?.suspend();
    voice.pause();
  }
  if (action.type === 'RESUME' || action.type === 'RESTART') {
    audioContext?.resume();
    if (action.type === 'RESUME' && state.lineId) voice.play().catch(() => {});
    if (action.type === 'RESTART') currentVoiceId = null;
  }
  render();
}

function preflight() {
  return Promise.all(assets.map((src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = () => reject(new Error(`无法加载 ${src}`));
    image.src = src;
  })));
}

async function begin() {
  startButton.disabled = true;
  $('#assetStatus').hidden = false;
  $('#assetStatus').textContent = '正在准备房间…';
  try {
    await preflight();
    $('#assetStatus').hidden = true;
    settingsOpen = false;
    confirmOpen = false;
    startAudio();
    currentVoiceId = null;
    dispatch({ type: 'START' });
  } catch {
    $('#assetStatus').textContent = '场景素材加载失败。请检查网络或文件后重试。';
  } finally {
    startButton.disabled = false;
  }
}

function startAudio() {
  try {
    audioContext ||= new AudioContext();
    if (!masterGain) {
      masterGain = audioContext.createGain();
      masterGain.connect(audioContext.destination);
      const seconds = 8;
      const size = Math.round(audioContext.sampleRate * seconds);
      const buffer = audioContext.createBuffer(1, size, audioContext.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < size; i++) samples[i] = (Math.random() * 2 - 1) * .18;
      // Make the noise loop continuous at its join.
      const blend = Math.round(audioContext.sampleRate * .25);
      for (let i = 0; i < blend; i++) {
        const t = i / blend;
        samples[i] = samples[i] * t + samples[size - blend + i] * (1 - t);
      }
      const lowpass = audioContext.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 850;
      lowpass.connect(masterGain);
      rainSource = audioContext.createBufferSource();
      rainSource.buffer = buffer;
      rainSource.loop = true;
      rainSource.connect(lowpass);
      rainSource.start();
    }
    updateVolume();
    audioContext.resume();
  } catch {
    // The visual prototype remains playable if Web Audio is unavailable.
  }
}

function playKnock() {
  if (!audioContext || muted || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  for (const offset of [0, .22, .52]) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(115, now + offset);
    oscillator.frequency.exponentialRampToValueAtTime(62, now + offset + .13);
    gain.gain.setValueAtTime(.001, now + offset);
    gain.gain.exponentialRampToValueAtTime(.16, now + offset + .008);
    gain.gain.exponentialRampToValueAtTime(.001, now + offset + .18);
    oscillator.connect(gain).connect(masterGain);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + .2);
  }
}

function updateVolume() {
  if (masterGain) masterGain.gain.value = muted ? 0 : Number($('#volume').value) / 100;
  voice.muted = muted;
  $('#volumeValue').textContent = `${$('#volume').value}%`;
  $('#muteButton').textContent = muted ? '×' : '♪';
  $('#muteButton').setAttribute('aria-label', muted ? '取消静音' : '静音');
}

function syncVoice() {
  if (currentVoiceId === state.lineId) return;
  currentVoiceId = state.lineId;
  voice.pause();
  if (!state.lineId) return;
  voice.src = `./assets/voice/${state.lineId}.m4a`;
  voice.currentTime = 0;
  voice.play().catch(() => {});
}

function addAction(container, label, handler, primary = false) {
  const button = document.createElement('button');
  button.className = primary ? 'primary-button' : 'secondary-button';
  button.textContent = label;
  button.addEventListener('click', handler);
  container.append(button);
}

function renderPanel() {
  const layer = $('#panelLayer');
  layer.hidden = !state.panel || state.paused || settingsOpen;
  if (layer.hidden) {
    renderedPanel = null;
    return;
  }
  const panelKey = state.panel === 'photo' ? `photo:${state.photoMessageRead}` : state.panel;
  if (renderedPanel === panelKey) return;
  renderedPanel = panelKey;
  const actions = $('#panelActions');
  const visual = $('#panelVisual');
  actions.replaceChildren();
  visual.replaceChildren();
  visual.className = 'panel-visual';
  if (state.panel === 'photo') {
    $('#panelEyebrow').textContent = '线索 · 旧照片';
    $('#panelTitle').textContent = state.photoMessageRead ? '照片背面' : '七年前的合影';
    if (state.photoMessageRead) {
      visual.classList.add('photo-back');
      visual.textContent = '307，别相信敲门的人。';
      $('#panelBody').textContent = '你翻到背面，墨迹像是刚写下不久。Mira 看见这行字时，脸色变了。';
    } else {
      visual.classList.add('photo-front');
      const image = document.createElement('img');
      image.src = './assets/photo.jpg';
      image.alt = '七年前的酒店员工合影，Mira 站在最右侧';
      visual.append(image);
      $('#panelBody').textContent = 'Mira 站在合影最右边。照片边角有反复翻动的痕迹。';
      addAction(actions, '翻看背面', () => dispatch({ type: 'FLIP_PHOTO' }), true);
    }
    addAction(actions, '收起照片', () => dispatch({ type: 'CLOSE_PANEL' }), state.photoMessageRead);
  } else if (state.panel === 'window') {
    $('#panelEyebrow').textContent = '观察 · 雨夜';
    $('#panelTitle').textContent = '楼下的人影';
    visual.classList.add('window-view');
    $('#panelBody').textContent = '你擦去窗上的水雾。一个穿雨衣的人站在楼下，正抬头望向 307 房间。';
    addAction(actions, '回到房间', () => dispatch({ type: 'CLOSE_PANEL' }), true);
  } else {
    $('#panelEyebrow').textContent = '选择 · 房门';
    $('#panelTitle').textContent = '门外有人';
    $('#panelBody').textContent = state.photoMessageRead ? '你知道照片背面的警告，也听见了门外的人。现在怎么办？' : '敲门声停了一瞬。Mira 紧张地看着你。';
    addAction(actions, '开门', () => dispatch({ type: 'DECIDE', choice: 'open' }), true);
    addAction(actions, '暂不开门', () => dispatch({ type: 'DECIDE', choice: 'wait' }));
    addAction(actions, '再想想', () => dispatch({ type: 'CLOSE_PANEL' }));
  }
}

function render() {
  for (const phase of ['title', 'intro', 'explore', 'knock', 'resolution', 'ending']) stage.classList.toggle(`phase-${phase}`, state.phase === phase);
  stage.classList.toggle('ending-open', state.ending === 'open');
  stage.classList.toggle('ending-wait', state.ending === 'wait');
  stage.classList.toggle('paused', state.paused);
  stage.classList.toggle('panel-open', Boolean(state.panel) && !state.paused);
  stage.classList.toggle('reduced-motion', $('#reducedMotion').checked);
  $('#titleScreen').hidden = state.started;
  $('#hud').hidden = !state.started;
  $('#objective').textContent = state.phase === 'explore' ? '观察房间 · 寻找线索' : state.phase === 'knock' ? '有人敲门 · 检查房门' : '';
  $('#interactionHint').hidden = state.phase !== 'explore' || state.panel !== null || state.paused;
  $('#subtitle').hidden = !state.started || !state.line || state.paused || state.phase === 'ending';
  $('#subtitleSpeaker').textContent = state.speaker;
  $('#subtitleLine').textContent = state.line;
  $('#mira').className = `mira ${state.mood}`;
  for (const hotspot of document.querySelectorAll('.hotspot')) {
    hotspot.disabled = !['explore', 'knock'].includes(state.phase) || state.paused || Boolean(state.panel);
    hotspot.hidden = !state.started || ['resolution', 'ending'].includes(state.phase);
  }
  syncVoice();
  renderPanel();
  $('#pauseLayer').hidden = !(state.paused || settingsOpen) || confirmOpen;
  $('#pauseTitle').textContent = state.started ? '暂停' : '设置';
  $('#resumeButton').textContent = state.started ? '继续体验' : '返回首页';
  $('#restartButton').hidden = !state.started;
  $('#confirmLayer').hidden = !confirmOpen;
  $('#endingLayer').hidden = state.phase !== 'ending';
  if (state.phase === 'ending') {
    $('#endingTitle').textContent = state.ending === 'open' ? '门后的真相' : '沉默的选择';
    $('#endingBody').textContent = state.line;
  }
}

function frame(time) {
  const seconds = (time - lastFrame) / 1000;
  lastFrame = time;
  if (state.started && !state.paused && state.phase !== 'ending') {
    const next = update(state, { type: 'TICK', seconds });
    const previous = state;
    state = next;
    if (!previous.knockHeard && next.knockHeard) playKnock();
    if (previous.phase !== next.phase || previous.lineId !== next.lineId || previous.line !== next.line) render();
  }
  requestAnimationFrame(frame);
}

startButton.addEventListener('click', begin);
$('#titleSettingsButton').addEventListener('click', () => { settingsOpen = true; render(); });
$('#pauseButton').addEventListener('click', () => dispatch({ type: 'PAUSE' }));
$('#muteButton').addEventListener('click', () => { muted = !muted; updateVolume(); });
$('#resumeButton').addEventListener('click', () => {
  if (settingsOpen) { settingsOpen = false; render(); }
  else dispatch({ type: 'RESUME' });
});
$('#restartButton').addEventListener('click', () => { confirmOpen = true; render(); });
$('#cancelRestartButton').addEventListener('click', () => { confirmOpen = false; render(); });
$('#confirmRestartButton').addEventListener('click', () => { confirmOpen = false; dispatch({ type: 'RESTART' }); });
$('#endingRestartButton').addEventListener('click', () => dispatch({ type: 'RESTART' }));
$('#volume').addEventListener('input', updateVolume);
$('#subtitleSize').addEventListener('input', () => {
  $('#subtitleSizeValue').textContent = $('#subtitleSize').value;
  stage.style.setProperty('--subtitle-size', `${$('#subtitleSize').value}px`);
});
$('#reducedMotion').addEventListener('change', render);
for (const hotspot of document.querySelectorAll('.hotspot')) hotspot.addEventListener('click', () => dispatch({ type: hotspot.dataset.action }));
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (confirmOpen) { confirmOpen = false; render(); }
  else if (settingsOpen) { settingsOpen = false; render(); }
  else if (state.paused) dispatch({ type: 'RESUME' });
  else if (state.panel) dispatch({ type: 'CLOSE_PANEL' });
  else if (state.started && state.phase !== 'ending') dispatch({ type: 'PAUSE' });
});
stage.addEventListener('pointermove', (event) => {
  if (!state.started || $('#reducedMotion').checked) return;
  const bounds = stage.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - .5;
  const y = (event.clientY - bounds.top) / bounds.height - .5;
  $('#world').style.setProperty('--look-x', `${(-x * 1.4).toFixed(3)}%`);
  $('#world').style.setProperty('--look-y', `${(-y * 1.2).toFixed(3)}%`);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.started && !state.paused && state.phase !== 'ending') dispatch({ type: 'PAUSE' });
});
render();
requestAnimationFrame(frame);
