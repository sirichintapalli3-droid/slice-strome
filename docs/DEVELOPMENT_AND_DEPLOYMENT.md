# Development and Deployment Guide

## Requirements

- Python 3.10 or newer
- Node.js and npm

Run the commands from the repository root.

## Install and run locally

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

`npm run dev` starts the Flask API on port 5000 and the Vite frontend on port 5173. Open `http://127.0.0.1:5173`. Vite proxies `/api` requests to Flask. Local SQLite data is stored under `instance/`; the current merged database is `instance/slice_storm_merged.db`. The earlier database files are retained there and under `backend/instance/` as preserved copies.

To start one service at a time:

```bash
npm run backend
npm run client
```

## Production build

Build the React app and start Flask:

```bash
npm run build
npm start
```

Vite writes the production frontend to `frontend/client/dist/`. Flask serves that build and the API from port 5000. Build the frontend before starting Flask in production mode.

## Environment settings

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Database connection. Local development defaults to SQLite; use persistent PostgreSQL for hosting. |
| `JWT_SECRET_KEY` | Private signing key used for JWT sessions. Set a long random value in production. |
| `CORS_ALLOWED_ORIGINS` | Comma separated allowed origins when frontend and API are hosted separately. |
| `VITE_API_URL` | Optional frontend API base URL. Leave empty for a same origin deployment. |

`.env.example` shows backend variable names. Keep real credentials in environment variables or hosting settings. Do not commit `.env` files or database credentials.

## Vercel deployment

The root `app.py` exposes the Flask application implemented in `backend/app.py`. The root `requirements.txt` includes `backend/requirements.txt`, and `vercel.json` builds the React frontend and configures the Python function. In Vercel project settings:

1. Set `DATABASE_URL` to a persistent PostgreSQL connection string.
2. Set `JWT_SECRET_KEY` to a private random secret.
3. Set `CORS_ALLOWED_ORIGINS` only when the browser app and API use separate origins.
4. Redeploy after saving configuration.

Do not rely on local SQLite files for serverless persistence. Keep frontend and backend on one origin where possible so `VITE_API_URL` can remain unset.

## Configuration data

- `backend/level_config.json` holds level targets, scoring requirements, difficulty, and gem rewards.
- `backend/house_construction_steps.json` holds construction task labels, order, and prices.

Update these files when changing campaign or construction balance. The backend reads both files to validate player actions.

## Useful commands

```bash
npm run dev                              # Start backend and frontend
npm run backend                          # Start Flask only
npm run client                           # Start Vite only
npm run build                            # Build production frontend
npm test --workspace=frontend/client     # Run frontend logic tests
python -m unittest backend.tests.test_rewards_api # Run backend API tests
```
