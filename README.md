# SLICE STORM

SLICE STORM is a browser fruit-slicing arcade game with a dark, restrained arcade interface. Sign in or play locally, choose Classic or Arcade mode, slice fruit with a mouse or touch swipe, complete level targets, avoid bombs, and compare scores on the leaderboard.

## Gameplay

- Start a round from the home screen, then press **PLAY NOW** on the ready screen.
- Slice fruit by clicking it or dragging across it. Consecutive cuts add a capped score multiplier, with an additional multiplier in Arcade mode.
- Missing fruit costs a life. Hitting a bomb ends the round.
- Every level has a target shown above the game board. Level 1 asks for 5 fruit slices; each level adds 2 to the target.
- Completing a target pauses the game and displays a celebration with animated fireworks and a short firework sound. Choose **GO TO LEVEL** to continue; levels do not advance automatically.
- The campaign ends at Level 20 with a champion screen.
- If the player loses, **RETRY LEVEL** restarts at that level and retains its slice-target progress. Lives and round score reset for the retry.
- Difficulty rises by level: fruit and bomb movement speeds increase, spawns become more frequent, and bomb probability rises gradually. These increases are capped.
- The Game Over screen reports run score, campaign progress, and the current level retry option.

## Features

- React game UI with mouse and touch controls
- Fruit slicing, score, combo multipliers, lives, bombs, particles, and swipe effects
- Twenty-level campaign, escalating targets, explicit next-level confirmation, and same-level retries
- Classic and Arcade modes
- Restrained dark-green visual system across the landing page, dashboard, gameplay, profile, and leaderboard
- Login and registration, player profile, game history, statistics, and leaderboards
- Browser-generated start, slice, bomb, level-up, and firework sounds with a sound toggle
- Responsive home screen, HUD, level target, game board, and campaign completion screens
- SQLite database created automatically for local use
- Expired login sessions are cleared; fruit IDs have a fallback for browsers without `crypto.randomUUID()`

## Technology

- **Frontend:** React 19 and Vite
- **Backend:** Python 3 and Flask
- **Database:** SQLite with Flask-SQLAlchemy
- **Authentication:** Flask-JWT-Extended and Werkzeug password hashing
- **Audio:** Web Audio API; sound effects are generated in the browser
- **Styling:** `static/style.css`

Flask serves the compiled React app from `client/dist/`. The root npm package is an npm workspace containing `client`; install dependencies once from the project root. `server/` is a separate legacy Express backend and is not used by the Flask app.

## Project Structure

```text
.
├── app.py                  # Flask app, API routes, models, and SQLite setup
├── requirements.txt        # Python dependencies
├── client/
│   ├── src/App.jsx         # React screens, game loop, levels, and interactions
│   ├── src/gameAudio.js    # Browser-generated sound effects
│   ├── src/main.jsx        # React entry point and shared stylesheet import
│   ├── index.html          # Vite HTML entry point
│   ├── vite.config.js      # Vite config and development API proxy
│   └── dist/               # Generated build served by Flask
├── static/style.css       # Shared responsive styles and animations
├── instance/               # Local SQLite database
├── server/                 # Legacy Express backend; not used by Flask
├── package.json            # Root npm workspace and scripts
├── package-lock.json       # Root workspace lockfile
└── README.md
```

## Requirements

- Python 3.10 or newer
- Node.js and npm

## Install and Run

From the project root, install the single npm workspace dependency tree and Python dependencies.

### Windows PowerShell

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
npm.cmd install
npm.cmd run dev
```

### macOS or Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install
npm run dev
```

The development command starts Flask and Vite together. Open [http://127.0.0.1:5173](http://127.0.0.1:5173) for the Vite development app. Vite proxies `/api` requests to Flask on port 5000.

## Production Build and Flask

Build the React app from the project root:

```powershell
npm.cmd run build
```

On macOS or Linux, use `npm run build`. This writes the generated app to `client/dist/`. Start Flask with `python app.py` (or `python3 app.py`) and open [http://127.0.0.1:5000](http://127.0.0.1:5000). Flask returns a setup message if the frontend has not been built yet.

## Configuration

Flask uses SQLite by default for local development and creates its database tables at startup. Set a persistent PostgreSQL `DATABASE_URL` for deployment. Optional environment variables:

```text
DATABASE_URL=sqlite:///slice_storm.db
JWT_SECRET_KEY=Nothing
PORT=5000
```

The built-in JWT secret is for local development only. Set a private `JWT_SECRET_KEY` before deployment.

## Deploying on Vercel

The root `app.py` serves the Flask API and the built React app. Vercel builds the frontend with `npm run build`; the Python runtime serves the Flask app. Local SQLite is not persistent on Vercel, so connect a hosted PostgreSQL database such as Neon and set these variables in the Vercel project settings:

- `DATABASE_URL` — the PostgreSQL connection string from Neon
- `JWT_SECRET_KEY` — a long, randomly generated secret

The frontend calls the API on the same deployment by default. Leave `VITE_API_URL` unset unless the API is hosted separately. Never commit `.env` files or database credentials.

## API Routes

- `POST /api/auth/register` — create an account
- `POST /api/auth/login` — log in and receive a JWT
- `GET /api/auth/me` — retrieve the authenticated user
- `POST /api/games/start` — create a game session
- `POST /api/games/complete` — save a completed game result
- `GET /api/games/history` — retrieve the authenticated user's game history
- `GET /api/leaderboard` — retrieve top scores
- `GET /api/leaderboard/me` — retrieve the authenticated user's leaderboard statistics
- `GET /api/health` — backend health check

## Recent Project Work

- Replaced the unused legacy static frontend entry point with the React/Vite app served from `client/dist/`, and updated the project documentation to match.
- Added responsive fruit-slicing visuals, corrected fruit positioning and slicing hit tests, and made swipe input work across animation redraws.
- Added immediate fruit spawning at the start of a round.
- Added a level target/progress display, escalating difficulty, a celebratory dancer and firework effects, and a Level 20 campaign cap.
- Made level completion explicit and allowed retries to resume the current level and its slice-target progress.
- Added a persistent emoji profile avatar picker and use of the avatar on the home screen and game HUD.
- Added browser-compatible fruit ID generation, expired-token cleanup, and a favicon entry to avoid the related console errors.
- Removed the long sad Game Over melody while keeping the dismissible sad-face emoji.
- Refreshed the home hero, Play button, game HUD, level progress bar, fruit effects, and responsive styling.
