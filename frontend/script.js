const API_BASE_URL = "http://10.2.137.53:8005";
const TOKEN_KEY = "access_token";
const OPPONENT_KEY = "selected_opponent_uid";
const CURRENT_GAME_KEY = "current_game_id";
const MOCK_USERS_KEY = "mock_fastapi_users";
const MOCK_SESSIONS_KEY = "mock_fastapi_sessions";
const MOCK_GAMES_KEY = "mock_fastapi_games";
const MOCK_LOGIN_UID_KEY = "mock_fastapi_login_uid";

let videoStream = null;
let isCapturing = false;
let boardState = null;
let currentUser = null;
let notificationsOpen = false;
let leaderboardPage = 1;
const LEADERBOARD_PAGE_SIZE = 10;
let realtimeSocket = null;
let realtimeReconnectId = null;
let realtimeIntentionalClose = false;
let realtimeReady = false;
let realtimeHeartbeatId = null;
let realtimePongTimeoutId = null;
let realtimeConnectStartedAt = 0;
let lobbyUsers = [];
let notifications = [];
let notificationHandlersBound = false;
let outgoingChallenges = new Set();
let incomingChallenges = new Map();
const REALTIME_HEARTBEAT_MS = 15000;
const REALTIME_PONG_TIMEOUT_MS = 5000;
const REALTIME_CONNECT_TIMEOUT_MS = 4000;

seedMockData();

document.addEventListener("DOMContentLoaded", () => {
  initPage().catch((error) => {
    console.error(error);
    window.alert(error.message || "Something went wrong in the Arena.");
  });
});

window.addEventListener("beforeunload", () => {
  closeRealtimeConnection(true);
  stopCamera();
  stopBoardTimer();
});

window.addEventListener("load", () => {
  ensureRealtimeConnection();
});

window.addEventListener("focus", () => {
  ensureRealtimeConnection();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    ensureRealtimeConnection();
  }
});

window.addEventListener("storage", () => {
  const page = document.body.dataset.page || detectPage();
  if (!currentUser) return;

  if (page === "lobby") {
    initLobbyPage(currentUser).catch(console.error);
  }

  if (page === "leaderboard") {
    initLeaderboardPage(currentUser).catch(console.error);
  }
});

function seedMockData() {
  if (!localStorage.getItem(MOCK_USERS_KEY)) {
    localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(createDefaultUsers()));
  }

  if (!localStorage.getItem(MOCK_SESSIONS_KEY)) {
    localStorage.setItem(MOCK_SESSIONS_KEY, JSON.stringify({}));
  }

  if (!localStorage.getItem(MOCK_GAMES_KEY)) {
    localStorage.setItem(MOCK_GAMES_KEY, JSON.stringify({}));
  }

  if (!localStorage.getItem(MOCK_LOGIN_UID_KEY)) {
    localStorage.setItem(MOCK_LOGIN_UID_KEY, "tactician");
  }
}

function createDefaultUsers() {
  return {
    tactician: {
      uid: "tactician",
      name: "Tactician",
      elo_rating: 1450,
      wins: 18,
      losses: 11,
      draws: 4,
      is_online: false,
      avatar:
        "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop",
      title: "The Heritage Tactician",
    },
    ebonyrook: {
      uid: "ebonyrook",
      name: "EbonyRook",
      elo_rating: 1680,
      wins: 29,
      losses: 12,
      draws: 3,
      is_online: true,
      avatar:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop",
      title: "Counterplay Savant",
    },
    velvetqueen: {
      uid: "velvetqueen",
      name: "VelvetQueen",
      elo_rating: 1540,
      wins: 21,
      losses: 17,
      draws: 5,
      is_online: true,
      avatar:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop",
      title: "Positional Artist",
    },
    marblepawn: {
      uid: "marblepawn",
      name: "MarblePawn",
      elo_rating: 1420,
      wins: 14,
      losses: 19,
      draws: 2,
      is_online: true,
      avatar:
        "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop",
      title: "Solid Endgame Specialist",
    },
    ivorybishop: {
      uid: "ivorybishop",
      name: "IvoryBishop",
      elo_rating: 2105,
      wins: 48,
      losses: 16,
      draws: 6,
      is_online: true,
      avatar:
        "https://images.unsplash.com/photo-1504593811423-6dd665756598?w=400&h=400&fit=crop",
      title: "Grandmaster",
    },
    crimsonknight: {
      uid: "crimsonknight",
      name: "CrimsonKnight",
      elo_rating: 1765,
      wins: 33,
      losses: 18,
      draws: 4,
      is_online: true,
      avatar:
        "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop",
      title: "Tempo Hunter",
    },
    silkgambit: {
      uid: "silkgambit",
      name: "SilkGambit",
      elo_rating: 1635,
      wins: 27,
      losses: 16,
      draws: 6,
      is_online: true,
      avatar:
        "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&h=400&fit=crop",
      title: "Opening Trickster",
    },
    ironsentinel: {
      uid: "ironsentinel",
      name: "IronSentinel",
      elo_rating: 1588,
      wins: 24,
      losses: 21,
      draws: 3,
      is_online: true,
      avatar:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop",
      title: "Fortress Builder",
    },
    amberoracle: {
      uid: "amberoracle",
      name: "AmberOracle",
      elo_rating: 1712,
      wins: 31,
      losses: 15,
      draws: 5,
      is_online: true,
      avatar:
        "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400&h=400&fit=crop",
      title: "Visionary Calculator",
    },
    obsidianfox: {
      uid: "obsidianfox",
      name: "ObsidianFox",
      elo_rating: 1495,
      wins: 19,
      losses: 17,
      draws: 7,
      is_online: true,
      avatar:
        "https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=400&h=400&fit=crop",
      title: "Counterattack Specialist",
    },
    moonlitcastle: {
      uid: "moonlitcastle",
      name: "MoonlitCastle",
      elo_rating: 1828,
      wins: 37,
      losses: 14,
      draws: 8,
      is_online: true,
      avatar:
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop",
      title: "Endgame Architect",
    },
    sagefork: {
      uid: "sagefork",
      name: "SageFork",
      elo_rating: 1522,
      wins: 22,
      losses: 20,
      draws: 4,
      is_online: true,
      avatar:
        "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=400&h=400&fit=crop",
      title: "Tactical Theorist",
    },
  };
}

function parseJsonBody(body) {
  if (!body) return {};
  if (typeof body === "string") return JSON.parse(body);
  return body;
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function readUsers() {
  return JSON.parse(localStorage.getItem(MOCK_USERS_KEY) || "{}");
}

function writeUsers(users) {
  localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
}

function upsertLocalUser(user) {
  if (!user?.uid) return;

  const users = readUsers();
  const existing = users[user.uid] || {};
  users[user.uid] = {
    uid: user.uid,
    name: user.name || existing.name || user.uid,
    elo_rating: user.elo_rating ?? existing.elo_rating ?? 1200,
    wins: existing.wins ?? 0,
    losses: existing.losses ?? 0,
    draws: existing.draws ?? 0,
    is_online: user.is_online ?? existing.is_online ?? false,
    avatar: existing.avatar || null,
    title: existing.title || null,
  };
  writeUsers(users);
}

function syncUsersForMockGame(users) {
  users.forEach((user) => upsertLocalUser(user));
}

function readSessions() {
  return JSON.parse(localStorage.getItem(MOCK_SESSIONS_KEY) || "{}");
}

function writeSessions(sessions) {
  localStorage.setItem(MOCK_SESSIONS_KEY, JSON.stringify(sessions));
}

function readGames() {
  return JSON.parse(localStorage.getItem(MOCK_GAMES_KEY) || "{}");
}

function writeGames(games) {
  localStorage.setItem(MOCK_GAMES_KEY, JSON.stringify(games));
}

function createToken(uid) {
  return `mock-token-${uid}-${Date.now()}`;
}

function getHeaderValue(headers, key) {
  if (!headers) return null;

  if (headers instanceof Headers) {
    return headers.get(key);
  }

  if (Array.isArray(headers)) {
    const match = headers.find(
      ([header]) => header.toLowerCase() === key.toLowerCase(),
    );
    return match ? match[1] : null;
  }

  const directMatch = Object.keys(headers).find(
    (header) => header.toLowerCase() === key.toLowerCase(),
  );
  return directMatch ? headers[directMatch] : null;
}

function requireMockAuth(headers) {
  const authHeader = getHeaderValue(headers, "Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw { status: 401, message: "Missing authorization header" };
  }

  const token = authHeader.slice("Bearer ".length);
  const sessions = readSessions();
  const uid = sessions[token];
  if (!uid) {
    throw { status: 401, message: "Invalid token" };
  }

  return uid;
}

function mockLogin(body) {
  const users = readUsers();
  const requestedUid =
    body.mock_uid || localStorage.getItem(MOCK_LOGIN_UID_KEY) || "tactician";
  const user = users[requestedUid] || users.tactician;

  users[user.uid].is_online = true;
  writeUsers(users);

  const sessions = readSessions();
  const token = createToken(user.uid);
  sessions[token] = user.uid;
  writeSessions(sessions);

  return {
    access_token: token,
    token_type: "bearer",
  };
}

function mockGetMe(uid) {
  const users = readUsers();
  const user = users[uid];
  if (!user) {
    throw { status: 404, message: "User not found" };
  }

  return {
    uid: user.uid,
    name: user.name,
    elo_rating: user.elo_rating,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
    is_online: user.is_online,
    avatar: user.avatar,
    title: user.title,
  };
}

function mockGetLobby() {
  return Object.values(readUsers())
    .filter((user) => user.is_online)
    .sort(
      (left, right) =>
        right.elo_rating - left.elo_rating ||
        left.name.localeCompare(right.name),
    )
    .map((user) => ({
      uid: user.uid,
      name: user.name,
      elo_rating: user.elo_rating,
      is_online: user.is_online,
      avatar: user.avatar,
      title: user.title,
    }));
}

function mockGetLeaderboard(currentUid) {
  const users = Object.values(readUsers()).sort(
    (left, right) =>
      right.elo_rating - left.elo_rating || left.name.localeCompare(right.name),
  );

  return users.map((user, index) => {
    const totalGames = user.wins + user.losses + user.draws;
    const winRate = totalGames
      ? ((user.wins / totalGames) * 100).toFixed(1)
      : "0.0";
    return {
      rank: index + 1,
      uid: user.uid,
      name: user.name,
      elo_rating: user.elo_rating,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      win_rate: Number(winRate),
      is_online: user.is_online,
      avatar: user.avatar,
      title: user.title,
      is_current_user: user.uid === currentUid,
    };
  });
}

function mockLogout(token) {
  if (!token) return;

  const sessions = readSessions();
  const uid = sessions[token];
  delete sessions[token];
  writeSessions(sessions);

  if (uid) {
    const users = readUsers();
    if (users[uid]) {
      users[uid].is_online = false;
      writeUsers(users);
    }
  }
}

function expectedScore(playerRating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

function calculateUpdatedRatings(xRating, oRating, xScore, oScore) {
  const kFactor = 32;
  const xExpected = expectedScore(xRating, oRating);
  const oExpected = expectedScore(oRating, xRating);
  return {
    x: Math.round(xRating + kFactor * (xScore - xExpected)),
    o: Math.round(oRating + kFactor * (oScore - oExpected)),
  };
}

function buildGameRoomId(gameId) {
  return `game:${gameId}`;
}

function createMockGame(userUid, opponentUid) {
  const users = readUsers();
  const user = users[userUid];
  const opponent = users[opponentUid];
  if (!user || !opponent) {
    throw new Error("Unable to create a match for unknown players.");
  }

  const gameId = `mock-game-${Date.now()}`;
  const game = {
    game_id: gameId,
    room_id: buildGameRoomId(gameId),
    x_uid: userUid,
    o_uid: opponentUid,
    board: Array(9).fill(null),
    turn_uid: userUid,
    status: "active",
    result: null,
    winner_uid: null,
    winning_line: [],
    last_move: null,
    disconnected_uid: null,
  };

  const games = readGames();
  games[gameId] = game;
  writeGames(games);
  sessionStorage.setItem(CURRENT_GAME_KEY, gameId);
  sessionStorage.setItem(OPPONENT_KEY, opponentUid);
  return game;
}

function getCurrentGame() {
  const gameId = sessionStorage.getItem(CURRENT_GAME_KEY);
  if (!gameId) return null;
  return readGames()[gameId] || null;
}

function saveGame(game) {
  const games = readGames();
  games[game.game_id] = game;
  writeGames(games);
}

function findWinningLine(board, symbol) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const line of lines) {
    if (line.every((index) => board[index] === symbol)) {
      return line;
    }
  }

  return [];
}

function applyMockMove(gameId, uid, cell) {
  const games = readGames();
  const game = games[gameId];
  if (!game) {
    throw new Error("Match not found.");
  }

  if (game.status !== "active") {
    throw new Error("This match is already finished.");
  }

  if (uid !== game.x_uid && uid !== game.o_uid) {
    throw new Error("You are not part of this match.");
  }

  if (uid !== game.turn_uid) {
    throw new Error("It is not your turn.");
  }

  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    throw new Error("Invalid cell.");
  }

  if (game.board[cell] !== null) {
    throw new Error("That cell is already occupied.");
  }

  const symbol = uid === game.x_uid ? "X" : "O";
  game.board[cell] = symbol;
  game.last_move = { uid, cell, symbol };

  const winningLine = findWinningLine(game.board, symbol);
  if (winningLine.length) {
    game.status = "finished";
    game.result = "win";
    game.winner_uid = uid;
    game.winning_line = winningLine;
    game.turn_uid = null;
    finalizeMockGame(game);
    saveGame(game);
    return game;
  }

  if (game.board.every((value) => value !== null)) {
    game.status = "finished";
    game.result = "draw";
    game.turn_uid = null;
    finalizeMockGame(game);
    saveGame(game);
    return game;
  }

  game.turn_uid = uid === game.x_uid ? game.o_uid : game.x_uid;
  saveGame(game);
  return game;
}

function finalizeMockGame(game) {
  const users = readUsers();
  const xUser = users[game.x_uid];
  const oUser = users[game.o_uid];
  if (!xUser || !oUser) return;

  let xScore = 0.5;
  let oScore = 0.5;

  if (game.result === "win" || game.result === "forfeit") {
    xScore = game.winner_uid === game.x_uid ? 1 : 0;
    oScore = game.winner_uid === game.o_uid ? 1 : 0;
  }

  const updated = calculateUpdatedRatings(
    xUser.elo_rating,
    oUser.elo_rating,
    xScore,
    oScore,
  );

  xUser.elo_rating = updated.x;
  oUser.elo_rating = updated.o;

  if (game.result === "draw") {
    xUser.draws += 1;
    oUser.draws += 1;
  } else {
    if (game.winner_uid === game.x_uid) {
      xUser.wins += 1;
      oUser.losses += 1;
    } else if (game.winner_uid === game.o_uid) {
      oUser.wins += 1;
      xUser.losses += 1;
    }
  }

  writeUsers(users);
}

function chooseMockOpponentMove(game) {
  const preferredOrder = [4, 0, 2, 6, 8, 1, 3, 5, 7];
  return preferredOrder.find((cell) => game.board[cell] === null);
}

async function initPage() {
  const page = document.body.dataset.page || detectPage();

  if (page === "biometric") {
    await initBiometricPage();
    return;
  }

  currentUser = await requireAuth();
  if (!currentUser) return;

  hydrateUser(currentUser);
  wireCommonAuthedActions();
  wirePlaceholderLinks();
  setupNotifications(currentUser);
  ensureRealtimeConnection();

  if (page === "lobby") {
    await initLobbyPage(currentUser);
  }

  if (page === "leaderboard") {
    await initLeaderboardPage(currentUser);
  }

  if (page === "board") {
    await initBoardPage(currentUser);
  }

  refreshIcons();
}

function detectPage() {
  const path = window.location.pathname;
  if (path.endsWith("biometric.html")) return "biometric";
  if (path.endsWith("leaderboard.html")) return "leaderboard";
  if (path.endsWith("board.html")) return "board";
  return "lobby";
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getDisplayName(user) {
  return user?.name || user?.uid || "Tactician";
}

function formatRating(value) {
  return `Rating: ${value}`;
}

function buildWebSocketUrl(token) {
  const websocketBaseUrl = API_BASE_URL.replace(/^http/, "ws");
  return `${websocketBaseUrl}/ws/?token=${encodeURIComponent(token)}`;
}

function ensureRealtimeConnection() {
  const token = getToken();
  if (!token) return;

  if (!realtimeSocket) {
    initRealtimeConnection(token);
    return;
  }

  if (
    realtimeSocket.readyState === WebSocket.CLOSED ||
    realtimeSocket.readyState === WebSocket.CLOSING
  ) {
    closeRealtimeConnection(false);
    initRealtimeConnection(token);
    return;
  }

  if (
    realtimeSocket.readyState === WebSocket.CONNECTING &&
    Date.now() - realtimeConnectStartedAt >= REALTIME_CONNECT_TIMEOUT_MS
  ) {
    closeRealtimeConnection(false);
    initRealtimeConnection(token);
    return;
  }

  if (realtimeSocket.readyState === WebSocket.OPEN && realtimeReady) {
    triggerRealtimeHeartbeat();
  }
}

function initRealtimeConnection(token) {
  if (!token || realtimeSocket) return;

  realtimeIntentionalClose = false;
  realtimeConnectStartedAt = Date.now();
  realtimeSocket = new WebSocket(buildWebSocketUrl(token));

  realtimeSocket.addEventListener("open", () => {
    realtimeReady = true;
    realtimeConnectStartedAt = 0;
    startRealtimeHeartbeat();
    triggerRealtimeHeartbeat();
  });

  realtimeSocket.addEventListener("error", () => {
    realtimeReady = false;
  });

  realtimeSocket.addEventListener("message", (event) => {
    try {
      handleRealtimeMessage(JSON.parse(event.data));
    } catch (error) {
      console.error("Unable to parse websocket message", error);
    }
  });

  realtimeSocket.addEventListener("close", () => {
    stopRealtimeHeartbeat();
    realtimeSocket = null;
    realtimeReady = false;
    realtimeConnectStartedAt = 0;

    if (!realtimeIntentionalClose && getToken()) {
      scheduleRealtimeReconnect();
    }
  });
}

function scheduleRealtimeReconnect() {
  if (realtimeReconnectId) return;

  realtimeReconnectId = window.setTimeout(() => {
    realtimeReconnectId = null;
    ensureRealtimeConnection();
  }, 1500);
}

function closeRealtimeConnection(intentional = false) {
  realtimeIntentionalClose = intentional;
  stopRealtimeHeartbeat();

  if (realtimeReconnectId) {
    clearTimeout(realtimeReconnectId);
    realtimeReconnectId = null;
  }

  if (realtimeSocket) {
    realtimeSocket.close();
    realtimeSocket = null;
  }

  realtimeReady = false;
  realtimeConnectStartedAt = 0;
}

function startRealtimeHeartbeat() {
  stopRealtimeHeartbeat();
  realtimeHeartbeatId = window.setInterval(() => {
    triggerRealtimeHeartbeat();
  }, REALTIME_HEARTBEAT_MS);
}

function stopRealtimeHeartbeat() {
  if (realtimeHeartbeatId) {
    clearInterval(realtimeHeartbeatId);
    realtimeHeartbeatId = null;
  }

  if (realtimePongTimeoutId) {
    clearTimeout(realtimePongTimeoutId);
    realtimePongTimeoutId = null;
  }
}

function triggerRealtimeHeartbeat() {
  if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) return;

  if (realtimePongTimeoutId) {
    clearTimeout(realtimePongTimeoutId);
  }

  realtimeSocket.send(JSON.stringify({ type: "ping", payload: {} }));
  realtimePongTimeoutId = window.setTimeout(() => {
    closeRealtimeConnection(false);
    scheduleRealtimeReconnect();
  }, REALTIME_PONG_TIMEOUT_MS);
}

function waitForRealtimeConnection(timeoutMs = 4000) {
  ensureRealtimeConnection();

  if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const poll = window.setInterval(() => {
      ensureRealtimeConnection();

      if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
        clearInterval(poll);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(poll);
        reject(new Error("Live connection is not ready."));
      }
    }, 100);
  });
}

async function sendRealtimeMessage(type, payload = {}) {
  await waitForRealtimeConnection();

  realtimeSocket.send(JSON.stringify({ type, payload }));
}

function handleRealtimeMessage(message) {
  const { type, payload = {} } = message;

  if (type === "connection.ready") {
    addNotification(
      createNotification({
        title: "Live connection ready",
        body: `Signed in as ${payload.uid}. Live lobby updates are active.`,
        type: "system",
        unread: false,
      }),
    );
    return;
  }

  if (type === "pong") {
    realtimeReady = true;
    if (realtimePongTimeoutId) {
      clearTimeout(realtimePongTimeoutId);
      realtimePongTimeoutId = null;
    }
    return;
  }

  if (type === "lobby.snapshot") {
    updateLobbyUsers(payload.users || []);
    return;
  }

  if (type === "game.absent") {
    handleMissingActiveGame();
    return;
  }

  if (type === "presence.online") {
    addNotification(
      createNotification({
        title: "Player online",
        body: `${payload.uid} joined the lobby.`,
        type: "presence",
      }),
    );
    refreshLobbyUsers();
    return;
  }

  if (type === "presence.offline") {
    addNotification(
      createNotification({
        title: "Player offline",
        body: `${payload.uid} left the lobby.`,
        type: "presence",
        unread: false,
      }),
    );
    refreshLobbyUsers();
    return;
  }

  if (type === "challenge.sent") {
    outgoingChallenges.add(payload.to_uid);
    refreshLobbyUi();
    addNotification(
      createNotification({
        title: "Challenge sent",
        body: `Challenge sent to ${payload.to_uid}. Waiting for a response.`,
        type: "challenge",
      }),
    );
    return;
  }

  if (type === "challenge.received") {
    const notification = createNotification({
      title: "Challenge received",
      body: `${payload.from_uid} challenged you to a match.`,
      type: "challenge",
      actions: [
        { label: "Accept", type: "challenge.accept" },
        { label: "Decline", type: "challenge.reject" },
      ],
    });
    incomingChallenges.set(notification.id, payload);
    addNotification(notification);
    openNotifications();
    return;
  }

  if (type === "challenge.rejected") {
    outgoingChallenges.delete(payload.to_uid);
    refreshLobbyUi();
    addNotification(
      createNotification({
        title: "Challenge declined",
        body: `${payload.to_uid} declined your challenge.`,
        type: "challenge",
        unread: false,
      }),
    );
    return;
  }

  if (type === "challenge.declined") {
    addNotification(
      createNotification({
        title: "Challenge declined",
        body: `Declined ${payload.from_uid}'s challenge.`,
        type: "challenge",
        unread: false,
      }),
    );
    return;
  }

  if (type === "game.created") {
    syncRealtimeGame(payload);
    return;
  }

  if (type === "game.state" || type === "game.over") {
    const gamePayload = type === "game.over" ? payload.game : payload;
    saveGame(gamePayload);
    if (gamePayload.status !== "active") {
      outgoingChallenges.delete(
        gamePayload.x_uid === currentUser?.uid
          ? gamePayload.o_uid
          : gamePayload.x_uid,
      );
    }

    if (
      (document.body.dataset.page || detectPage()) === "board" &&
      boardState
    ) {
      syncBoardFromGame(
        gamePayload,
        type === "game.over" ? payload.rating_update : null,
      );
    }
    return;
  }

  if (type === "error") {
    if (payload.message === "Player is not in an active game") {
      handleMissingActiveGame();
      return;
    }

    addNotification(
      createNotification({
        title: "Arena error",
        body:
          payload.message || "Something went wrong with the live connection.",
        type: "system",
      }),
    );
  }
}

function handleMissingActiveGame() {
  sessionStorage.removeItem(CURRENT_GAME_KEY);
  sessionStorage.removeItem(OPPONENT_KEY);

  if ((document.body.dataset.page || detectPage()) === "board") {
    redirectTo("index.html");
  }
}

function syncRealtimeGame(game) {
  saveGame(game);
  sessionStorage.setItem(CURRENT_GAME_KEY, game.game_id);
  const opponentUid = game.x_uid === currentUser?.uid ? game.o_uid : game.x_uid;
  if (opponentUid) {
    sessionStorage.setItem(OPPONENT_KEY, opponentUid);
    outgoingChallenges.delete(opponentUid);
  }
  refreshLobbyUi();
  redirectTo("board.html");
}

async function refreshLobbyUsers() {
  const token = getToken();
  if (!token) return;

  try {
    const users = await fetchLobbyUsers(token);
    updateLobbyUsers(users);
  } catch (error) {
    console.error(error);
  }
}

function updateLobbyUsers(users) {
  lobbyUsers = users.filter((entry) => entry.uid !== currentUser?.uid);
  syncUsersForMockGame(currentUser ? [currentUser, ...lobbyUsers] : lobbyUsers);
  refreshLobbyUi();
}

function refreshLobbyUi() {
  const page = document.body.dataset.page || detectPage();
  if (page !== "lobby" || !currentUser) return;

  renderLobbyGrid(currentUser, lobbyUsers);
  renderActiveMasters(currentUser, lobbyUsers);
}

async function fetchCurrentUser(token) {
  const response = await fetch(`${API_BASE_URL}/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unable to load current user");
  }

  return response.json();
}

async function fetchLobbyUsers(token) {
  const response = await fetch(`${API_BASE_URL}/lobby`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unable to load lobby");
  }

  return response.json();
}

async function fetchLeaderboard(token) {
  const response = await fetch(`${API_BASE_URL}/leaderboard`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Unable to load leaderboard");
  }

  return response.json();
}

async function requireAuth() {
  const token = getToken();

  if (!token) {
    redirectTo("biometric.html");
    return null;
  }

  try {
    return await fetchCurrentUser(token);
  } catch (error) {
    localStorage.removeItem(TOKEN_KEY);
    redirectTo("biometric.html");
    return null;
  }
}

function hydrateUser(user) {
  const name = getDisplayName(user);
  document.querySelectorAll("[data-user-name]").forEach((element) => {
    element.textContent = name;
  });
  document.querySelectorAll("[data-user-rating]").forEach((element) => {
    element.textContent = formatRating(user.elo_rating);
  });
}

function wireCommonAuthedActions() {
  document.querySelectorAll('[data-action="logout"]').forEach((element) => {
    element.addEventListener("click", async (event) => {
      event.preventDefault();
      await logout();
    });
  });

  document.querySelectorAll('[data-action="new-game"]').forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      sessionStorage.removeItem(CURRENT_GAME_KEY);
      redirectTo("index.html");
    });
  });
}

function wirePlaceholderLinks() {
  document.querySelectorAll('a[href="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.alert("This feature is coming soon to the Arena!");
    });
  });
}

function createNotification({
  title,
  body,
  type,
  unread = true,
  actions = [],
}) {
  return {
    id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    body,
    type,
    unread,
    actions,
    time: "now",
  };
}

function addNotification(notification) {
  notifications = [notification, ...notifications].slice(0, 20);
  renderNotifications(notifications);
}

function updateNotification(notificationId, updater) {
  notifications = notifications.map((notification) => {
    if (notification.id !== notificationId) return notification;
    return updater(notification);
  });
  renderNotifications(notifications);
}

function removeNotification(notificationId) {
  notifications = notifications.filter(
    (notification) => notification.id !== notificationId,
  );
  renderNotifications(notifications);
}

function setupNotifications(user) {
  ensureNotificationsUi();
  if (!notifications.length) {
    notifications = [
      createNotification({
        title: "Arena online",
        body: `${getDisplayName(user)} is connected to the Arena.`,
        type: "system",
        unread: false,
      }),
    ];
  }
  renderNotifications(notifications);

  document
    .querySelectorAll('[data-action="toggle-notifications"]')
    .forEach((element) => {
      element.addEventListener("click", (event) => {
        event.preventDefault();
        toggleNotifications();
      });
    });

  document
    .querySelector('[data-action="close-notifications"]')
    ?.addEventListener("click", () => {
      closeNotifications();
    });

  document
    .getElementById("notifications-backdrop")
    ?.addEventListener("click", () => {
      closeNotifications();
    });

  if (!notificationHandlersBound) {
    document
      .getElementById("notifications-panel")
      ?.addEventListener("click", handleNotificationActionClick);
    notificationHandlersBound = true;
  }

  document.addEventListener("keydown", handleNotificationEscape);
}

function ensureNotificationsUi() {
  if (document.getElementById("notifications-panel")) {
    return;
  }

  const backdrop = document.createElement("div");
  backdrop.id = "notifications-backdrop";
  backdrop.className = "notifications-backdrop";

  const panel = document.createElement("aside");
  panel.id = "notifications-panel";
  panel.className = "notifications-panel";
  panel.innerHTML = `
    <div class="notifications-header">
      <div>
        <div class="font-headline italic text-2xl text-primary">Notifications</div>
        <p class="text-sm opacity-60">Live updates from the Arena</p>
      </div>
      <button type="button" data-action="close-notifications" class="btn-primary" style="padding: 0.7rem 1rem; box-shadow: none;">Close</button>
    </div>
    <div class="notifications-list" id="notifications-list"></div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
}

function renderNotifications(notifications) {
  const list = document.getElementById("notifications-list");
  if (!list) return;

  if (!notifications.length) {
    list.innerHTML =
      '<div class="notifications-empty">No notifications right now.</div>';
    return;
  }

  list.innerHTML = notifications
    .map(
      (notification) => `
        <article class="notification-item ${notification.unread ? "unread" : ""}">
          <div class="notification-meta">
            <span class="notification-badge">${notification.type}</span>
            <span class="notification-time">${notification.time}</span>
          </div>
          <h3 class="notification-title">${notification.title}</h3>
          <p class="notification-body">${notification.body}</p>
          ${
            notification.actions.length
              ? `
            <div class="flex gap-3" style="margin-top: 1rem; flex-wrap: wrap;">
              ${notification.actions
                .map(
                  (action) => `
                <button
                  type="button"
                  class="btn-primary"
                  data-notification-id="${notification.id}"
                  data-notification-action="${action.type}"
                  style="padding: 0.65rem 1rem; box-shadow: none;"
                >${action.label}</button>
              `,
                )
                .join("")}
            </div>
          `
              : ""
          }
        </article>
      `,
    )
    .join("");
}

async function handleNotificationActionClick(event) {
  const button = event.target.closest("[data-notification-action]");
  if (!(button instanceof HTMLElement)) return;

  const notificationId = button.dataset.notificationId;
  const actionType = button.dataset.notificationAction;
  if (!notificationId || !actionType) return;

  const notification = notifications.find(
    (entry) => entry.id === notificationId,
  );
  if (!notification) return;

  if (actionType === "challenge.accept") {
    const challenge = incomingChallenges.get(notificationId);
    if (!challenge) return;
    try {
      await sendRealtimeMessage("challenge.accept", {
        from_uid: challenge.from_uid,
      });
    } catch (error) {
      window.alert(error.message);
      return;
    }
    incomingChallenges.delete(notificationId);
    updateNotification(notificationId, (entry) => ({
      ...entry,
      unread: false,
      title: "Challenge accepted",
      body: `Accepted ${challenge.from_uid}'s challenge. Waiting for the board to open.`,
      actions: [],
    }));
    return;
  }

  if (actionType === "challenge.reject") {
    const challenge = incomingChallenges.get(notificationId);
    if (!challenge) return;
    try {
      await sendRealtimeMessage("challenge.reject", {
        from_uid: challenge.from_uid,
      });
    } catch (error) {
      window.alert(error.message);
      return;
    }
    incomingChallenges.delete(notificationId);
    updateNotification(notificationId, (entry) => ({
      ...entry,
      unread: false,
      title: "Challenge declined",
      body: `Declined ${challenge.from_uid}'s challenge.`,
      actions: [],
    }));
  }
}

function toggleNotifications() {
  if (notificationsOpen) {
    closeNotifications();
    return;
  }
  openNotifications();
}

function openNotifications() {
  notificationsOpen = true;
  document.getElementById("notifications-panel")?.classList.add("open");
  document.getElementById("notifications-backdrop")?.classList.add("open");
}

function closeNotifications() {
  notificationsOpen = false;
  document.getElementById("notifications-panel")?.classList.remove("open");
  document.getElementById("notifications-backdrop")?.classList.remove("open");
}

function handleNotificationEscape(event) {
  if (event.key === "Escape") {
    closeNotifications();
  }
}

async function logout() {
  closeRealtimeConnection(true);
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(OPPONENT_KEY);
  sessionStorage.removeItem(CURRENT_GAME_KEY);
  stopCamera();
  stopBoardTimer();
  redirectTo("biometric.html");
}

function redirectTo(path) {
  window.location.href = path;
}

async function initBiometricPage() {
  const token = getToken();
  if (token) {
    try {
      await fetchCurrentUser(token);
      redirectTo("index.html");
      return;
    } catch (error) {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  renderBiometricLogin();
  refreshIcons();
  document
    .getElementById("capture-btn")
    ?.addEventListener("click", captureAndLogin);
  await startCamera();
}

function renderBiometricLogin() {
  const app = document.getElementById("app");
  if (!app) return;

  isCapturing = false;
  app.innerHTML = `
    <div class="fixed left-0 top-0 h-full w-2 bg-primary"></div>
    <div class="fixed right-0 top-0 h-full w-2 bg-primary"></div>

    <div class="biometric-shell w-full flex flex-col items-center space-y-6 z-10 px-4">
      <header class="text-center space-y-2">
        <h1 class="font-headline text-6xl md:text-8xl font-black tracking-tighter text-primary">Tic Tac Toe</h1>
        <p class="font-headline italic text-primary opacity-80 text-xl md:text-2xl uppercase tracking-widest">Bio Verification</p>
      </header>

      <div class="w-full flex flex-col space-y-8">
        <div class="flex flex-col space-y-6">

          <div class="biometric-camera-frame relative w-full bg-surface-container-high rounded-lg overflow-hidden ring-primary shadow-[inset_0_4px_12px_rgba(0,0,0,0.15)] mx-auto">
            <video id="webcam" autoplay playsinline muted class="w-full h-full object-cover"></video>
            <div class="absolute top-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 z-20">
              <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <span class="text-[10px] text-white font-bold uppercase tracking-widest">Live Scanner</span>
            </div>
            <div class="absolute inset-6 pointer-events-none">
              <div class="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/60"></div>
              <div class="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/60"></div>
              <div class="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/60"></div>
              <div class="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/60"></div>
            </div>
            <div class="scan-line"></div>
            <div id="loader" class="hidden absolute inset-0 bg-primary/20 backdrop-blur-[2px] flex items-center justify-center">
              <div class="w-12 h-12 border-4 border-on-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          </div>

          <div class="flex justify-center">
            <button id="capture-btn" class="w-full max-w-md bg-primary text-on-primary px-8 py-4 rounded-lg font-headline font-bold text-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed">
              <i data-lucide="camera" class="w-5 h-5"></i>
              Verify Identity
            </button>
          </div>
        </div>
      </div>

      <div class="bg-background px-8 py-3 rounded-full shadow-lg border-2 border-primary/10">
        <p id="status" class="text-primary font-headline italic text-center min-h-[1.5em]"></p>
      </div>

      <footer class="flex flex-col items-center space-y-4 bg-background p-6 rounded-2xl shadow-lg border-2 border-primary/10 w-full max-w-xs">
        <div class="flex items-center gap-6">
          <i data-lucide="shield-check" class="w-5 h-5 text-primary"></i>
          <div class="h-px w-12 bg-outline-variant"></div>
          <i data-lucide="lock" class="w-5 h-5 text-primary"></i>
        </div>
      </footer>
    </div>
  `;
}

async function startCamera() {
  const video = document.getElementById("webcam");
  const statusEl = document.getElementById("status");

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (statusEl)
      statusEl.textContent =
        "Webcam is not supported in this browser or context.";
    return;
  }

  try {
    if (statusEl) statusEl.textContent = "Requesting webcam access...";
    videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (video) {
      video.srcObject = videoStream;
    }
    if (statusEl) statusEl.textContent = "";
  } catch (error) {
    const details = error?.message
      ? `${error.name}: ${error.message}`
      : "Unknown webcam error.";
    if (statusEl) statusEl.textContent = `Unable to access webcam. ${details}`;
  }
}

function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
    videoStream = null;
  }
}

async function captureAndLogin() {
  if (isCapturing) return;

  const button = document.getElementById("capture-btn");
  const video = document.getElementById("webcam");
  const statusEl = document.getElementById("status");
  const loader = document.getElementById("loader");

  if (!videoStream || !video) {
    if (statusEl) statusEl.textContent = "Webcam is not available.";
    return;
  }

  isCapturing = true;
  if (button) button.disabled = true;
  loader?.classList.remove("hidden");
  if (statusEl) statusEl.textContent = "Capturing frame...";

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d");
  context?.drawImage(video, 0, 0, canvas.width, canvas.height);

  const rawBase64 = canvas.toDataURL("image/jpeg").split(",")[1];

  try {
    if (statusEl) statusEl.textContent = "Logging in...";

    const loginResponse = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image: rawBase64 }),
    });

    if (!loginResponse.ok) {
      let errorMessage = "Login failed";

      try {
        const errorPayload = await loginResponse.json();
        if (errorPayload?.detail) {
          errorMessage = errorPayload.detail;
        }
      } catch (error) {
        console.error(error);
      }

      throw new Error(errorMessage);
    }

    const loginData = await loginResponse.json();
    localStorage.setItem(TOKEN_KEY, loginData.access_token);
    stopCamera();
    redirectTo("index.html");
  } catch (error) {
    localStorage.removeItem(TOKEN_KEY);
    if (statusEl) statusEl.textContent = error.message || "Login failed.";
    if (button) button.disabled = false;
    loader?.classList.add("hidden");
    isCapturing = false;
  }
}

async function initLobbyPage(user) {
  const users = await fetchLobbyUsers(getToken());
  updateLobbyUsers(users);
  refreshIcons();
}

function renderLobbyGrid(user, users) {
  const grid = document.querySelector("[data-lobby-grid]");
  if (!grid) return;

  if (!users.length) {
    grid.innerHTML = `
      <div class="card surface-lift" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
        <h3 class="font-headline italic text-3xl text-primary">No challengers online</h3>
        <p class="opacity-60" style="margin-top: 1rem;">No other online players are available right now.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = users
    .map((player) => {
      const pendingChallenge = outgoingChallenges.has(player.uid);
      return `
        <div class="card surface-lift flex flex-col items-center" data-opponent-uid="${player.uid}" style="height: 100%;">
          <div style="width: 100%; flex: 1; display: flex; flex-direction: column;">
            <div>
              <h3 class="font-headline italic text-2xl text-primary">${player.name}</h3>
            </div>
            <div style="margin-top: auto; width: 100%; display: flex; flex-direction: column; gap: 1.5rem;">
              <div>
                <p class="text-xs bold uppercase tracking-widest opacity-40">UID: ${player.uid}</p>
                <p class="text-xs bold uppercase tracking-widest opacity-40">ELO: ${player.elo_rating}</p>
              </div>
              <div style="width: 100%; height: 1px; background: linear-gradient(to right, transparent, var(--outline-variant), transparent); opacity: 0.3;"></div>
              <button class="w-full btn-challenge" data-action="challenge" data-opponent-uid="${player.uid}" ${pendingChallenge ? "disabled" : ""} style="padding: 12px; border-radius: var(--radius-default); background: var(--surface-container); font-family: var(--font-headline); font-style: italic; opacity: ${pendingChallenge ? "0.65" : "1"};">
                ${pendingChallenge ? "Challenge Sent" : "Challenge"}
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  grid.querySelectorAll('[data-action="challenge"]').forEach((button) => {
    button.addEventListener("click", () => {
      const opponentUid = button.dataset.opponentUid;
      sendChallenge(user, opponentUid, button);
    });
  });
}

function renderActiveMasters(user, users) {
  const container = document.querySelector("[data-active-masters]");
  if (!container) return;

  const masters = users
    .slice(0, 4)
    .map(
      (player) => `
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-4">
            <div>
              <div class="bold text-sm">${player.name}</div>
              <div class="text-xs uppercase bold tracking-widest opacity-40">Rating ${player.elo_rating}</div>
            </div>
          </div>
        </div>
      `,
    )
    .join("");

  container.innerHTML =
    masters || '<p class="opacity-60">The chamber is quiet for now.</p>';
}

async function sendChallenge(user, opponentUid, challengeButton) {
  const users = readUsers();
  const opponent = users[opponentUid];
  if (!opponent) {
    window.alert("That challenger is no longer available.");
    return;
  }

  try {
    await sendRealtimeMessage("challenge.send", { target_uid: opponentUid });
    if (challengeButton instanceof HTMLElement) {
      challengeButton.textContent = "Challenge Sent";
      challengeButton.setAttribute("disabled", "disabled");
    }
  } catch (error) {
    window.alert(error.message);
  }
}

async function initLeaderboardPage(user) {
  const leaderboard = await fetchLeaderboard(getToken());
  leaderboardPage = 1;
  wireLeaderboardPagination(user, leaderboard);
  renderLeaderboardTable(user, leaderboard);
  renderGlobalRankCard(user.uid, leaderboard);
}

function renderLeaderboardTable(currentUserData, players) {
  const tbody = document.querySelector("[data-leaderboard-body]");
  if (!tbody) return;

  const totalPages = Math.max(
    1,
    Math.ceil(players.length / LEADERBOARD_PAGE_SIZE),
  );
  leaderboardPage = Math.min(Math.max(leaderboardPage, 1), totalPages);
  const startIndex = (leaderboardPage - 1) * LEADERBOARD_PAGE_SIZE;
  const pagePlayers = players.slice(
    startIndex,
    startIndex + LEADERBOARD_PAGE_SIZE,
  );

  tbody.innerHTML = pagePlayers
    .map((player, index) => {
      const rank = startIndex + index + 1;
      const medalColor =
        rank === 1
          ? "var(--gold)"
          : rank === 2
            ? "var(--silver)"
            : rank === 3
              ? "var(--bronze)"
              : "transparent";
      const medal =
        rank <= 3
          ? `<span class="material-symbols-outlined" style="color: ${medalColor}; font-size: 2rem; margin-right: 0.75rem; font-variation-settings: 'FILL' 1;">workspace_premium</span>`
          : "";
      const nameStyle =
        player.uid === currentUserData.uid
          ? 'style="color: var(--primary)"'
          : "";

      return `
        <tr>
          <td>
            <div class="flex items-center">
              ${medal}
              <span class="font-accent italic bold text-3xl">${rank}</span>
            </div>
          </td>
          <td>
            <div>
              <p class="font-headline bold text-xl" ${nameStyle}>${player.name}</p>
              <p class="text-xs bold uppercase tracking-widest opacity-40">${player.uid}</p>
            </div>
          </td>
          <td class="text-center">
            <span class="font-accent italic bold text-2xl" ${nameStyle}>${player.elo_rating}</span>
          </td>
        </tr>
      `;
    })
    .join("");

  updateLeaderboardPaginationUi(totalPages);
}

function wireLeaderboardPagination(user, players) {
  const previousButton = document.querySelector(
    '[data-action="leaderboard-prev"]',
  );
  const nextButton = document.querySelector('[data-action="leaderboard-next"]');

  if (previousButton) {
    previousButton.onclick = () => {
      if (leaderboardPage === 1) return;
      leaderboardPage -= 1;
      renderLeaderboardTable(user, players);
    };
  }

  if (nextButton) {
    nextButton.onclick = () => {
      const totalPages = Math.max(
        1,
        Math.ceil(players.length / LEADERBOARD_PAGE_SIZE),
      );
      if (leaderboardPage >= totalPages) return;
      leaderboardPage += 1;
      renderLeaderboardTable(user, players);
    };
  }
}

function updateLeaderboardPaginationUi(totalPages) {
  const pageLabel = document.querySelector("[data-leaderboard-page]");
  const previousButton = document.querySelector(
    '[data-action="leaderboard-prev"]',
  );
  const nextButton = document.querySelector('[data-action="leaderboard-next"]');

  if (pageLabel) {
    pageLabel.textContent = `Page ${leaderboardPage} of ${totalPages}`;
  }

  if (previousButton) {
    previousButton.style.opacity = leaderboardPage === 1 ? "0.35" : "1";
  }

  if (nextButton) {
    nextButton.style.opacity = leaderboardPage === totalPages ? "0.35" : "1";
  }
}

function renderGlobalRankCard(uid, players) {
  const rankElement = document.querySelector("[data-global-rank]");
  if (!rankElement) return;

  const player = players.find((entry) => entry.uid === uid);
  if (!player) return;
  rankElement.textContent = `#${players.findIndex((entry) => entry.uid === uid) + 1}`;
}

async function initBoardPage(user) {
  const boardElement = document.getElementById("board");
  if (!boardElement) return;

  let game = getCurrentGame();
  if (!isBoardGameForUser(game, user.uid)) {
    redirectTo("index.html");
    return;
  }

  const users = readUsers();
  const playerX = users[game.x_uid] || {
    uid: game.x_uid,
    name: game.x_uid,
    elo_rating: 1200,
  };
  const playerO = users[game.o_uid] || {
    uid: game.o_uid,
    name: game.o_uid,
    elo_rating: 1200,
  };

  const playerXName = document.getElementById("player-x-name");
  const playerOName = document.getElementById("player-o-name");
  const playerXStatus = document.getElementById("player-x-status");
  const playerOStatus = document.getElementById("player-o-status");
  const playerXCard = document.getElementById("player-x-card");
  const playerOCard = document.getElementById("player-o-card");
  const timerElement = document.getElementById("timer-val");
  const movesElement = document.getElementById("moves-val");
  const overlay = document.getElementById("game-overlay");
  const resultEmoji = document.getElementById("result-emoji");
  const resultTitle = document.getElementById("result-title");
  const resultDesc = document.getElementById("result-desc");
  const resultRatings = document.getElementById("result-ratings");
  const playerXRating = document.getElementById("player-x-rating");
  const playerORating = document.getElementById("player-o-rating");

  if (playerXName) playerXName.textContent = `${playerX.name} (X)`;
  if (playerOName) playerOName.textContent = `${playerO.name} (O)`;
  if (playerXRating) playerXRating.textContent = `ELO: ${playerX.elo_rating}`;
  if (playerORating) playerORating.textContent = `ELO: ${playerO.elo_rating}`;

  boardState = {
    gameId: game.game_id,
    selfUid: user.uid,
    selfSymbol: game.x_uid === user.uid ? "X" : "O",
    board: game.board.slice(),
    current: game.turn_uid === game.o_uid ? "O" : "X",
    status: "playing",
    result: game.result,
    moves: game.board.filter(Boolean).length,
    seconds: 0,
    timerId: null,
    winningLine: game.winning_line || [],
    playerXCard,
    playerOCard,
    playerXStatus,
    playerOStatus,
    boardElement,
    timerElement,
    movesElement,
    overlay,
    resultEmoji,
    resultTitle,
    resultDesc,
    resultRatings,
    ratingUpdate: null,
    players: {
      X: playerX.name,
      O: playerO.name,
    },
  };

  document
    .getElementById("new-game-btn")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      sessionStorage.removeItem(CURRENT_GAME_KEY);
      redirectTo("index.html");
    });
  document.getElementById("return-lobby-btn")?.addEventListener("click", () => {
    redirectTo("index.html");
  });

  renderBoard();
  syncBoardFromGame(game);
}

function syncBoardFromGame(game, ratingUpdate = null) {
  if (!boardState) return;

  if (!isBoardGameForUser(game, boardState.selfUid)) {
    sessionStorage.removeItem(CURRENT_GAME_KEY);
    redirectTo("index.html");
    return;
  }

  saveGame(game);
  boardState.gameId = game.game_id;
  boardState.board = game.board.slice();
  boardState.current = game.turn_uid === game.o_uid ? "O" : "X";
  boardState.moves = game.board.filter(Boolean).length;
  boardState.result = game.result;
  boardState.ratingUpdate = ratingUpdate;
  boardState.winningLine = game.winning_line || [];
  boardState.status = mapGameStatusForBoard(game);
  boardState.overlay?.classList.remove("visible");

  renderBoard();
  updateBoardUi();
  stopBoardTimer();

  if (boardState.status === "playing") {
    startBoardTimer();
  } else {
    showBoardResult();
  }
}

function mapGameStatusForBoard(game) {
  if (game.status === "active") {
    return "playing";
  }

  if (game.result === "draw") {
    return "tie";
  }

  if (game.winner_uid === boardState?.selfUid) {
    return "victory";
  }

  return "defeat";
}

function renderBoard() {
  if (!boardState) return;

  boardState.boardElement.innerHTML = "";
  boardState.board.forEach((value, index) => {
    const square = document.createElement("button");
    square.type = "button";
    square.className = "square inner-shadow-tactile group";
    square.dataset.index = String(index);
    square.addEventListener("mouseenter", () => previewSquare(square, index));
    square.addEventListener("mouseleave", () => clearPreview(square, index));
    square.addEventListener("click", () => handleSquareClick(index));
    boardState.boardElement.appendChild(square);
  });
}

function previewSquare(square, index) {
  if (!boardState || boardState.board[index] || boardState.status !== "playing")
    return;
  if (!isBoardTurnForCurrentUser()) return;
  square.innerHTML =
    boardState.selfSymbol === "X" ? getXIcon(true) : getOIcon(true);
}

function clearPreview(square, index) {
  if (!boardState || boardState.board[index]) return;
  square.innerHTML = "";
}

async function handleSquareClick(index) {
  if (!boardState || boardState.status !== "playing") return;
  if (!isBoardTurnForCurrentUser()) return;

  try {
    await sendRealtimeMessage("game.move", {
      game_id: boardState.gameId,
      cell: index,
    });
  } catch (error) {
    window.alert(error.message);
  }
}

function isBoardTurnForCurrentUser() {
  return Boolean(
    boardState &&
    boardState.status === "playing" &&
    boardState.current === boardState.selfSymbol,
  );
}

function isBoardGameForUser(game, uid) {
  if (!game) return false;
  return game.x_uid === uid || game.o_uid === uid;
}

function isPlayableBoardGame(game, uid) {
  return Boolean(
    game && game.status === "active" && isBoardGameForUser(game, uid),
  );
}

function updateBoardUi() {
  if (!boardState) return;

  const squares = Array.from(boardState.boardElement.children);
  boardState.board.forEach((value, index) => {
    const square = squares[index];
    if (!square) return;

    if (value === "X") {
      square.classList.add("filled", "outer-shadow-tactile");
      square.classList.remove("inner-shadow-tactile");
      square.innerHTML = getXIcon(false);
    } else if (value === "O") {
      square.classList.add("filled", "outer-shadow-tactile");
      square.classList.remove("inner-shadow-tactile");
      square.innerHTML = getOIcon(false);
    } else {
      square.classList.remove("filled", "outer-shadow-tactile", "winning");
      square.classList.add("inner-shadow-tactile");
      square.innerHTML = "";
    }

    if (boardState.winningLine.includes(index)) {
      square.classList.add("winning");
    }
  });

  if (boardState.playerXCard && boardState.playerOCard) {
    const xActive =
      boardState.current === "X" && boardState.status === "playing";
    boardState.playerXCard.classList.toggle("active", xActive);
    boardState.playerXCard.classList.toggle("inactive", !xActive);
    boardState.playerOCard.classList.toggle(
      "active",
      !xActive && boardState.status === "playing",
    );
    boardState.playerOCard.classList.toggle(
      "inactive",
      xActive || boardState.status !== "playing",
    );

    boardState.playerXCard
      .querySelector(".turn-indicator")
      ?.classList.toggle("hidden", !xActive);
    boardState.playerOCard
      .querySelector(".turn-indicator")
      ?.classList.toggle("hidden", xActive || boardState.status !== "playing");
  }

  if (boardState.playerXStatus) {
    boardState.playerXStatus.textContent =
      boardState.status === "playing" && boardState.current === "X"
        ? "Current Turn"
        : "Waiting...";
  }

  if (boardState.playerOStatus) {
    boardState.playerOStatus.textContent =
      boardState.status === "playing" && boardState.current === "O"
        ? "Current Turn"
        : "Waiting...";
  }

  if (boardState.movesElement) {
    boardState.movesElement.textContent = String(boardState.moves).padStart(
      2,
      "0",
    );
  }
}

function showBoardResult() {
  if (!boardState) return;

  stopBoardTimer();
  boardState.overlay?.classList.add("visible");

  if (boardState.resultRatings) {
    boardState.resultRatings.textContent = formatBoardRatingUpdate();
  }

  if (boardState.status === "victory") {
    boardState.resultEmoji.textContent = "🏆";
    boardState.resultTitle.textContent = "Victory";
    boardState.resultTitle.style.color = "var(--heritage-red)";
    if (boardState.result === "forfeit") {
      const opponentName =
        boardState.selfSymbol === "X"
          ? boardState.players.O
          : boardState.players.X;
      boardState.resultDesc.textContent = `${opponentName} forfeited the match. Victory is yours.`;
    } else {
      boardState.resultDesc.textContent = `You conquered the arena with strategic precision.`;
    }
    if (typeof window.confetti === "function") {
      window.confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#800000", "#FFFDF5", "#F5F0E1"],
      });
    }
  } else if (boardState.status === "defeat") {
    boardState.resultEmoji.textContent = "💀";
    boardState.resultTitle.textContent = "Defeat";
    boardState.resultTitle.style.color = "var(--heritage-blue)";
    const opponentName =
      boardState.selfSymbol === "X"
        ? boardState.players.O
        : boardState.players.X;
    boardState.resultDesc.textContent = `${opponentName} claimed the heritage grounds.`;
  } else {
    boardState.resultEmoji.textContent = "🤝";
    boardState.resultTitle.textContent = "Tie";
    boardState.resultTitle.style.color = "#57534e";
    boardState.resultDesc.textContent =
      "A balanced match of wits. The arena remains unclaimed.";
  }
}

function formatBoardRatingUpdate() {
  if (!boardState?.ratingUpdate) return "";

  const xLine = `${boardState.players.X}: ${boardState.ratingUpdate.x_old_rating} -> ${boardState.ratingUpdate.x_new_rating}`;
  const oLine = `${boardState.players.O}: ${boardState.ratingUpdate.o_old_rating} -> ${boardState.ratingUpdate.o_new_rating}`;
  return `${xLine}\n${oLine}`;
}

function startBoardTimer() {
  if (!boardState) return;

  stopBoardTimer();
  boardState.timerId = window.setInterval(() => {
    boardState.seconds += 1;
    const mins = Math.floor(boardState.seconds / 60);
    const secs = boardState.seconds % 60;
    if (boardState.timerElement) {
      boardState.timerElement.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
  }, 1000);
}

function stopBoardTimer() {
  if (boardState?.timerId) {
    clearInterval(boardState.timerId);
    boardState.timerId = null;
  }
}

function getXIcon(isPreview) {
  const opacity = isPreview ? 0.1 : 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color: var(--heritage-red); opacity: ${opacity};"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
}

function getOIcon(isPreview) {
  const opacity = isPreview ? 0.1 : 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" style="color: var(--heritage-blue); opacity: ${opacity};"><circle cx="12" cy="12" r="10"></circle></svg>`;
}
