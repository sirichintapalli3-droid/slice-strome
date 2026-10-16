const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'slice-storm-dev-secret';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

let store = {
  users: [],
  games: [],
  sessions: []
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  }
}

function loadStore() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    if (!raw) {
      return store;
    }
    const parsed = JSON.parse(raw);
    store = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      games: Array.isArray(parsed.games) ? parsed.games : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
    };
    return store;
  } catch (error) {
    console.warn('Failed to parse store file; using default memory store');
    return store;
  }
}

function saveStore() {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = store.users.find((item) => item.id === decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

loadStore();

async function connectMongo() {
  if (!process.env.MONGODB_URI) {
    console.log('MongoDB URI not configured. Using local in-memory persistence.');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
  } catch (error) {
    console.warn('MongoDB connection failed. Using local in-memory persistence instead.');
  }
}

connectMongo();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'SLICE STORM backend is running' });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (store.users.some((user) => user.email === normalizedEmail)) {
    return res.status(409).json({ message: 'User already exists' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }

  const hashedPassword = await bcrypt.hash(String(password), 10);
  const newUser = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(name).trim(),
    email: normalizedEmail,
    password: hashedPassword,
    highestScore: 0,
    totalGames: 0,
    totalFruitsSliced: 0,
    highestCombo: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  store.users.push(newUser);
  saveStore();

  const token = generateToken(newUser);
  return res.status(201).json({
    token,
    user: sanitizeUser(newUser)
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = store.users.find((item) => item.email === normalizedEmail);

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const isValid = await bcrypt.compare(String(password), user.password);
  if (!isValid) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = generateToken(user);
  return res.json({
    token,
    user: sanitizeUser(user)
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

app.post('/api/games/start', (req, res) => {
  const requestedMode = req.body?.mode || 'classic';
  const userId = req.user ? req.user.id : null;
  const sessionId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const session = {
    id: sessionId,
    userId,
    mode: requestedMode,
    startedAt: new Date().toISOString(),
    status: 'active'
  };

  store.sessions.push(session);
  saveStore();

  res.status(201).json({ session: session });
});

app.post('/api/games/complete', (req, res) => {
  const payload = req.body || {};
  const { gameId, mode, score, fruitsSliced, bombsHit, maxCombo, duration, accuracy } = payload;

  if (!gameId) {
    return res.status(400).json({ message: 'Game session id is required' });
  }

  const session = store.sessions.find((item) => item.id === gameId);
  if (!session) {
    return res.status(404).json({ message: 'Unknown game session' });
  }

  if (session.status === 'completed') {
    return res.status(409).json({ message: 'Game session already completed' });
  }

  const validatedScore = Number(score);
  const validatedFruits = Number(fruitsSliced || 0);
  const validatedBombs = Number(bombsHit || 0);
  const validatedCombo = Number(maxCombo || 0);
  const validatedDuration = Number(duration || 0);
  const validatedAccuracy = Number(accuracy || 0);

  if (!Number.isFinite(validatedScore) || validatedScore < 0) {
    return res.status(400).json({ message: 'Score is invalid' });
  }

  if (!Number.isFinite(validatedFruits) || validatedFruits < 0) {
    return res.status(400).json({ message: 'Fruit count is invalid' });
  }

  if (!Number.isFinite(validatedBombs) || validatedBombs < 0) {
    return res.status(400).json({ message: 'Bomb count is invalid' });
  }

  if (!Number.isFinite(validatedDuration) || validatedDuration < 0 || validatedDuration > 3600) {
    return res.status(400).json({ message: 'Duration is invalid' });
  }

  const gameRecord = {
    id: `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: req.user ? req.user.id : session.userId,
    gameId,
    mode: mode || session.mode || 'classic',
    score: validatedScore,
    fruitsSliced: validatedFruits,
    bombsHit: validatedBombs,
    maxCombo: validatedCombo,
    duration: validatedDuration,
    accuracy: validatedAccuracy,
    status: 'completed',
    createdAt: new Date().toISOString()
  };

  store.games.push(gameRecord);
  session.status = 'completed';

  if (gameRecord.userId) {
    const user = store.users.find((item) => item.id === gameRecord.userId);
    if (user) {
      user.highestScore = Math.max(user.highestScore || 0, validatedScore);
      user.totalGames = (user.totalGames || 0) + 1;
      user.totalFruitsSliced = (user.totalFruitsSliced || 0) + validatedFruits;
      user.highestCombo = Math.max(user.highestCombo || 0, validatedCombo);
      user.updatedAt = new Date().toISOString();
    }
  }

  saveStore();
  return res.status(201).json({ game: gameRecord });
});

app.get('/api/games/history', (req, res) => {
  const userId = req.user ? req.user.id : null;
  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const history = store.games
    .filter((game) => game.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.json({ history });
});

app.get('/api/leaderboard', (req, res) => {
  const leaderboard = store.games
    .filter((game) => game.status === 'completed')
    .map((game) => {
      const user = store.users.find((entry) => entry.id === game.userId);
      return {
        name: user ? user.name : 'Guest',
        score: game.score,
        mode: game.mode,
        createdAt: game.createdAt
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return res.json({ leaderboard });
});

app.get('/api/leaderboard/me', authMiddleware, (req, res) => {
  const userGames = store.games.filter((game) => game.userId === req.user.id);
  const sorted = [...userGames].sort((a, b) => b.score - a.score);
  const rank = store.games
    .filter((game) => game.status === 'completed')
    .map((game) => ({ userId: game.userId, score: game.score }))
    .sort((a, b) => b.score - a.score)
    .findIndex((game) => game.userId === req.user.id);

  const playerBest = sorted[0]?.score || 0;
  const position = rank >= 0 ? rank + 1 : null;

  return res.json({
    name: req.user.name,
    bestScore: playerBest,
    position,
    totalGames: userGames.length
  });
});

const server = app.listen(PORT, () => {
  console.log(`SLICE STORM backend running on http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
