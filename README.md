# Identity-Verified Multiplayer Arena

Course project for **CS6.201: Introduction to Software Systems**.

This project is a full-stack multiplayer Tic-Tac-Toe arena where players do not sign in with passwords. Instead, every user is verified through a webcam-based facial login against profile images harvested from the batch websites. After login, users enter a live WebSocket lobby, challenge each other in real time, play in isolated game rooms, and receive Elo updates when a match ends.

The app is built around the four project phases: data harvesting, biometric authentication, synchronized multiplayer gameplay, and Elo-based ranking.

## What This Project Does

- Scrapes student profile images from the URLs listed in `backend/batch_data.csv`.
- Stores relational user metadata in MySQL.
- Stores profile images and face encodings in MongoDB.
- Authenticates users through facial recognition instead of passwords.
- Issues short-lived JWTs after successful biometric login.
- Maintains a live lobby of online users through WebSockets.
- Supports real-time challenge requests, accept/decline flows, and isolated game rooms.
- Runs server-authoritative Tic-Tac-Toe, so clients cannot directly mutate game state.
- Handles wins, draws, and disconnect forfeits.
- Updates Elo ratings after each completed match.
- Shows a global leaderboard sorted by rating.

## Tech Stack

- **Frontend:** HTML, CSS, vanilla JavaScript
- **Backend:** FastAPI, Python
- **Realtime:** FastAPI WebSockets
- **Relational database:** MySQL
- **Asset database:** MongoDB
- **Authentication:** Webcam capture, facial recognition, JWT
- **Package manager:** uv

## Repository Structure

```text
.
|-- backend
|   |-- batch_data.csv
|   |-- main.py
|   |-- services
|   |   |-- auth.py
|   |   |-- connection_manager.py
|   |   |-- elo.py
|   |   |-- game_logic.py
|   |   `-- parser.py
|   `-- utils
|       |-- database.py
|       |-- facial_recognition_module.py
|       |-- jwt.py
|       `-- schema.sql
|-- frontend
|   |-- biometric.html
|   |-- board.html
|   |-- index.html
|   |-- leaderboard.html
|   |-- script.js
|   `-- style.css
|-- pyproject.toml
|-- uv.lock
`-- README.md
```

## Database Design

### MySQL

MySQL stores structured user metadata and mutable ranking/presence fields.

Database name: `tictactoe`

```sql
CREATE TABLE IF NOT EXISTS users (
    uid VARCHAR(64) NOT NULL PRIMARY KEY,
    name VARCHAR(100) DEFAULT NULL,
    elo_rating INT NOT NULL DEFAULT 1200,
    is_online BOOLEAN NOT NULL DEFAULT FALSE
);
```

The `users` table is used for:

- Confirming that a facial-recognition match belongs to a known user.
- Tracking whether a user is currently online.
- Fetching live lobby users.
- Fetching and updating Elo ratings.
- Rendering the global leaderboard.

### MongoDB

MongoDB stores unstructured profile image assets.

Database: `student_assets`

Collection: `profile_images`

Each document is keyed by `uid` and stores the scraped image data. The scraper also stores an image hash and, when possible, a precomputed face encoding to make login faster.

Approximate document shape:

```json
{
  "uid": "2025xxxxxx",
  "image": "BSON binary image data",
  "image_hash": "sha256 hash",
  "encoding": [0.012, -0.034, 0.128]
}
```

The image is stored as BSON binary data. The provided facial recognition utility can consume the stored image data or cached encodings.

## Environment Variables

Create a `.env` file in the repository root.

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=tictactoe
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MONGODB_CONNECTION_STRING=your_mongodb_connection_string
SECRET_KEY=replace_this_with_a_random_secret
```

Important: the backend code expects the MongoDB variable to be named `MONGODB_CONNECTION_STRING`.

## Setup

### 1. Install dependencies

From the repository root:

```bash
uv sync
```

If dependencies need to be added manually, the important packages are already listed in `pyproject.toml`, including FastAPI, PyMySQL, PyMongo, face-recognition, Pillow, NumPy, requests, python-dotenv, PyJWT, and websockets.

### 2. Create the MySQL schema

Make sure your MySQL server is running and that the user in `.env` has permission to create/use the database.

```bash
mysql -u your_mysql_user -p < backend/utils/schema.sql
```

If your MySQL user already has a default database configured, this still works because `schema.sql` creates and selects `tictactoe`.

### 3. Populate MySQL and MongoDB

Run the scraper/harvester from the repository root:

```bash
uv run python -m backend.services.parser
```

This script reads `backend/batch_data.csv`, requests each student's profile image from:

```text
https://<website_url>/images/pfp.jpg
```

For each successful image fetch, it:

- Inserts or updates the user's `uid` and `name` in MySQL.
- Stores the profile image in MongoDB.
- Stores a SHA-256 image hash.
- Stores a face encoding when one can be generated.

Failures such as missing images, 404 responses, timeouts, or invalid face images are logged and do not stop the entire pipeline.

## Running the Project

You need two terminals: one for the backend and one for the frontend.

### Terminal 1: backend API and WebSocket server

From the repository root:

```bash
uv run python -m uvicorn backend.main:app --reload --port 8005 --host 0.0.0.0
```

This starts:

- HTTP API endpoints such as `/login`, `/me`, `/lobby`, and `/leaderboard`.
- The WebSocket endpoint at `/ws/`.

### Terminal 2: frontend server

From the `frontend` directory:

```bash
python -m http.server 5000
```

Then open:

```text
http://localhost:5000/biometric.html
```

If the frontend needs to talk to a different backend host, update `API_BASE_URL` at the top of `frontend/script.js`.

## Main Pages

- `frontend/biometric.html`: webcam-based facial login.
- `frontend/index.html`: live lobby and challenge dashboard.
- `frontend/board.html`: Tic-Tac-Toe arena.
- `frontend/leaderboard.html`: global Elo leaderboard.

## API Overview

### `POST /login`

Receives a webcam frame from the frontend, compares it against stored MongoDB profile images/encodings, and returns a JWT if a user is matched.

On success:

- The matched UID is checked against MySQL.
- A JWT is issued.
- `is_online` is set to `TRUE`.

### `GET /me`

Returns the currently authenticated user using the bearer token.

### `GET /lobby`

Returns all users whose `is_online` flag is currently `TRUE`.

### `GET /leaderboard`

Returns all users sorted by descending Elo rating.

### `WebSocket /ws/?token=<jwt>`

Handles the live parts of the system:

- Presence updates.
- Lobby snapshots.
- Challenge requests.
- Challenge accept/reject messages.
- Game room creation.
- Server-validated moves.
- Game-over broadcasts.
- Disconnect forfeits.

## Game Flow

1. A user logs in through webcam facial verification.
2. The backend returns a JWT and marks the user online.
3. The frontend opens a WebSocket connection using that JWT.
4. The user appears in the live lobby.
5. One user challenges another online user.
6. The challenged user receives a real-time alert and can accept or decline.
7. On accept, the backend creates a game room only for those two users.
8. The server assigns X to the challenger and O to the acceptor.
9. Clients send desired moves to the server.
10. The server validates turn order, board bounds, and whether the cell is empty.
11. The server broadcasts the updated board to both players.
12. When the game ends, the backend applies Elo updates and broadcasts the final result.

## Elo Rating

All users start with an Elo rating of `1200`.

The project uses the standard Elo formula with `K = 32`:

```text
E = 1 / (1 + 10 ^ ((R_opponent - R_player) / 400))
R_new = R_old + K * (S - E)
```

Scores are assigned as:

- Win: `1.0`
- Draw: `0.5`
- Loss: `0.0`

Both players' expected scores are computed using their ratings from the start of the match. The updated ratings are rounded and saved back to MySQL.

## Disconnect Handling

If a player disconnects during an active game, the backend waits for a short grace period. If the player does not reconnect, the match is treated as a forfeit:

- The disconnected player loses.
- The remaining player wins.
- Elo ratings are updated.
- The result is broadcast to the remaining player.

This prevents a browser close or network drop from leaving the opponent stuck in an unfinished match.

## Assumptions

- The student profile image path is always attempted as `/images/pfp.jpg` under each website URL from `batch_data.csv`.
- Users authenticate only through facial recognition; there is no password login flow.
- JWTs are short-lived and stored client-side for authenticated API and WebSocket calls.
- MySQL is the source of truth for user metadata, online status, and Elo ratings.
- MongoDB is the source of truth for scraped profile images and face encodings.
- Active challenges and active game state are held in backend memory while the server is running.
- Running multiple backend processes at the same time is not supported by the in-memory game manager.
- The frontend is served separately as static files.
- For local runs, `frontend/script.js` may need its `API_BASE_URL` changed to match the machine running the backend.



