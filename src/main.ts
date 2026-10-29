import './style.css';
import { Game } from './game/game';
import { InputController } from './input';
import { Renderer } from './render';
import {
  ACTIONS,
  defaultButtons,
  defaultSettings,
  loadBest,
  loadSettings,
  saveBest,
  saveSettings,
  type Action,
} from './settings';

type Screen = 'menu' | 'playing' | 'paused' | 'over';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

let settings = loadSettings();
let best = loadBest();
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
const pointerAction = new Map<number, Action>();
let selected: Action = 'rotR';
let drag: { id: number; action: Action; dx: number; dy: number } | null = null;

/** Actions a finger may slide between while held (like a D-pad). */
const SLIDE_ACTIONS: readonly Action[] = ['left', 'right', 'soft'];

function placeButtons(): void {
  for (const a of ACTIONS) {
    const el = buttonEls[a];
    const b = settings.buttons[a];
    el.style.left = `${b.x * 100}%`;
    el.style.top = `${b.y * 100}%`;
    el.style.width = el.style.height = `${b.size}px`;
    el.style.fontSize = `${Math.round(b.size * 0.2)}px`;
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
  const w = Math.ceil(window.innerWidth / step);
  const h = Math.ceil(window.innerHeight / step);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = ZONE_COLORS[nearestAction((x + 0.5) * step, (y + 0.5) * step)];
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
    el.innerHTML = ICONS[a];
    root.appendChild(el);
    buttonEls[a] = el;
  }
  root.addEventListener('pointerdown', onPointerDown);
  // Move/up/cancel are tracked on window so a finger that slides anywhere still releases.
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);
  placeButtons();
}

/**
 * The action whose marker is closest to the touch. Distance is scaled by the
 * marker radius so larger markers own a larger share of the screen.
 */
function nearestAction(x: number, y: number): Action {
  let best: Action = ACTIONS[0];
  let bestDist = Infinity;
  for (const a of ACTIONS) {
    const b = settings.buttons[a];
    const d = Math.hypot(x - b.x * window.innerWidth, y - b.y * window.innerHeight) / (b.size / 2);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

function onPointerDown(e: PointerEvent): void {
  e.preventDefault();
  const action = nearestAction(e.clientX, e.clientY);
  if (editing) {
    const b = settings.buttons[action];
    selected = action;
    drag = {
      id: e.pointerId,
      action,
      dx: e.clientX - b.x * window.innerWidth,
      dy: e.clientY - b.y * window.innerHeight,
    };
    syncLayoutBar();
    placeButtons();
    return;
  }
  pressPointer(e.pointerId, action);
}

function onPointerMove(e: PointerEvent): void {
  if (drag) {
    if (drag.id !== e.pointerId) return;
    const b = settings.buttons[drag.action];
    b.x = clamp01((e.clientX - drag.dx) / window.innerWidth);
    b.y = clamp01((e.clientY - drag.dy) / window.innerHeight);
    placeButtons();
    return;
  }
  // A held movement finger can slide to the neighbouring movement action.
  // Other actions fire once on touch and never trigger by sliding into them.
  const current = pointerAction.get(e.pointerId);
  if (!current || !SLIDE_ACTIONS.includes(current)) return;
  const next = nearestAction(e.clientX, e.clientY);
  if (next !== current && SLIDE_ACTIONS.includes(next)) {
    releasePointer(e.pointerId);
    pressPointer(e.pointerId, next);
  }
}

function onPointerUp(e: PointerEvent): void {
  if (drag && drag.id === e.pointerId) {
    drag = null;
    saveSettings(settings);
    return;
  }
  releasePointer(e.pointerId);
}

function pressPointer(id: number, action: Action): void {
  pointerAction.set(id, action);
  buttonEls[action].classList.add('down');
  input.press(action);
}

function releasePointer(id: number): void {
  const action = pointerAction.get(id);
  if (!action) return;
  pointerAction.delete(id);
  // Another finger may still be holding the same action.
  if ([...pointerAction.values()].includes(action)) return;
  buttonEls[action].classList.remove('down');
  input.release(action);
}

function releaseAllButtons(): void {
  pointerAction.clear();
  for (const a of ACTIONS) buttonEls[a].classList.remove('down');
  input.releaseAll();
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
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
    $('#menu-best').textContent = String(best);
    showOverlay('menu');
  } else if (s === 'paused') {
    showOverlay('pause');
  } else if (s === 'over') {
    showOverlay('over');
  } else {
    showOverlay(null);
  }
}

function startGame(): void {
  releaseAllButtons();
  game = new Game();
  setScreen('playing');
}

function pause(): void {
  if (screen === 'playing') setScreen('paused');
}

function finish(g: Game): void {
  const isBest = g.score > best;
  if (isBest) {
    best = g.score;
    saveBest(best);
  }
  $('#over-title').textContent = g.status === 'complete' ? 'Complete!' : 'Game Over';
  $('#over-score').textContent = String(g.score);
  $('#over-best').textContent = isBest ? 'New best!' : `Best: ${best}`;
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
const sizeInput = $<HTMLInputElement>('#layout-size');

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
  sizeInput.value = String(settings.buttons[selected].size);
  $('#layout-hint').textContent = `Selected: ${LABELS[selected]}`;
}

sizeInput.addEventListener('input', () => {
  settings.buttons[selected].size = Number(sizeInput.value);
  placeButtons();
  saveSettings(settings);
});

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
  }
});

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
    game.softDropFactor = settings.sdf === 0 ? Infinity : settings.sdf;
    input.update(dt);
    game.update(dt);
    if (game.status !== 'playing') finish(game);
  }
  renderer.draw(game, { ghost: settings.ghost, nextCount: settings.nextCount, best });
  requestAnimationFrame(frame);
}

buildControls();
renderer.resize();
setScreen('menu');
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // Offline support is optional.
  });
}
