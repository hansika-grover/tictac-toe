import asyncio
from collections.abc import Iterable

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.connections = {}
        self.rooms = {"lobby": set()}

    async def connect(self, websocket: WebSocket, uid: str):
        # Accept websocket, register user, add to lobby
        await websocket.accept()
        self.connections[uid] = websocket
        self.rooms.setdefault("lobby", set()).add(uid)

    def disconnect(self, uid: str):
        # Remove user from active connections
        if uid in self.connections:
            del self.connections[uid]

        # Remove user from every room
        empty_rooms = []

        for room_id in self.rooms:
            if uid in self.rooms[room_id]:
                self.rooms[room_id].remove(uid)

            if room_id != "lobby" and len(self.rooms[room_id]) == 0:
                empty_rooms.append(room_id)

        # Delete empty non-lobby rooms
        for room_id in empty_rooms:
            del self.rooms[room_id]

    def is_connected(self, uid: str) -> bool:
        # Check if user has active websocket
        return uid in self.connections

    def join_room(self, uid: str, room_id: str) -> None:
        # Add user to room
        self.rooms.setdefault(room_id, set()).add(uid)

    def leave_room(self, uid: str, room_id: str) -> None:
        # Remove user from room
        if room_id in self.rooms:
            self.rooms[room_id].discard(uid)

            # Remove room if empty and not lobby
            if room_id != "lobby" and len(self.rooms[room_id]) == 0:
                del self.rooms[room_id]

    def get_room_members(self, room_id: str) -> set[str]:
        # Return members of room
        return self.rooms.get(room_id, set())

    async def send_json(self, uid: str, message: dict) -> bool:
        # Send JSON to one user
        if uid not in self.connections:
            return False

        try:
            await self.connections[uid].send_json(message)
            return True
        except:
            self.disconnect(uid)
            return False

    async def broadcast_to_room(
        self,
        room_id: str,
        message: dict,
        exclude: Iterable[str] | None = None,
    ) -> None:
        # Broadcast to all users in room except excluded
        exclude_set = set(exclude or [])

        tasks = []

        for uid in self.rooms.get(room_id, set()):
            if uid not in exclude_set:
                tasks.append(self.send_json(uid, message))

        if tasks:
            await asyncio.gather(*tasks)

    async def broadcast_lobby(
        self,
        message: dict,
        exclude: Iterable[str] | None = None,
    ) -> None:
        # Broadcast to lobby users
        await self.broadcast_to_room("lobby", message, exclude)