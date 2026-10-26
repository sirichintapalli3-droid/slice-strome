# SLICE STORM

SLICE STORM is a browser based fruit slicing game with player accounts, a level campaign, scoreboards, live play, gem rewards, and a house construction feature. React renders the game and dashboard. A Flask API handles accounts, game results, campaign progress, rewards, and saved player data.

Detailed guides: [Project Overview](docs/PROJECT_OVERVIEW.md), [Development and Deployment](docs/DEVELOPMENT_AND_DEPLOYMENT.md), and [API Reference](docs/API_REFERENCE.md).

## Project layout

```text
.
├── backend/                 # Active Python API and its data/configuration
│   ├── app.py               # Flask application, database models, and API routes
│   ├── requirements.txt     # Python dependencies
│   ├── level_config.json    # Campaign targets, difficulty, and level rewards
│   ├── house_construction_steps.json # Ordered house tasks and costs
│   ├── tests/               # Backend API tests
├── frontend/                # Browser app and shared visual styles
│   ├── client/              # React 19 and Vite workspace
│   │   ├── src/App.jsx      # Screens, dashboard, authentication, and game flow
│   │   ├── src/gameLogic.js # Reusable gameplay rules
│   │   ├── src/gameAudio.js # Browser generated sound effects
│   │   ├── src/components/  # Landing and 3D house scene components
│   │   ├── public/          # Public static assets
│   │   └── vite.config.js   # Dev server and Flask API proxy
│   └── static/style.css     # Shared responsive styles and animations
├── package.json             # Root scripts and npm workspace declaration
├── package-lock.json        # Root npm dependency lockfile
├── docs/                    # Project overview, setup, and API documentation
├── vercel.json              # Vercel build and Python function configuration
└── README.md                # This project and operating guide
```

The root npm workspace is `frontend/client`. `backend/app.py` is the active backend.

## What the project does

- Lets visitors register or log in; a successful login or registration opens the dashboard.
- Supports Classic and Arcade fruit slicing with mouse or touch, combos, score, lives, bombs, particles, and sound effects.
- Saves player profiles, game history, statistics, level progress, and leaderboard results.
- Provides a twenty level campaign. Each level has score and fruit targets, rising difficulty, retry support, and an explicit continue action.
- Awards gems after the server validates a completed level. The wallet records earned and spent transactions.
- Offers 100 sequential house construction tasks that use gems from the player's wallet.
- Includes friend challenges, live game streaming, and a Three.js house scene.
- Uses SQLite for local development. PostgreSQL is recommended for hosted deployments.

## Requirements

- Python 3.10 or newer
- Node.js and npm

## Install and run locally

From the repository root, install Python packages and JavaScript workspace dependencies.

### Windows PowerShell

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
npm install
npm run dev
```

### macOS or Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
npm install
npm run dev
```

The development command starts Flask on port 5000 and Vite on port 5173. Open http://127.0.0.1:5173. Vite forwards `/api` requests to Flask. To start either process separately, use `npm run backend` or `npm run client` from the repository root.

## Build and serve the production frontend

Build the React app from the repository root:

```bash
npm run build
```

The build is written to `frontend/client/dist/`. Start Flask with `npm start` or `python -m backend.app`, then open http://127.0.0.1:5000. Flask serves the built frontend and the API from one origin. Build before starting Flask for production; the development workflow uses Vite instead.

## Configuration and data

Flask creates its database tables at startup. With no `DATABASE_URL`, local development uses SQLite. Set `JWT_SECRET_KEY` to a private random value for deployed use. `CORS_ALLOWED_ORIGINS` is a comma separated list used when the browser app and API have different origins. `VITE_API_URL` is optional and should normally remain empty for a same-origin deployment. `.env.example` shows backend variable names; do not commit real credentials or `.env` files.

For Vercel, configure `DATABASE_URL` to a persistent PostgreSQL database and `JWT_SECRET_KEY` in project settings, then redeploy. The root `vercel.json` builds the frontend and includes its output and backend JSON configuration with the Flask function. Local SQLite is suitable for development but should not be used as persistent storage on a serverless deployment.

Campaign targets, score requirements, difficulty, and rewards are in `backend/level_config.json`. Construction task labels and gem costs are in `backend/house_construction_steps.json`. The backend validates level completion and reward amounts; the browser does not choose the gem award. Construction steps must be completed in order. Wallet history records transactions, and existing balances are retained during database setup/backfills.

## API overview

All API routes use the `/api` prefix. Authenticated routes expect `Authorization: Bearer <token>`.

| Area | Routes | Purpose |
| --- | --- | --- |
| Health | `GET /api/health` | Backend and database health |
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET/PUT /api/auth/me` | Create account, start session, view or update profile |
| Profile and wallet | `GET /api/profile`, `GET /api/wallet`, `POST /api/gifts/daily`, `POST /api/gifts/claim` | Player stats, gem balance, and gifts |
| Campaign | `GET/PUT /api/progress`, `POST /api/progress/complete`, `POST /api/rewards/claim` | Load/save level progress, validate completion, claim gems |
| Games | `POST /api/games/start`, `POST /api/games/complete`, `GET /api/games/history` | Track rounds and results |
| Leaderboard | `GET /api/leaderboard`, `GET /api/leaderboard/me` | Global and personal score summaries |
| House | `GET /api/house`, `POST /api/house/build`, `POST /api/house/purchase` | Inspect and purchase construction tasks |
| Challenges | `GET/POST /api/challenges`, `POST /api/challenges/join` | List, create, or join a friend challenge |
| Live play | `GET/POST /api/live/rooms`, room join/viewer/end/leave routes | Manage live rooms and streaming sessions |

## Developer commands

```bash
npm run dev                  # Flask and Vite together
npm run backend              # Flask only
npm run client               # Vite only
npm run build                # Production frontend build
npm test --workspace=frontend/client # Frontend logic tests
python -m unittest backend.tests.test_rewards_api # Backend API tests
```
