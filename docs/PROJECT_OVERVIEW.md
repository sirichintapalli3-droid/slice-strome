# SLICE STORM Project Overview

## Purpose

SLICE STORM is a browser based fruit slicing game. Players create an account, play campaign levels, track results, earn gems, and spend them on a 3D house construction project. The dashboard is the main signed-in destination; successful login and registration lead there before a player starts a game.

## Architecture

The application has two main parts:

- **Frontend:** React 19 and Vite in `frontend/client/`. It renders the welcome page, dashboard, authentication, game, profile, leaderboard, live play, and house scene.
- **Backend:** Python Flask in `backend/app.py`. It authenticates players and stores profiles, campaign progress, game sessions and results, rewards, wallet transactions, challenges, and construction state.

SQLite is the local development database. PostgreSQL is recommended for hosted use. The frontend and API can be served from the same origin; during development, Vite forwards `/api` requests to Flask.

## Folder map

```text
backend/
  app.py                         Flask application, routes, and database models
  requirements.txt               Python packages
  level_config.json               Campaign requirements and rewards
  house_construction_steps.json   Ordered construction task definitions
  tests/                          Backend API tests
frontend/
  client/                         React and Vite workspace
    src/App.jsx                   Main screens and game flow
    src/gameLogic.js              Reusable game rules
    src/gameAudio.js              Browser sound effects
    src/components/               Reusable visual components
  static/style.css                Shared responsive styles

docs/                             Project documentation
README.md                         Quick start and project summary
package.json                      Root development and build commands
vercel.json                       Vercel build and function settings
```

## Main features

- Mouse and touch fruit slicing, scoring, combos, lives, bombs, particle effects, and generated audio.
- Classic and Arcade game modes.
- Twenty level campaign with score and fruit targets, increasing difficulty, retry support, and explicit level continuation.
- Player registration, login, profiles, statistics, game history, and scoreboards.
- Server validated gem rewards, a persistent transaction wallet, and daily or achievement gifts.
- One hundred sequential gem funded house construction tasks and a Three.js house scene.
- Friend challenges and live gameplay rooms.

## Authentication and dashboard flow

The frontend sends registration or login details to Flask. The API verifies the credentials, returns a signed JWT and public user profile, then the browser stores the session. The app loads saved campaign progress and shows the dashboard. An authenticated API request sends the JWT in an `Authorization: Bearer <token>` header.

Passwords are stored as hashes by the backend. The browser should not be treated as the authority for reward amounts or campaign completion: the API validates the current game session and the configured level targets before approving a reward.

## Campaign, wallet, and construction data

`backend/level_config.json` defines campaign targets, score requirements, difficulty values, and gem rewards. Level completion requires both configured targets. A successful completion creates a reward that the player claims separately.

Wallet changes are stored as signed transactions. Positive entries add gems; negative entries record spending. `backend/house_construction_steps.json` defines 100 ordered tasks and their costs. The API accepts only the next sequential task and records the purchase and wallet debit together.

## Important files

| File | Role |
| --- | --- |
| `frontend/client/src/App.jsx` | Screens, dashboard, authentication result handling, and gameplay flow |
| `frontend/client/src/gameLogic.js` | Reusable fruit and campaign mechanics |
| `frontend/client/src/components/HouseConstructionScene.jsx` | Interactive Three.js construction scene |
| `backend/app.py` | Flask routes, SQLAlchemy models, auth, and server validation |
| `backend/level_config.json` | Campaign configuration |
| `backend/house_construction_steps.json` | House task configuration |
| `frontend/static/style.css` | Layout, color, responsive behavior, and animations |
