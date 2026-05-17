import asyncio
import logging

from backend.services.elo import apply_elo_for_finished_game
from backend.logging_config import configure_logging
from fastapi import (
    FastAPI,
    HTTPException,
    status,
    Depends,
    WebSocket,
    WebSocketDisconnect,
    Query,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from backend.utils.jwt import create_jwt, get_current_uid, get_uid_from_ws_token
from backend.utils.database import (
    set_online,
    set_offline,
    check_user_exists,
    get_user_by_uid,
    get_online_users,
    get_leaderboard,
)
from backend.services.connection_manager import ConnectionManager
from backend.services.game_logic import GameManager

configure_logging()

from backend.services.auth import facial_recog

app = FastAPI()
connection_manager = ConnectionManager()
game_manager = GameManager()
logger = logging.getLogger(__name__)
disconnect_grace_tasks: dict[str, asyncio.Task] = {}
DISCONNECT_GRACE_SECONDS = 5


def build_game_room_id(game_id: str) -> str:
    return f"game:{game_id}"


async def finalize_finished_game(game):
    game_manager.remove_finished_game(game.game_id)


def cancel_disconnect_grace(uid: str) -> None:
    task = disconnect_grace_tasks.pop(uid, None)
    if task is not None:
        task.cancel()


async def forfeit_if_still_disconnected(uid: str):
    try:
        await asyncio.sleep(DISCONNECT_GRACE_SECONDS)
    except asyncio.CancelledError:
        disconnect_grace_tasks.pop(uid, None)
        return

    try:
        if connection_manager.is_connected(uid):
            return

        game = game_manager.handle_disconnect(uid)
        if game is None:
            return

        finalized_game = game_manager.finalize_game(game.game_id)
        if finalized_game is None:
            return

        rating_update = apply_elo_for_finished_game(
            finalized_game.x_uid,
            finalized_game.o_uid,
            finalized_game.winner_uid,
            finalized_game.result,
        )

        room_id = build_game_room_id(game.game_id)
        await connection_manager.broadcast_to_room(
            room_id,
            {
                "type": "game.over",
                "payload": {
                    "game": finalized_game.snapshot(),
                    "rating_update": rating_update,
                },
            },
            exclude=[uid],
        )
        await finalize_finished_game(finalized_game)
    finally:
        disconnect_grace_tasks.pop(uid, None)


class Token(BaseModel):
    access_token: str
    token_type: str


class LoginRequest(BaseModel):
    image: str


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    logger.info("GET / called")
    return {"message": "Hello World"}


@app.post("/login")
async def login(payload: LoginRequest):
    logger.info("POST /login started")
    uid = facial_recog(payload.image)
    if uid:
        if check_user_exists(uid):
            logger.info("POST /login succeeded for uid=%s", uid)
            jwt = create_jwt(uid)
            set_online(uid)
            return Token(access_token=jwt, token_type="bearer")
        logger.warning("POST /login matched uid=%s but user was not found", uid)
    else:
        logger.warning("POST /login failed: no facial match")
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password",
        headers={"WWW-Authenticate": "Bearer"},
    )


@app.get("/me")
async def get_current_user(uid: str = Depends(get_current_uid)):
    logger.info("GET /me called by uid=%s", uid)
    user = get_user_by_uid(uid)
    if not user:
        logger.warning("GET /me user not found for uid=%s", uid)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    return user


@app.get("/lobby")
async def lobby(uid: str = Depends(get_current_uid)):
    logger.info("GET /lobby called by uid=%s", uid)
    online_users = get_online_users()
    return online_users


@app.get("/leaderboard")
async def leaderboard(uid: str = Depends(get_current_uid)):
    logger.info("GET /leaderboard called by uid=%s", uid)
    return get_leaderboard()


@app.websocket("/ws/")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    uid = get_uid_from_ws_token(token)
    if not uid:
        logger.warning("WS /ws/ rejected: invalid token")
        await websocket.close(code=4001)
        return

    logger.info("WS /ws/ connected uid=%s", uid)
    cancel_disconnect_grace(uid)
    set_online(uid)
    await connection_manager.connect(websocket, uid)

    active_game = game_manager.get_game_for_user(uid)
    active_room_id = None
    if active_game is not None:
        active_room_id = build_game_room_id(active_game.game_id)
        connection_manager.leave_room(uid, "lobby")
        connection_manager.join_room(uid, active_room_id)

    await connection_manager.send_json(
        uid,
        {
            "type": "connection.ready",
            "payload": {"uid": uid},
        },
    )

    if active_game is not None:
        await connection_manager.send_json(
            uid,
            {
                "type": "game.state",
                "payload": active_game.snapshot(),
            },
        )
    else:
        await connection_manager.send_json(
            uid,
            {
                "type": "game.absent",
                "payload": {"uid": uid},
            },
        )

        await connection_manager.broadcast_lobby(
            {
                "type": "presence.online",
                "payload": {"uid": uid},
            },
            exclude=[uid],
        )

        await connection_manager.send_json(
            uid,
            {
                "type": "lobby.snapshot",
                "payload": {"users": get_online_users()},
            },
        )

    try:
        while True:
            message = await websocket.receive_json()
            try:
                message_type = message.get("type")
                payload = message.get("payload", {})
                logger.info("WS /ws/ received type=%s from uid=%s", message_type, uid)

                if not message_type:
                    logger.warning("WS /ws/ missing message type from uid=%s", uid)
                    await connection_manager.send_json(
                        uid,
                        {
                            "type": "error",
                            "payload": {"message": "Missing message type"},
                        },
                    )
                    continue

                if message_type == "ping":
                    logger.info("WS ping from uid=%s", uid)
                    await connection_manager.send_json(
                        uid,
                        {
                            "type": "pong",
                            "payload": {"milk": "amul"},
                        },
                    )
                    continue

                if message_type == "challenge.send":
                    target_uid = payload.get("target_uid")
                    if not target_uid:
                        logger.warning(
                            "WS challenge.send missing target_uid from uid=%s", uid
                        )
                        await connection_manager.send_json(
                            uid,
                            {
                                "type": "error",
                                "payload": {"message": "Missing target_uid"},
                            },
                        )
                        continue

                    challenge = game_manager.create_challenge(uid, target_uid)
                    logger.info(
                        "WS challenge.send created from uid=%s to target_uid=%s",
                        uid,
                        target_uid,
                    )

                    await connection_manager.send_json(
                        target_uid,
                        {
                            "type": "challenge.received",
                            "payload": challenge,
                        },
                    )

                    await connection_manager.send_json(
                        uid,
                        {
                            "type": "challenge.sent",
                            "payload": challenge,
                        },
                    )
                    continue

                if message_type == "challenge.accept":
                    from_uid = payload.get("from_uid")
                    if not from_uid:
                        logger.warning(
                            "WS challenge.accept missing from_uid for uid=%s", uid
                        )
                        await connection_manager.send_json(
                            uid,
                            {
                                "type": "error",
                                "payload": {"message": "Missing from_uid"},
                            },
                        )
                        continue

                    game = game_manager.accept_challenge(from_uid, uid)
                    room_id = build_game_room_id(game.game_id)
                    logger.info(
                        "WS challenge.accept created game_id=%s between %s and %s",
                        game.game_id,
                        from_uid,
                        uid,
                    )

                    connection_manager.leave_room(from_uid, "lobby")
                    connection_manager.leave_room(uid, "lobby")
                    connection_manager.join_room(from_uid, room_id)
                    connection_manager.join_room(uid, room_id)

                    await connection_manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "game.created",
                            "payload": game.snapshot(),
                        },
                    )
                    continue

                if message_type == "challenge.reject":
                    from_uid = payload.get("from_uid")
                    if not from_uid:
                        logger.warning(
                            "WS challenge.reject missing from_uid for uid=%s", uid
                        )
                        await connection_manager.send_json(
                            uid,
                            {
                                "type": "error",
                                "payload": {"message": "Missing from_uid"},
                            },
                        )
                        continue

                    challenge = game_manager.reject_challenge(from_uid, uid)
                    logger.info(
                        "WS challenge.reject from uid=%s to uid=%s",
                        uid,
                        from_uid,
                    )

                    await connection_manager.send_json(
                        from_uid,
                        {
                            "type": "challenge.rejected",
                            "payload": {
                                "from_uid": from_uid,
                                "to_uid": uid,
                            },
                        },
                    )

                    await connection_manager.send_json(
                        uid,
                        {
                            "type": "challenge.declined",
                            "payload": challenge,
                        },
                    )
                    continue

                if message_type == "game.move":
                    game_id = payload.get("game_id")
                    cell = payload.get("cell")

                    if game_id is None or cell is None:
                        logger.warning(
                            "WS game.move missing game_id or cell for uid=%s", uid
                        )
                        await connection_manager.send_json(
                            uid,
                            {
                                "type": "error",
                                "payload": {"message": "Missing game_id or cell"},
                            },
                        )
                        continue

                    game = game_manager.apply_move(game_id, uid, cell)
                    room_id = build_game_room_id(game.game_id)
                    logger.info(
                        "WS game.move applied game_id=%s uid=%s cell=%s",
                        game_id,
                        uid,
                        cell,
                    )

                    if not game.is_active():
                        finalized_game = game_manager.finalize_game(game.game_id)
                        if finalized_game is None:
                            continue

                        rating_update = apply_elo_for_finished_game(
                            finalized_game.x_uid,
                            finalized_game.o_uid,
                            finalized_game.winner_uid,
                            finalized_game.result,
                        )
                        await connection_manager.broadcast_to_room(
                            room_id,
                            {
                                "type": "game.over",
                                "payload": {
                                    "game": finalized_game.snapshot(),
                                    "rating_update": rating_update,
                                },
                            },
                        )
                        await finalize_finished_game(finalized_game)
                        continue

                    await connection_manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "game.state",
                            "payload": game.snapshot(),
                        },
                    )
                    continue

                logger.warning(
                    "WS unsupported message type=%s from uid=%s", message_type, uid
                )
                await connection_manager.send_json(
                    uid,
                    {
                        "type": "error",
                        "payload": {
                            "message": f"Unsupported event type: {message_type}"
                        },
                    },
                )

            except ValueError as error:
                logger.warning("WS domain error for uid=%s: %s", uid, error)
                await connection_manager.send_json(
                    uid,
                    {
                        "type": "error",
                        "payload": {"message": str(error)},
                    },
                )

    except WebSocketDisconnect:
        logger.info("WS /ws/ disconnected uid=%s", uid)
        connection_manager.disconnect(uid)
        set_offline(uid)
        await connection_manager.broadcast_lobby(
            {
                "type": "presence.offline",
                "payload": {"uid": uid},
            }
        )

        cancel_disconnect_grace(uid)
        disconnect_grace_tasks[uid] = asyncio.create_task(
            forfeit_if_still_disconnected(uid)
        )
