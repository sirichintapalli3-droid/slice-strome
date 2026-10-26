# API Reference

All API routes use the `/api` prefix. Authenticated endpoints require this header:

```http
Authorization: Bearer <token>
```

## Health

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/health` | No | Check API and database connectivity. |

## Authentication and profile

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/auth/register` | No | Create an account and return a session token and public user. |
| `POST /api/auth/login` | No | Verify credentials and return a session token and public user. |
| `GET /api/auth/me` | Yes | Read the current user's profile. |
| `PUT /api/auth/me` | Yes | Update the current user's profile. |
| `GET /api/profile` | Yes | Retrieve player statistics and profile summary. |

## Campaign and games

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/progress` | Yes | Load player campaign progress and level configuration. |
| `PUT /api/progress` | Yes | Save progress or advance to an unlocked level. |
| `POST /api/progress/complete` | Yes | Validate a level result and create its pending reward. |
| `POST /api/rewards/claim` | Yes | Claim a validated level reward once. |
| `POST /api/games/start` | Yes | Start a game session for the selected mode and level. |
| `POST /api/games/complete` | Yes | Save a completed game result. |
| `GET /api/games/history` | Yes | Read the current player's game history. |

## Wallet and gifts

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/wallet` | Yes | Read balance, earned and spent totals, and recent transactions. |
| `POST /api/gifts/daily` | Yes | Claim an available daily gift. |
| `POST /api/gifts/claim` | Yes | Claim an eligible achievement gift. |

## Leaderboards

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/leaderboard` | No | Read leaderboard results. |
| `GET /api/leaderboard/me` | Yes | Read the current player's leaderboard statistics. |

## House construction

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/house` | Yes | Read construction tasks, completion state, and wallet balance. |
| `POST /api/house/build` | Yes | Purchase and complete the next sequential construction step. |
| `POST /api/house/purchase` | Yes | Purchase an optional legacy house item. |

## Friend challenges

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/challenges` | Yes | List the current player's challenges. |
| `POST /api/challenges` | Yes | Create a friend challenge. |
| `POST /api/challenges/join` | Yes | Join a challenge using its code. |

## Live rooms

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/live/rooms` | Yes | List active live rooms. |
| `POST /api/live/rooms` | Yes | Create a live room. |
| `POST /api/live/rooms/<room_id>/join` | Yes | Join a live room. |
| `GET /api/live/rooms/<room_id>/viewers` | Yes | List viewers for the host. |
| `POST /api/live/rooms/<room_id>/end` | Yes | End a hosted room. |
| `POST /api/live/rooms/<room_id>/leave` | Yes | Leave a room. |
| `POST /api/live/rooms/<room_id>/signals` | Yes | Send WebRTC signaling data. |
| `GET /api/live/rooms/<room_id>/signals` | Yes | Poll for WebRTC signaling data. |

The live signaling routes exchange connection metadata for browser peer connections; media is handled by the browser streaming APIs.
