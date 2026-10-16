import { useEffect, useRef, useState } from 'react';
import WatermelonHero from './components/WatermelonHero.jsx';
import WelcomeBranding from './components/WelcomeBranding.jsx';
import { playFireworks, playSlice, playSound } from './gameAudio.js';
import { advanceCampaignProgress, calculateFruitScore, intersectsSegment, stepFruit } from './gameLogic.js';
import LEVELS from '../../level_config.json';

const FRUITS = [
  { name: 'Apple', kind: 'apple', points: 10, radius: 25, color: '#bf3032' },
  { name: 'Orange', kind: 'orange', points: 15, radius: 28, color: '#e57922' },
  { name: 'Banana', kind: 'banana', points: 20, radius: 25, color: '#e2bd49' },
  { name: 'Watermelon', kind: 'watermelon', points: 25, radius: 31, color: '#39853f' },
  { name: 'Kiwi', kind: 'kiwi', points: 18, radius: 25, color: '#8aa44d' },
  { name: 'Pineapple', kind: 'pineapple', points: 30, radius: 32, color: '#c89936' },
  { name: 'Strawberry', kind: 'strawberry', points: 22, radius: 25, color: '#b92738' },
  { name: 'Blueberry', kind: 'blueberry', points: 16, radius: 24, color: '#454f77' }
];

const MAX_LEVEL = LEVELS.length;
const PROFILE_PRESETS = [
  { id: 'forest', name: 'Forest', color: '#6e9567' },
  { id: 'copper', name: 'Copper', color: '#bd8056' },
  { id: 'ocean', name: 'Ocean', color: '#6f9ca5' },
  { id: 'plum', name: 'Plum', color: '#9c7a9f' },
  { id: 'stone', name: 'Stone', color: '#a4a99b' }
];
const getLevelConfig = (level) => LEVELS[Math.max(0, Math.min(MAX_LEVEL - 1, level - 1))];
const getInitial = (name = 'P') => (String(name).trim().charAt(0) || 'P').toUpperCase();
const DEFAULT_CAMPAIGN = { currentLevel: 1, unlockedLevel: 1, levelScore: 0, fruitsSliced: 0, levelComplete: false };

function readStoredProgress() {
  try {
    const progress = JSON.parse(localStorage.getItem('sliceStormProgress') || 'null');
    if (!progress) return DEFAULT_CAMPAIGN;
    const currentLevel = Math.max(1, Math.min(MAX_LEVEL, Number(progress.currentLevel) || 1));
    return {
      currentLevel,
      unlockedLevel: Math.max(currentLevel, Math.min(MAX_LEVEL, Number(progress.unlockedLevel) || 1)),
      levelScore: Math.max(0, Number(progress.levelScore) || 0),
      fruitsSliced: Math.max(0, Number(progress.fruitsSliced) || 0),
      levelComplete: Boolean(progress.levelComplete)
    };
  } catch { return DEFAULT_CAMPAIGN; }
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.random() * 256; });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const makeIdleGame = (mode = 'classic', campaign = DEFAULT_CAMPAIGN) => ({
  mode, status: 'idle', score: 0, combo: 0, bestCombo: 0, lives: 3,
  fruitsSliced: 0, level: campaign.currentLevel, unlockedLevel: campaign.unlockedLevel,
  levelScore: campaign.levelScore, levelSliced: campaign.fruitsSliced, levelComplete: campaign.levelComplete,
  bombsHit: 0, timer: Infinity, fruits: [], particles: [], fragments: [],
  trails: [], messages: [], startedAt: null, lastSpawn: 0, lastSlice: 0,
  lastFrame: 0, sessionId: null, width: 900, height: 540
});

function readStoredUser() {
  try {
    const token = localStorage.getItem('sliceStormToken');
    if (token) {
      const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(atob(payload));
      if (Number.isFinite(claims.exp) && claims.exp * 1000 <= Date.now()) {
        localStorage.removeItem('sliceStormToken');
        localStorage.removeItem('sliceStormUser');
        return null;
      }
    }
    return JSON.parse(localStorage.getItem('sliceStormUser') || 'null');
  }
  catch { return null; }
}

async function api(path, options = {}) {
  const token = localStorage.getItem('sliceStormToken');
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && token) {
    localStorage.removeItem('sliceStormToken');
    localStorage.removeItem('sliceStormUser');
    window.dispatchEvent(new Event('sliceStormSessionExpired'));
  }
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '∞';
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function randomFruit(width, height, mode, bomb = false, level = 1) {
  const speedScale = getLevelConfig(level).speedMultiplier;
  if (bomb) return {
    id: createId(), name: 'Bomb', kind: 'bomb', points: 0, radius: 28,
    color: '#4d3439', x: 40 + Math.random() * Math.max(20, width - 80), y: height + 24,
    vx: (Math.random() - 0.5) * 4 * speedScale, vy: -(Math.random() * 8 + 7) * speedScale, spin: (Math.random() - 0.5) * 10,
    rotation: Math.random() * 360, bomb: true, sliced: false
  };
  const type = FRUITS[Math.floor(Math.random() * FRUITS.length)];
  return {
    ...type, id: createId(), x: 40 + Math.random() * Math.max(20, width - 80),
    y: height + 24, vx: (Math.random() - 0.5) * 4.5 * (mode === 'arcade' ? 1.3 : 1) * speedScale,
    vy: -(Math.random() * 9 + 7) * (mode === 'arcade' ? 1.15 : 1) * speedScale,
    spin: (Math.random() - 0.5) * 10, rotation: Math.random() * 360, bomb: false, sliced: false
  };
}

function App() {
  const [view, setView] = useState('welcome');
  const [authMode, setAuthMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState(readStoredUser);
  const [profilePreset, setProfilePreset] = useState(() => {
    const stored = localStorage.getItem('sliceStormProfilePreset');
    return PROFILE_PRESETS.some(({ id }) => id === stored) ? stored : 'forest';
  });
  const [campaign, setCampaign] = useState(readStoredProgress);
  const [slicePhase, setSlicePhase] = useState('calm');
  const [soundOn, setSoundOn] = useState(localStorage.getItem('sliceStormSoundEnabled') !== 'false');
  const [mode, setMode] = useState('classic');
  const [game, setGame] = useState(() => makeIdleGame());
  const [scores, setScores] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({});
  const [achievements, setAchievements] = useState([]);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState('all');
  const [currentPlayerRank, setCurrentPlayerRank] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [profileError, setProfileError] = useState('');
  const gameRef = useRef(game);
  const boardRef = useRef(null);
  const pointerRef = useRef({ down: false, point: null });
  const campaignRef = useRef(campaign);
  const progressSaveTimerRef = useRef(null);

  function selectProfilePreset(preset) {
    setProfilePreset(preset);
    localStorage.setItem('sliceStormProfilePreset', preset);
  }

  function setGameState(next) {
    gameRef.current = next;
    setGame(next);
  }

  function persistCampaign(next) {
    campaignRef.current = next;
    setCampaign(next);
    localStorage.setItem('sliceStormProgress', JSON.stringify(next));
    if (!localStorage.getItem('sliceStormToken')) return;
    window.clearTimeout(progressSaveTimerRef.current);
    progressSaveTimerRef.current = window.setTimeout(() => {
      api('/api/progress', { method: 'PUT', body: JSON.stringify(campaignRef.current) })
        .then(({ progress }) => {
          campaignRef.current = progress;
          setCampaign(progress);
          localStorage.setItem('sliceStormProgress', JSON.stringify(progress));
        })
        .catch((saveError) => console.error('Unable to save level progress', saveError));
    }, 120);
  }

  async function loadScores(period = leaderboardPeriod) {
    try {
      const data = await api(`/api/leaderboard?period=${period}`);
      setScores(data.leaderboard || []);
      setCurrentPlayerRank(data.currentPlayerRank);
    } catch (loadError) { console.error(loadError); }
  }

  async function loadProfile() {
    if (!localStorage.getItem('sliceStormToken')) return;
    try {
      const profileData = await api('/api/profile');
      setHistory(profileData.history || []);
      setStats(profileData.stats || {});
      setAchievements(profileData.achievements || []);
      setProfileForm({ name: profileData.user.name || '', email: profileData.user.email || '' });
      if (profileData.progress) {
        campaignRef.current = profileData.progress;
        setCampaign(profileData.progress);
        localStorage.setItem('sliceStormProgress', JSON.stringify(profileData.progress));
      }
    } catch (loadError) { console.error(loadError); }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileError('');
    try {
      const result = await api('/api/auth/me', { method: 'PUT', body: JSON.stringify(profileForm) });
      localStorage.setItem('sliceStormUser', JSON.stringify(result.user));
      setUser(result.user);
      setEditingProfile(false);
    } catch (saveError) { setProfileError(saveError.message); }
  }

  useEffect(() => {
    const clearExpiredSession = () => setUser(null);
    window.addEventListener('sliceStormSessionExpired', clearExpiredSession);
    return () => window.removeEventListener('sliceStormSessionExpired', clearExpiredSession);
  }, []);
  useEffect(() => {
    if (!user) {
      campaignRef.current = readStoredProgress();
      setCampaign(campaignRef.current);
      return undefined;
    }
    let active = true;
    api('/api/progress')
      .then(({ progress }) => {
        if (!active) return;
        campaignRef.current = progress;
        setCampaign(progress);
        localStorage.setItem('sliceStormProgress', JSON.stringify(progress));
      })
      .catch((loadError) => console.error('Unable to load level progress', loadError));
    return () => { active = false; };
  }, [user]);
  useEffect(() => {
    if (view !== 'welcome') return undefined;
    const sequence = [
      ['calm', 2050], ['slicing', 500], ['split', 800]
    ];
    let timeout;
    let index = 0;
    const advance = () => {
      const [phase, duration] = sequence[index];
      setSlicePhase(phase);
      if (phase === 'slicing') playSlice(soundOn);
      index = (index + 1) % sequence.length;
      timeout = window.setTimeout(advance, duration);
    };
    advance();
    return () => window.clearTimeout(timeout);
  }, [view, soundOn]);
  useEffect(() => { loadScores(leaderboardPeriod); }, [leaderboardPeriod, user]);
  useEffect(() => { if (user) loadProfile(); }, [user]);

  function openReadyScreen() {
    pointerRef.current = { down: false, point: null };
    setGameState(makeIdleGame(mode, campaignRef.current));
    setView('game');
  }

  async function submitAuth(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const endpoint = authMode === 'register' ? 'register' : 'login';
    const payload = authMode === 'register' ? form : { email: form.email, password: form.password };
    try {
      const result = await api(`/api/auth/${endpoint}`, { method: 'POST', body: JSON.stringify(payload) });
      localStorage.setItem('sliceStormToken', result.token);
      localStorage.setItem('sliceStormUser', JSON.stringify(result.user));
      const progressResult = await api('/api/progress');
      campaignRef.current = progressResult.progress;
      setCampaign(progressResult.progress);
      localStorage.setItem('sliceStormProgress', JSON.stringify(progressResult.progress));
      setUser(result.user);
      setForm({ name: '', email: '', password: '' });
      openReadyScreen();
    } catch (submitError) { setError(submitError.message); }
    finally { setBusy(false); }
  }

  function logout() {
    localStorage.removeItem('sliceStormToken');
    localStorage.removeItem('sliceStormUser');
    setUser(null);
    setView('welcome');
  }

  async function startRound() {
    playSound('start', soundOn);
    const previous = gameRef.current;
    const retrying = previous.status === 'over';
    const saved = campaignRef.current;
    const level = retrying ? previous.level : saved.currentLevel;
    const levelScore = retrying ? previous.levelScore : saved.levelScore;
    const levelSliced = retrying ? previous.levelSliced : saved.fruitsSliced;
    const levelComplete = retrying ? previous.levelComplete : saved.levelComplete;
    if (levelComplete) {
      setGameState({ ...makeIdleGame(mode, saved), status: 'celebrating' });
      return;
    }
    const bounds = boardRef.current?.getBoundingClientRect();
    let sessionId = `local-${Date.now()}`;
    try {
      const response = await api('/api/games/start', { method: 'POST', body: JSON.stringify({ mode }) });
      sessionId = response.session?.id || sessionId;
    } catch { /* Local round remains playable while the API is unavailable. */ }
    const fresh = makeIdleGame(mode, { ...saved, currentLevel: level, levelScore, fruitsSliced: levelSliced });
    const width = bounds?.width || 900;
    const height = bounds?.height || 540;
    setGameState({
      ...fresh,
      status: 'running',
      level,
      unlockedLevel: saved.unlockedLevel,
      levelScore,
      levelSliced,
      levelComplete: false,
      startedAt: Date.now(),
      lastSpawn: Date.now(),
      sessionId,
      width,
      height,
      fruits: [randomFruit(width, height, mode)]
    });
  }

  async function finishRound(finalState) {
    if (finalState.status !== 'running') return;
    const result = { ...finalState, status: 'over', timer: Math.max(0, finalState.timer) };
    setGameState(result);
    if (!result.sessionId || result.sessionId.startsWith('local-')) return;
    try {
      await api('/api/games/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: result.sessionId, mode: result.mode, score: result.score,
          fruitsSliced: result.fruitsSliced, bombsHit: result.bombsHit,
          maxCombo: result.bestCombo, duration: Math.max(1, (Date.now() - result.startedAt) / 1000),
          accuracy: result.fruitsSliced ? result.fruitsSliced / (result.fruitsSliced + result.bombsHit + 1) * 100 : 0
        })
      });
      loadScores();
      loadProfile();
    } catch (saveError) { console.error('Unable to save game', saveError); }
  }

  function togglePause() {
    const current = gameRef.current;
    if (current.status !== 'running' && current.status !== 'paused') return;
    setGameState({ ...current, status: current.status === 'running' ? 'paused' : 'running' });
    pointerRef.current = { down: false, point: null };
  }

  function showText(current, x, y, text, color = '#fff', size = '1.4rem') {
    return { ...current, messages: [...current.messages, { x, y, text, color, size, alpha: 1, drift: (Math.random() - 0.5) * 22 }].slice(-14) };
  }

  function sliceItem(id) {
    const current = gameRef.current;
    const fruit = current.fruits.find((item) => item.id === id);
    if (!fruit || fruit.sliced || current.status !== 'running') return;
    if (fruit.bomb) {
      playSound('bomb', soundOn);
      finishRound(showText({ ...current, bombsHit: current.bombsHit + 1, lives: 0, screenShake: 28 }, 50, 20, 'BOMB!', '#ff6070', '2.4rem'));
      return;
    }
    playSlice(soundOn);
    const points = calculateFruitScore(fruit.points, current.mode, current.combo);
    let next = {
      ...current,
      fruits: current.fruits.map((item) => item.id === id ? { ...item, sliced: true } : item),
      score: current.score + points,
      combo: current.combo + 1,
      bestCombo: Math.max(current.bestCombo, current.combo + 1),
      fruitsSliced: current.fruitsSliced + 1,
      levelScore: current.levelScore + points,
      levelSliced: current.levelSliced + 1,
      lastSlice: Date.now(),
      particles: [...current.particles, ...Array.from({ length: 18 }, () => {
        const seed = Math.random() < 0.28;
        return { x: fruit.x, y: fruit.y, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, alpha: 1, color: seed ? '#292322' : fruit.color, seed };
      })],
      fragments: [...(current.fragments || []), ...[-1, 1].map((side) => ({
        id: `${fruit.id}-${side}`, kind: fruit.kind, color: fruit.color, x: fruit.x, y: fruit.y,
        vx: side * (2 + Math.random() * 2), vy: -2 - Math.random() * 2,
        rotation: side * 12, side, startedAt: Date.now()
      }))]
    };
    next = showText(next, fruit.x, fruit.y, `+${points}`, '#ffeb91', '1.8rem');
    if (next.combo > 1) next = showText(next, fruit.x, fruit.y - 24, `${next.combo} COMBO!`, '#ffffff', '1.25rem');
    if (next.levelScore >= getLevelConfig(current.level).targetScore) {
      next.status = 'celebrating';
      next.levelComplete = true;
      next.unlockedLevel = Math.min(MAX_LEVEL, Math.max(current.unlockedLevel, current.level + 1));
      const completedProgress = {
        currentLevel: current.level,
        unlockedLevel: next.unlockedLevel,
        levelScore: next.levelScore,
        fruitsSliced: next.levelSliced,
        levelComplete: true
      };
      persistCampaign(completedProgress);
      if (localStorage.getItem('sliceStormToken')) {
        api('/api/progress/complete', {
          method: 'POST',
          body: JSON.stringify({ level: current.level, levelScore: next.levelScore, fruitsSliced: next.levelSliced })
        }).then(({ progress }) => {
          campaignRef.current = progress;
          setCampaign(progress);
          localStorage.setItem('sliceStormProgress', JSON.stringify(progress));
        }).catch((saveError) => console.error('Unable to unlock next level', saveError));
      }
      playSound('levelUp', soundOn);
      playFireworks(soundOn);
    } else {
      persistCampaign({
        currentLevel: current.level,
        unlockedLevel: current.unlockedLevel,
        levelScore: next.levelScore,
        fruitsSliced: next.levelSliced,
        levelComplete: false
      });
    }
    setGameState(next);
  }

  function nextLevel() {
    const current = gameRef.current;
    if (current.status !== 'celebrating' || !current.levelComplete || current.level >= MAX_LEVEL) return;
    const bounds = boardRef.current?.getBoundingClientRect();
    const width = bounds?.width || current.width;
    const height = bounds?.height || current.height;
    const nextCampaign = advanceCampaignProgress({
      currentLevel: current.level,
      unlockedLevel: current.unlockedLevel,
      levelScore: current.levelScore,
      fruitsSliced: current.levelSliced,
      levelComplete: current.levelComplete
    }, MAX_LEVEL);
    persistCampaign(nextCampaign);
    setGameState({
      ...current,
      status: 'running',
      level: current.level + 1,
      unlockedLevel: nextCampaign.unlockedLevel,
      levelScore: 0,
      levelSliced: 0,
      levelComplete: false,
      fruits: [randomFruit(width, height, current.mode, false, current.level + 1)],
      particles: [],
      fragments: [],
      messages: [],
      trails: [],
      slices: [],
      lastSpawn: Date.now(),
      width,
      height
    });
  }

  function continueCampaign() {
    if (campaign.levelComplete && campaign.currentLevel < MAX_LEVEL) {
      const readyGame = { ...makeIdleGame(mode, campaign), status: 'celebrating' };
      setGameState(readyGame);
      setView('game');
      nextLevel();
      return;
    }
    openReadyScreen();
  }

  function position(event) {
    const bounds = boardRef.current.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function onPointerDown(event) {
    if (gameRef.current.status !== 'running') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = position(event);
    pointerRef.current = { down: true, point };
    const target = gameRef.current.fruits.find((fruit) => Math.hypot(point.x - fruit.x, point.y - fruit.y) < fruit.radius * 0.78);
    if (target) sliceItem(target.id);
  }

  function onPointerMove(event) {
    if (!pointerRef.current.down || gameRef.current.status !== 'running') return;
    event.preventDefault();
    const point = position(event);
    const previous = pointerRef.current.point;
    const current = gameRef.current;
    let next = {
      ...current,
      trails: [...current.trails, { x: point.x / current.width * 100, y: point.y / current.height * 100, alpha: 1, time: Date.now() }].slice(-22),
      slices: [...(current.slices || []), { x1: previous.x / current.width * 100, y1: previous.y / current.height * 100, length: Math.hypot(point.x - previous.x, point.y - previous.y) / current.width * 100, angle: Math.atan2(point.y - previous.y, point.x - previous.x) * 180 / Math.PI, alpha: 1, width: 14 }].slice(-18)
    };
    setGameState(next);
    for (const fruit of [...gameRef.current.fruits]) {
      if (intersectsSegment(previous, point, fruit)) sliceItem(fruit.id);
    }
    pointerRef.current.point = point;
  }

  function stopPointer(event) {
    pointerRef.current = { down: false, point: null };
    if (event?.pointerId !== undefined) event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  useEffect(() => {
    if (game.status !== 'running') return undefined;
    let frame;
    let prior = 0;
    const tick = (timestamp) => {
      const current = gameRef.current;
      if (current.status !== 'running') return;
      const delta = prior ? Math.min(0.04, (timestamp - prior) / 1000) : 1 / 60;
      prior = timestamp;
      const now = Date.now();
      const bounds = boardRef.current?.getBoundingClientRect();
      const width = bounds?.width || current.width;
      const height = bounds?.height || current.height;
      let next = {
        ...current,
        width,
        height,
        combo: now - current.lastSlice > 850 ? 0 : current.combo,
        trails: current.trails.filter((item) => now - item.time < 180).map((item) => ({ ...item, alpha: item.alpha - 0.1 })),
        slices: (current.slices || []).map((item) => ({ ...item, alpha: item.alpha - 0.15 })).filter((item) => item.alpha > 0.05),
        messages: current.messages.map((item) => ({ ...item, alpha: item.alpha - 0.035, y: item.y - 0.35 })).filter((item) => item.alpha > 0.06),
        particles: current.particles.map((item) => ({ ...item, x: item.x + item.vx * 60 * delta, y: item.y + item.vy * 60 * delta, alpha: item.alpha - 0.03 })).filter((item) => item.alpha > 0.05),
        fragments: (current.fragments || []).map((item) => ({ ...item, x: item.x + item.vx * 60 * delta, y: item.y + item.vy * 60 * delta, vy: item.vy + 0.16 * 60 * delta, rotation: item.rotation + item.side * 7 })).filter((item) => now - item.startedAt < 520),
        screenShake: Math.max(0, (current.screenShake || 0) - delta * 30)
      };
      const levelConfig = getLevelConfig(current.level);
      const spawnDelay = current.mode === 'arcade' ? Math.max(300, levelConfig.spawnIntervalMs - 180) : levelConfig.spawnIntervalMs;
      if (now - current.lastSpawn > spawnDelay) {
        const bombChance = current.mode === 'arcade' ? Math.min(0.65, levelConfig.bombChance * 1.35) : levelConfig.bombChance;
        const spawnBomb = Math.random() < bombChance;
        next = { ...next, fruits: [...next.fruits, randomFruit(width, height, current.mode, spawnBomb, current.level)], lastSpawn: now };
      }
      let missed = 0;
      const remaining = [];
      for (const fruit of next.fruits) {
        if (fruit.sliced) continue;
        const y = fruit.y + fruit.vy * 60 * delta;
        if (y > height + fruit.radius + 12) {
          if (!fruit.bomb) missed += 1;
          continue;
        }
        remaining.push(stepFruit({ ...fruit, y: fruit.y }, delta, 0.2));
      }
      next = { ...next, fruits: remaining, lives: next.lives - missed, combo: missed ? 0 : next.combo };
      if (next.lives <= 0) { finishRound(next); return; }
      setGameState(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [game.status]);

  function header() {
    return <header className="topbar"><button className="brand brand-button" onClick={() => setView(user ? 'home' : 'welcome')}><span className="brand-mark">S</span><span>SLICE STORM</span></button><nav className="nav-actions"><button onClick={() => setView(user ? 'home' : 'welcome')}>Home</button><button onClick={() => setView('leaderboard')}>Leaderboard</button><button onClick={() => setView('profile')}>Profile</button></nav>{user ? <div className="user-badge"><span>{user.name}</span><button onClick={logout}>Logout</button></div> : <button onClick={() => { setAuthMode('login'); setView('auth'); }}>Login</button>}</header>;
  }

  function openAuth(mode) {
    setAuthMode(mode);
    setError('');
    setView('auth');
  }

  function welcome() {
    return (
      <main className="welcome-scene view-enter">
        <WelcomeBranding onRegister={() => openAuth('register')} onLogin={() => openAuth('login')} />
        <WatermelonHero slicePhase={slicePhase} />
      </main>
    );
  }

  function home() {
    const topScore = stats.highestScore || user?.highestScore || Math.max(0, ...scores.map((item) => Number(item.score || 0)));
    const levelConfig = getLevelConfig(campaign.currentLevel);
    const levelProgress = Math.min(100, campaign.levelScore / levelConfig.targetScore * 100);
    return (
      <div className="app-shell home-shell">
        <main className="home-scene">
          <header className="home-topbar">
            <div className="profile-chip">
              <div className={`avatar profile-avatar-${profilePreset}`} aria-hidden="true">{getInitial(user?.name)}</div>
              <div><div className="player-name">{user?.name || 'Player'}</div><div className="player-level">Player</div></div>
            </div>
            <nav className="wood-nav" aria-label="Main navigation">
              <button className="active" onClick={() => setView('home')}>Home</button>
              <button onClick={openReadyScreen}>Play Game</button>
              <button onClick={() => setView('leaderboard')}>Leaderboard</button>
              <button onClick={() => setView('profile')}>Profile</button>
              <button onClick={logout}>Logout</button>
            </nav>
            <div className="top-score-badge"><span className="badge-icon">BEST</span>{topScore.toLocaleString()}</div>
          </header>
          <section className="hero-panel">
            <div className="hero-title-wrap">
              <p className="home-kicker">YOUR CAMPAIGN <span>·</span> LEVEL {campaign.currentLevel}</p>
              <h1 className="hero-title"><span>SLICE</span><span className="storm">STORM</span></h1>
              <p className="home-tagline">Master the Blade. Chase the Perfect Combo.</p>
              <p className="home-description">A precision arcade challenge built around timing, control, and clean cuts.</p>
              <button className="play-button" onClick={openReadyScreen}>PLAY GAME <span aria-hidden="true">→</span></button>
            </div>
            <div className="home-fruit-stage" aria-hidden="true"><svg className="home-watermelon-render fruit-atlas-picture" viewBox="0 0 128 128"><use href="/fruit-atlas.svg#fruit-watermelon" /></svg></div>
            <div className="hero-actions">
              <div className="feature-pills">
                <button onClick={() => setView('leaderboard')}>Leaderboard</button>
                <button onClick={() => setView('profile')}>Profile</button>
              </div>
            </div>
          </section>
          <section className="home-stats" aria-label="Player statistics">
            <div><span>Current level</span><strong>{campaign.currentLevel}</strong></div>
            <div><span>Total score</span><strong>{(stats.totalScore || 0).toLocaleString()}</strong></div>
            <div><span>Fruits sliced</span><strong>{stats.totalFruitsSliced || user?.totalFruitsSliced || 0}</strong></div>
            <div><span>Best score</span><strong>{topScore.toLocaleString()}</strong></div>
            <div><span>Levels cleared</span><strong>{stats.levelsCompleted ?? Math.max(0, campaign.unlockedLevel - 1)}</strong></div>
          </section>
          <section className="continue-panel">
            <div className="continue-details">
              <div className="continue-title"><span>CONTINUE PLAYING</span><strong>Level {campaign.currentLevel}</strong></div>
              <div className="continue-target">Target {levelConfig.targetScore.toLocaleString()} points <span>·</span> {campaign.levelScore.toLocaleString()} points <span>·</span> {campaign.fruitsSliced} fruits sliced</div>
              <div className="target-track"><span style={{ width: `${levelProgress}%` }} /></div>
            </div>
            <button className="continue-button" onClick={continueCampaign}>{campaign.levelComplete ? `CONTINUE TO LEVEL ${Math.min(MAX_LEVEL, campaign.currentLevel + 1)}` : `CONTINUE LEVEL ${campaign.currentLevel}`} <span>→</span></button>
          </section>
        </main>
      </div>
    );
  }

  function auth() {
    return (
      <div className="auth-scene view-enter">
        <button type="button" className="auth-back" onClick={() => setView('welcome')}>
          ← Back
        </button>
        <main className="auth-screen">
          <section className="auth-panel">
            <div className="auth-panel-brand">
              <span className="welcome-logo">SS</span>
              <div>
                <strong>SLICE STORM</strong>
                <p>{authMode === 'login' ? 'Sign in to continue your campaign.' : 'Create an account to save your progress.'}</p>
              </div>
            </div>
            <div className="auth-toggle">
              <button type="button" className={authMode === 'login' ? 'selected' : ''} onClick={() => { setAuthMode('login'); setError(''); }}>Login</button>
              <button type="button" className={authMode === 'register' ? 'selected' : ''} onClick={() => { setAuthMode('register'); setError(''); }}>Register</button>
            </div>
            <form className="auth-form" onSubmit={submitAuth}>
              {authMode === 'register' && (
                <label>
                  Name
                  <input required autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Player name" />
                </label>
              )}
              <label>
                Email
                <input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" />
              </label>
              <label>
                Password
                <input required minLength="6" type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 6 characters" />
              </label>
              {error && <p role="alert" className="auth-error">{error}</p>}
              <button type="submit" className={authMode === 'register' ? 'welcome-register auth-submit' : 'welcome-login auth-submit'} disabled={busy}>
                {busy ? 'Please wait…' : authMode === 'login' ? 'Login' : 'Create Account'}
              </button>
            </form>
          </section>
        </main>
      </div>
    );
  }

  function leaderboard() {
    const podium = scores.slice(0, 3);

    return (
      <div className="app-shell">
        {header()}
        <main className="championship-screen">
          <section className="championship-heading">
            <p>SLICE STORM CHAMPIONSHIP</p>
            <h1>TOP FRUIT SLICERS</h1>
            <div className="leaderboard-controls" role="tablist" aria-label="Leaderboard period">
              {[['all', 'All Time'], ['week', 'This Week'], ['day', 'Today']].map(([period, label]) => (
                <button key={period} type="button" role="tab" aria-selected={leaderboardPeriod === period} className={leaderboardPeriod === period ? 'selected' : ''} onClick={() => setLeaderboardPeriod(period)}>{label}</button>
              ))}
            </div>
            {user && <p className="player-rank">Your rank: <strong>{currentPlayerRank ? `#${currentPlayerRank}` : 'Not ranked yet'}</strong></p>}
          </section>
          {podium.length > 0 && <section className="podium" aria-label="Top players">
            {[podium[1], podium[0], podium[2]].filter(Boolean).map((entry) => <div key={`${entry.rank}-${entry.name}`} className={`podium-place podium-place-${entry.rank}`}><span className="podium-rank">{String(entry.rank).padStart(2, '0')}</span><span className="podium-avatar">{getInitial(entry.name)}</span><strong>{entry.name}</strong><b>{entry.score.toLocaleString()}</b><small>LEVEL {entry.level}</small></div>)}
          </section>}
          <section className="leaderboard-table-wrap">
            <h2>{leaderboardPeriod === 'all' ? 'All-Time Standings' : leaderboardPeriod === 'week' ? 'Weekly Standings' : 'Daily Standings'}</h2>
            {scores.length === 0 ? <p className="empty-state">No completed games in this period yet.</p> : <table className="leaderboard-table"><thead><tr><th>Rank</th><th>Player</th><th>Highest Score</th><th>Level</th><th>Fruits Sliced</th><th>Levels Cleared</th></tr></thead><tbody>{scores.map((entry) => <tr key={`${entry.rank}-${entry.name}-${entry.createdAt}`}><td><strong>#{entry.rank}</strong></td><td><span className="table-player-avatar">{getInitial(entry.name)}</span>{entry.name}</td><td>{entry.score.toLocaleString()}</td><td>{entry.level}</td><td>{entry.fruitsSliced}</td><td>{entry.levelsCompleted}</td></tr>)}</tbody></table>}
          </section>
        </main>
      </div>
    );
  }

  function profile() {
    return (
      <div className="app-shell dashboard-shell">
        <section className="dashboard-panel profile-page">
          <header className="dashboard-header"><span className="brand-mark dashboard-logo">SS</span><div className="dashboard-title">SLICE<br />STORM</div></header>
          <div className="profile-card">
            <span className={`avatar-large profile-avatar-${profilePreset}`} aria-hidden="true">{getInitial(user?.name)}</span>
            <div className="profile-identity"><h2>{user?.name || 'Guest Player'}</h2><p>@{(user?.username || user?.name || 'player').toLowerCase().replace(/\s+/g, '')}</p>{user?.email && <p>{user.email}</p>}</div>
            {user && <button className="profile-edit-button" onClick={() => { setProfileForm({ name: user.name, email: user.email }); setProfileError(''); setEditingProfile((value) => !value); }}>{editingProfile ? 'Cancel' : 'Edit Profile'}</button>}
          </div>
          <section className="avatar-picker" aria-label="Choose a profile style">
            <span>Profile style</span>
            <div className="avatar-options">
              {PROFILE_PRESETS.map(({ id, name, color }) => (
                <button key={id} type="button" className={`avatar-option ${profilePreset === id ? 'selected' : ''}`} aria-label={`${name} profile style`} aria-pressed={profilePreset === id} onClick={() => selectProfilePreset(id)}>
                  <span className={`avatar-option-monogram profile-avatar-${id}`} style={{ '--profile-accent': color }}>{getInitial(user?.name)}</span>
                  <small>{name}</small>
                </button>
              ))}
            </div>
          </section>
          {editingProfile && <form className="profile-edit-form" onSubmit={saveProfile}><label>Player name<input required maxLength="80" value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} /></label><label>Email<input required type="email" maxLength="120" value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} /></label>{profileError && <p role="alert" className="auth-error">{profileError}</p>}<button className="primary-button">Save profile</button></form>}
          <div className="dashboard-grid profile-actions"><button className="dash-action" onClick={() => setView('home')}>Home</button><button className="dash-action" onClick={openReadyScreen}>Play Game</button><button className="dash-action" onClick={() => setView('leaderboard')}>Leaderboard</button><button className="dash-action" onClick={user ? logout : () => { setAuthMode('login'); setView('auth'); }}>{user ? 'Logout' : 'Login'}</button></div>
          <div className="stats-grid profile-stats"><div className="stat-box"><span>Total Games Played</span><strong>{stats.totalGames || 0}</strong></div><div className="stat-box"><span>Highest Score</span><strong>{stats.highestScore || 0}</strong></div><div className="stat-box"><span>Total Fruits Sliced</span><strong>{stats.totalFruitsSliced || 0}</strong></div><div className="stat-box"><span>Current Level</span><strong>{campaign.currentLevel}</strong></div><div className="stat-box"><span>Levels Completed</span><strong>{stats.levelsCompleted ?? Math.max(0, campaign.unlockedLevel - 1)}</strong></div><div className="stat-box"><span>Total Play Time</span><strong>{Math.floor((stats.totalPlayTime || 0) / 60)} min</strong></div></div>
          <section className="achievement-section"><div className="section-heading"><h2>Achievements</h2><span>{achievements.filter((item) => item.unlocked).length}/{achievements.length} unlocked</span></div><div className="achievement-grid">{achievements.map((item, index) => <article key={item.id} className={`achievement-badge ${item.unlocked ? 'unlocked' : 'locked'}`}><span className="achievement-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{item.name}</strong><small>{item.description}</small></div>{item.unlocked ? <b>UNLOCKED</b> : <b>LOCKED</b>}</article>)}</div></section>
          <section className="history-panel"><div className="history-head"><span>Recent Game History</span><button className="refresh-history" onClick={loadProfile} aria-label="Refresh game history">↻</button></div><table className="history-table"><thead><tr><th>Date</th><th>Level</th><th>Score</th><th>Result</th></tr></thead><tbody>{history.slice(0, 10).map((entry) => <tr key={entry.sessionId}><td>{new Date(entry.createdAt).toLocaleDateString()}</td><td>{entry.level || 1}</td><td>{entry.score.toLocaleString()}</td><td>{entry.status === 'completed' ? 'Completed' : entry.status}</td></tr>)}{history.length === 0 && <tr><td colSpan="4">No completed games yet.</td></tr>}</tbody></table></section>
        </section>
      </div>
    );
  }

  function gameView() {
    const levelConfig = getLevelConfig(game.level || 1);
    const targetProgress = Math.min(100, (game.levelScore / levelConfig.targetScore) * 100);

    return (
      <div className="app-shell game-shell">
        <main className="game-screen">
          <header className="game-topbar">
            <div className="player-chip-mini hud-player">
              <div className={`avatar-small profile-avatar-${profilePreset}`} aria-hidden="true">{getInitial(user?.name)}</div>
              <div className="player-meta">
                <span>{user?.name || 'Player'}</span>
                <small>{mode === 'arcade' ? 'Arcade' : 'Classic'}</small>
              </div>
            </div>
            <div className="mini-score-box hud-score"><span className="mini-label">Score</span><strong>{game.score}</strong></div>
            <div className="mini-score-box timer-box hud-time"><span className="mini-label">Time</span><strong>{formatTime(game.timer)}</strong></div>
            <div className="life-box hud-lives"><span className="mini-label">Lives</span><strong>{Math.max(0, game.lives)} / 3</strong></div>
            <button className="pause-toggle" type="button" aria-label={game.status === 'paused' ? 'Resume game' : 'Pause game'} onClick={togglePause}>{game.status === 'paused' ? 'RESUME' : 'PAUSE'}</button>
            <button className="sound-toggle" title={soundOn ? 'Mute game sounds' : 'Enable game sounds'} aria-label={soundOn ? 'Mute game sounds' : 'Enable game sounds'} onClick={() => setSoundOn((current) => { const next = !current; localStorage.setItem('sliceStormSoundEnabled', String(next)); if (next) playSound('start', true); return next; })}>{soundOn ? '🔊' : '🔇'}</button>
          </header>
          <section className="level-target" aria-live="polite">
            <div className="level-target-heading">
              <span>LEVEL {game.level || 1}</span>
              <strong>Target score: {levelConfig.targetScore}</strong>
              <span className="level-target-count">{game.levelScore}/{levelConfig.targetScore} pts</span>
            </div>
            <div className="target-track"><span style={{ width: `${targetProgress}%` }} /></div>
            <div className="level-fruit-count">{game.levelSliced} fruits sliced <span>·</span> Run score: {game.score}</div>
          </section>
          <div ref={boardRef} className="game-board" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopPointer} onPointerCancel={stopPointer} onPointerLeave={stopPointer} style={{ transform: `translate(${game.screenShake || 0}px, 0)` }}>
            <div className="sky-glow" />
            <div className="fruit-pattern" aria-hidden="true" />
            <div className="score-bubble">{game.score}</div>
            {game.trails.map((trail, index) => <i key={`trail-${index}`} className="trail-point" style={{ left: `${trail.x}%`, top: `${trail.y}%`, opacity: trail.alpha }} />)}
            {(game.slices || []).map((slice, index) => <i key={`slice-${index}`} className="slice-flash" style={{ left: `${slice.x1}%`, top: `${slice.y1}%`, width: `${slice.length}%`, height: `${slice.width}px`, transform: `rotate(${slice.angle}deg)`, opacity: slice.alpha }} />)}
            {game.fruits.map((fruit) => <span key={fruit.id} className={`fruit fruit-${fruit.kind} ${fruit.bomb ? 'bomb-fruit' : ''}`} aria-label={fruit.name} style={{ left: `${fruit.x / game.width * 100}%`, top: `${fruit.y / game.height * 100}%`, width: fruit.radius * 2, height: fruit.radius * 2, '--fruit-color': fruit.color, transform: `translate(-50%, -50%) rotate(${fruit.rotation}deg)` }}>{!fruit.bomb && <svg className="fruit-atlas-picture" viewBox="0 0 128 128"><use href={`/fruit-atlas.svg#fruit-${fruit.kind}`} /></svg>}</span>)}
            {(game.fragments || []).map((fragment) => <span key={fragment.id} className={`fruit-split fruit-${fragment.kind} fruit-split-${fragment.side < 0 ? 'left' : 'right'}`} style={{ left: `${fragment.x / game.width * 100}%`, top: `${fragment.y / game.height * 100}%`, '--fruit-color': fragment.color, transform: `translate(-50%, -50%) rotate(${fragment.rotation}deg)` }}><svg className="fruit-atlas-picture" viewBox="0 0 128 128"><use href={`/fruit-atlas.svg#fruit-${fragment.kind}`} /></svg></span>)}
            {game.particles.map((particle, index) => <i key={`particle-${index}`} className={`particle ${particle.seed ? 'seed-particle' : 'juice-particle'}`} style={{ left: `${particle.x / game.width * 100}%`, top: `${particle.y / game.height * 100}%`, background: particle.color, opacity: particle.alpha }} />)}
            {game.messages.map((message, index) => <span key={`message-${index}`} className="floating-text" style={{ left: `${message.x / game.width * 100}%`, top: `${message.y / game.height * 100}%`, color: message.color, opacity: message.alpha, fontSize: message.size }}>{message.text}</span>)}
            {game.status === 'idle' && <div className="game-over-overlay ready-overlay"><section className="game-over-card ready-card"><p className="ready-kicker">SLICE STORM</p><h2>LEVEL {game.level} READY</h2><div className="ready-target">Target score <strong>{levelConfig.targetScore}</strong><span> · {game.levelSliced} fruits sliced so far</span></div><div className="mode-picks"><button className={mode === 'classic' ? 'selected' : ''} onClick={() => { setMode('classic'); setGameState(makeIdleGame('classic', campaignRef.current)); }}>Classic</button><button className={mode === 'arcade' ? 'selected' : ''} onClick={() => { setMode('arcade'); setGameState(makeIdleGame('arcade', campaignRef.current)); }}>Arcade</button></div><button className="play-button" onClick={startRound}>▶ PLAY NOW</button></section></div>}
            {game.status === 'paused' && <div className="game-over-overlay pause-overlay"><section className="game-over-card ready-card"><p className="ready-kicker">LEVEL {game.level}</p><h2>PAUSED</h2><p className="celebration-copy">Your progress is saved as you play.</p><button className="play-button" onClick={togglePause}>▶ RESUME</button></section></div>}
            {game.status === 'celebrating' && <div className="game-over-overlay celebration-overlay"><section className="celebration-card" aria-live="assertive"><p className="ready-kicker">CAMPAIGN UPDATE</p><h2>{game.level >= MAX_LEVEL ? 'CAMPAIGN COMPLETE' : 'LEVEL COMPLETED'}</h2><p className="celebration-copy">{game.level >= MAX_LEVEL ? 'You completed every level.' : `You reached the ${levelConfig.targetScore} point target on Level ${game.level}.`}</p>{game.level >= MAX_LEVEL ? <button className="play-button" onClick={() => setView('home')}>RETURN TO DASHBOARD</button> : <button className="play-button" onClick={nextLevel}>CONTINUE TO LEVEL {game.level + 1}</button>}</section></div>}
            {game.status === 'over' && <div className="game-over-overlay"><section className="game-over-card"><p className="ready-kicker">ROUND COMPLETE</p><h2>GAME OVER</h2><div className="score-grid"><div className="score-panel big-score"><span>Run Score</span><strong>{game.score}</strong><small>Best Combo {game.bestCombo}</small></div><div className="score-panel"><span>Level {game.level} progress</span><strong>{game.levelScore}/{levelConfig.targetScore}</strong><small>{game.levelSliced} fruits sliced · target {levelConfig.targetScore}</small></div></div><div className="action-row"><button onClick={startRound}>RETRY LEVEL {game.level}</button><button onClick={() => setView('home')}>Dashboard</button><button onClick={() => setView('leaderboard')}>Leaderboard</button></div></section></div>}
          </div>
        </main>
      </div>
    );
  }

  if (view === 'welcome') return user ? <div className="view-enter">{home()}</div> : welcome();
  if (view === 'auth') return auth();
  if (view === 'leaderboard') return <div className="view-enter">{leaderboard()}</div>;
  if (view === 'profile') return <div className="view-enter">{profile()}</div>;
  if (view === 'game') return <div className="view-enter">{gameView()}</div>;
  return <div className="view-enter">{home()}</div>;
}

export default App;
