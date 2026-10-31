import './style.css';
import { Game } from './game/game';
import { MARATHON, MODES, modeById, type Mode } from './game/modes';
import { formatRecord, hudStats, resultText } from './hud';
import { InputController } from './input';
import { isBetter, loadModeId, loadRecord, resultValue, saveModeId, saveRecord } from './records';
import { Renderer } from './render';
import { LayoutDrag, TouchRouter, nearestAction, type ControlEvent, type Viewport } from './touch';
import {
  ACTIONS,
  defaultButtons,
  defaultSettings,
  loadSettings,
  saveSettings,
  type Action,
} from './settings';

type Screen = 'menu' | 'playing' | 'paused' | 'over';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

let settings = loadSettings();
let mode: Mode = modeById(loadModeId()) ?? MARATHON;
let best = loadRecord(mode);
let game: Game | null = null;
let screen: Screen = 'menu';
/** Overlay to return to when leaving the settings panel. */
let settingsReturn: 'menu' | 'pause' = 'menu';
let editing = false;

const renderer = new Renderer($<HTMLCanvasElement>('#board'));
const input = new InputController(() => game, () => settings);

// ------------------------------------------------------------------ controls

const ICONS: Record<Action, string> = {
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  soft: '<svg viewBox="0 0 24 24"><path d="M5 9l7 7 7-7"/></svg>',
  hard: '<svg viewBox="0 0 24 24"><path d="M5 5l7 7 7-7M5 12l7 7 7-7"/></svg>',
  rotL: '<svg viewBox="0 0 24 24"><path d="M4 4v6h6"/><path d="M5.5 15a7.5 7.5 0 1 0 1.8-7.8L4 10"/></svg>',
  rotR: '<svg viewBox="0 0 24 24"><path d="M20 4v6h-6"/><path d="M18.5 15a7.5 7.5 0 1 1-1.8-7.8L20 10"/></svg>',
  hold: 'HOLD',
};

const LABELS: Record<Action, string> = {
  left: 'Move left',
  right: 'Move right',
  soft: 'Soft drop',
  hard: 'Hard drop',
  rotL: 'Rotate left',
  rotR: 'Rotate right',
  hold: 'Hold',
};

const buttonEls = {} as Record<Action, HTMLElement>;
let selected: Action = 'rotR';

const viewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });
const touches = new TouchRouter(() => settings.buttons, viewport);
const layoutDrag = new LayoutDrag(() => settings.buttons, viewport);

function placeButtons(): void {
  for (const a of ACTIONS) {
    const el = buttonEls[a];
    const b = settings.buttons[a];
    el.style.left = `${b.x * 100}%`;
    el.style.top = `${b.y * 100}%`;
    el.classList.toggle('selected', editing && a === selected);
  }
  if (editing) drawZones();
}

const ZONE_COLORS: Record<Action, string> = {
  left: '#4c8dff',
  right: '#31c7ef',
  soft: '#42b642',
  hard: '#ef7921',
  rotL: '#ad4d9c',
  rotR: '#ef2029',
  hold: '#f7d308',
};

/** Shades the screen by which action a touch there would trigger (editor only). */
function drawZones(): void {
  const canvas = $<HTMLCanvasElement>('#zones');
  const step = 8;
  const view = viewport();
  const w = Math.ceil(view.width / step);
  const h = Math.ceil(view.height / step);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = ZONE_COLORS[nearestAction(settings.buttons, view, (x + 0.5) * step, (y + 0.5) * step)];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function buildControls(): void {
  // The whole screen is one touch surface; markers only show where each action sits.
  const root = $('#controls');
  for (const a of ACTIONS) {
    const el = document.createElement('div');
    el.className = 'ctl';
    el.dataset.control = a;
    el.innerHTML = ICONS[a];
    root.appendChild(el);
    buttonEls[a] = el;
  }
  root.addEventListener('pointerdown', onPointerDown);
  // Cancelling touchstart stops Android's long-press handling (and its haptic
  // buzz); pointer events still arrive.
  root.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  // Move/up/cancel are tracked on window so a finger that slides anywhere still releases.
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);
  placeButtons();
}

function onPointerDown(e: PointerEvent): void {
  e.preventDefault();
  if (editing) {
    selected = layoutDrag.start(e.pointerId, e.clientX, e.clientY);
    syncLayoutBar();
    placeButtons();
    return;
  }
  apply(touches.down(e.pointerId, e.clientX, e.clientY));
}

function onPointerMove(e: PointerEvent): void {
  if (layoutDrag.move(e.pointerId, e.clientX, e.clientY)) {
    placeButtons();
    return;
  }
  apply(touches.move(e.pointerId, e.clientX, e.clientY));
}

function onPointerUp(e: PointerEvent): void {
  if (layoutDrag.end(e.pointerId)) {
    saveSettings(settings);
    return;
  }
  apply(touches.up(e.pointerId));
}

function apply(events: ControlEvent[]): void {
  for (const { type, action } of events) {
    buttonEls[action].classList.toggle('down', type === 'press');
    if (type === 'press') input.press(action);
    else input.release(action);
  }
}

function releaseAllButtons(): void {
  apply(touches.releaseAll());
  input.releaseAll();
}

// ------------------------------------------------------------------ screens

const overlays = ['menu', 'pause', 'over', 'settings'] as const;
type Overlay = (typeof overlays)[number];

function showOverlay(name: Overlay | null): void {
  for (const o of overlays) $(`#${o}`).hidden = o !== name;
}

function setScreen(s: Screen): void {
  screen = s;
  document.body.classList.toggle('playing', s === 'playing');
  if (s !== 'playing') releaseAllButtons();
  if (s === 'menu') {
    syncMenu();
    showOverlay('menu');
  } else if (s === 'paused') {
    showOverlay('pause');
  } else if (s === 'over') {
    showOverlay('over');
  } else {
    showOverlay(null);
  }
  syncUpdateBanner();
}

function buildModeButtons(): void {
  const root = $('#modes');
  for (const m of MODES) {
    const el = document.createElement('button');
    el.dataset.mode = m.id;
    el.textContent = m.name;
    el.addEventListener('click', () => selectMode(m));
    root.appendChild(el);
  }
}

function selectMode(m: Mode): void {
  mode = m;
  best = loadRecord(mode);
  saveModeId(mode.id);
  syncMenu();
}

function syncMenu(): void {
  for (const el of document.querySelectorAll<HTMLElement>('#modes [data-mode]')) {
    el.setAttribute('aria-pressed', String(el.dataset.mode === mode.id));
  }
  $('#menu-summary').textContent = mode.summary;
  $('#menu-best-row').hidden = mode.record === 'none';
  $('#menu-best').textContent = formatRecord(mode.record, best);
}

function startGame(): void {
  releaseAllButtons();
  game = new Game({ mode });
  setScreen('playing');
}

function pause(): void {
  if (screen === 'playing') setScreen('paused');
}

function finish(g: Game): void {
  const value = resultValue(g);
  const isBest = value !== null && isBetter(g.mode.record, value, best);
  if (isBest) {
    best = value;
    saveRecord(g.mode, value);
  }
  const text = resultText(g);
  $('#over-title').textContent = text.title;
  $('#over-label').textContent = text.label;
  $('#over-score').textContent = text.value;
  $('#over-best').textContent = isBest
    ? 'New best!'
    : best === null
      ? ''
      : `Best: ${formatRecord(g.mode.record, best)}`;
  setScreen('over');
}

function enterFullscreen(): void {
  const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
  if (standalone || document.fullscreenElement) return;
  document.documentElement
    .requestFullscreen?.({ navigationUI: 'hide' })
    .then(() => (window.screen.orientation as ScreenOrientation & { lock?(o: string): Promise<void> }).lock?.('landscape'))
    .catch(() => {
      // Fullscreen / orientation lock are best effort.
    });
}

// ------------------------------------------------------------------ settings

const dasInput = $<HTMLInputElement>('#set-das');
const arrInput = $<HTMLInputElement>('#set-arr');
const sdfInput = $<HTMLSelectElement>('#set-sdf');
const nextInput = $<HTMLInputElement>('#set-next');
const ghostInput = $<HTMLInputElement>('#set-ghost');

function syncSettingsForm(): void {
  dasInput.value = String(settings.das);
  arrInput.value = String(settings.arr);
  sdfInput.value = String(settings.sdf);
  nextInput.value = String(settings.nextCount);
  ghostInput.checked = settings.ghost;
  $('#out-das').textContent = `${settings.das}ms`;
  $('#out-arr').textContent = `${settings.arr}ms`;
  $('#out-next').textContent = String(settings.nextCount);
}

function readSettingsForm(): void {
  settings.das = Number(dasInput.value);
  settings.arr = Number(arrInput.value);
  settings.sdf = Number(sdfInput.value);
  settings.nextCount = Number(nextInput.value);
  settings.ghost = ghostInput.checked;
  saveSettings(settings);
  syncSettingsForm();
}

for (const el of [dasInput, arrInput, sdfInput, nextInput, ghostInput]) {
  el.addEventListener('input', readSettingsForm);
}

function openSettings(from: 'menu' | 'pause'): void {
  settingsReturn = from;
  syncSettingsForm();
  showOverlay('settings');
}

function syncLayoutBar(): void {
  $('#layout-hint').textContent = `Selected: ${LABELS[selected]}`;
}

function setEditing(on: boolean): void {
  editing = on;
  document.body.classList.toggle('editing', on);
  $('#layout-bar').hidden = !on;
  if (on) {
    showOverlay(null);
    syncLayoutBar();
  } else {
    showOverlay('settings');
  }
  placeButtons();
}

// ------------------------------------------------------------------ wiring

document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  switch (target.dataset.action) {
    case 'start':
      enterFullscreen();
      startGame();
      break;
    case 'resume':
      setScreen('playing');
      break;
    case 'restart':
      startGame();
      break;
    case 'quit':
      game = null;
      setScreen('menu');
      break;
    case 'settings':
      openSettings(screen === 'paused' ? 'pause' : 'menu');
      break;
    case 'back':
      showOverlay(settingsReturn);
      break;
    case 'reset-settings':
      settings = { ...defaultSettings(), buttons: settings.buttons };
      saveSettings(settings);
      syncSettingsForm();
      break;
    case 'layout':
      setEditing(true);
      break;
    case 'layout-reset':
      settings.buttons = defaultButtons();
      saveSettings(settings);
      syncLayoutBar();
      placeButtons();
      break;
    case 'layout-done':
      setEditing(false);
      break;
    case 'reload':
      location.reload();
      break;
  }
});

$('#pause-btn').addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
$('#pause-btn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pause();
});

// Auto-pause when the app is hidden, loses focus or is turned to portrait.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('blur', pause);
const portrait = matchMedia('(orientation: portrait)');
portrait.addEventListener('change', () => {
  if (portrait.matches) pause();
});

window.addEventListener('resize', () => {
  renderer.resize();
  placeButtons();
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------------ loop

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(now - last, 100);
  last = now;
  if (screen === 'playing' && game) {
    game.setSoftDropFactor(settings.sdf === 0 ? Infinity : settings.sdf);
    input.update(dt);
    game.update(dt);
    if (game.status !== 'playing') finish(game);
  }
  renderer.draw(game, {
    ghost: settings.ghost,
    nextCount: settings.nextCount,
    stats: hudStats(game?.mode ?? mode, game, best),
  });
  requestAnimationFrame(frame);
}

// Window into the game for the browser tests (tests/e2e).
if (new URLSearchParams(location.search).has('e2e')) {
  Object.assign(window, { __blocks: { game: () => game, screen: () => screen } });
}

buildControls();
buildModeButtons();
renderer.resize();
setScreen('menu');
requestAnimationFrame(frame);

// ------------------------------------------------------------------ updates

let updateReady = false;

/** The update banner never covers the field mid-game; it waits for a pause or menu. */
function syncUpdateBanner(): void {
  $('#update').hidden = !updateReady || screen === 'playing';
}

async function setupServiceWorker(): Promise<void> {
  const sw = navigator.serviceWorker;
  // A page that was already controlled is running the old release when a new
  // worker takes over; a first install is not an update.
  const hadController = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (!hadController) return;
    updateReady = true;
    syncUpdateBanner();
  });
  const reg = await sw.register('./sw.js', { updateViaCache: 'none' });
  const check = () => reg.update().catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
  setInterval(check, 30 * 60 * 1000);
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  setupServiceWorker().catch(() => {
    // Offline support is optional.
  });
}
