from uuid import uuid4


class GameState:
    # Initialize a new tic-tac-toe game state for two users.
    def __init__(self, game_id: str, x_uid: str, o_uid: str, turn_uid=None):
        self.game_id = game_id
        self.x_uid = x_uid
        self.o_uid = o_uid
        self.board = [None] * 9
        self.turn_uid = turn_uid
        self.status = "active"
        self.result = None
        self.winner_uid = None
        self.winning_line = None
        self.last_move = None
        self.disconnected_uid = None

    # Return the board symbol assigned to the given player.
    def symbol_for(self, uid: str):
        if uid == self.x_uid:
            return "X"
        if uid == self.o_uid:
            return "O"
        return None

    # Return the opponent UID for a player in this game.
    def other_player(self, uid: str):
        if uid == self.x_uid:
            return self.o_uid
        if uid == self.o_uid:
            return self.x_uid
        return None

    # Check whether the given UID belongs to one of the players.
    def has_player(self, uid: str):
        return uid == self.x_uid or uid == self.o_uid

    # Report whether the game can still accept moves.
    def is_active(self):
        return self.status == "active"

    # Validate and apply a move, then update the game outcome if needed.
    def apply_move(self, uid: str, cell: int) -> None:
        if self.status != "active":
            raise ValueError("Game is not active")
        if uid != self.turn_uid:
            raise ValueError("It is not this player's turn")
        if cell < 0 or cell >= 9:
            raise ValueError("Cell is out of bounds")
        if self.board[cell] is not None:
            raise ValueError("Cell is already occupied")

        symbol = self.symbol_for(uid)
        if symbol is None:
            raise ValueError("Player is not part of this game")

        self.board[cell] = symbol
        self.last_move = {"uid": uid, "cell": cell, "symbol": symbol}

        line = self._find_winning_line(symbol)
        if line is not None:
            self.status = "finished"
            self.result = "win"
            self.winner_uid = uid
            self.winning_line = line
            self.turn_uid = None
            return

        if self._is_draw():
            self.status = "finished"
            self.result = "draw"
            self.winner_uid = None
            self.winning_line = None
            self.turn_uid = None
            return

        self.turn_uid = self.other_player(uid)
        return

    # End the game as a forfeit when a participating user disconnects.
    def mark_forfeit(self, disconnected_uid: str) -> None:
        if self.status != "active":
            return
        if not self.has_player(disconnected_uid):
            raise ValueError("Player is not part of this game")

        self.status = "finished"
        self.result = "forfeit"
        self.winner_uid = self.other_player(disconnected_uid)
        self.winning_line = None
        self.turn_uid = None
        self.disconnected_uid = disconnected_uid
        return

    # Return a serializable snapshot of the current game state.
    def snapshot(self) -> dict:
        last_move = self.last_move
        return {
            "game_id": self.game_id,
            "x_uid": self.x_uid,
            "o_uid": self.o_uid,
            "board": self.board.copy(),
            "turn_uid": self.turn_uid,
            "status": self.status,
            "result": self.result,
            "winner_uid": self.winner_uid,
            "winning_line": None if self.winning_line is None else self.winning_line.copy(),
            "last_move": None if last_move is None else last_move.copy(),
            "disconnected_uid": self.disconnected_uid,
        }

    # Find the winning three-cell line for a symbol, if one exists.
    def _find_winning_line(self, symbol: str):
        board = self.board
        winning_lines = (
            (0, 1, 2),
            (3, 4, 5),
            (6, 7, 8),
            (0, 3, 6),
            (1, 4, 7),
            (2, 5, 8),
            (0, 4, 8),
            (2, 4, 6),
        )
        for line in winning_lines:
            a, b, c = line
            if board[a] == symbol and board[b] == symbol and board[c] == symbol:
                return list(line)
        return None

    # Check whether the board is full without a winner. case of draw
    def _is_draw(self):
        return None not in self.board


class GameManager:
    # Set up in-memory tracking for games, users, and pending challenges.
    def __init__(self):
        self.games = {}
        self.user_to_game = {}
        self.pending_challenges = {}

    # Create and store a pending challenge between two users.
    def create_challenge(self, from_uid: str, to_uid: str) -> dict:
        if from_uid == to_uid:
            raise ValueError("Cannot challenge yourself")
        if self.is_user_in_game(from_uid) or self.is_user_in_game(to_uid):
            raise ValueError("One or both users are already in an active game")

        challenge = {
            "from_uid": from_uid,
            "to_uid": to_uid,
            "status": "pending",
        }
        key = (from_uid, to_uid)
        reverse_key = (to_uid, from_uid)
        if key in self.pending_challenges or reverse_key in self.pending_challenges:
            raise ValueError("A pending challenge already exists between these users")
        self.pending_challenges[key] = challenge
        return challenge

    # Look up an existing challenge by challenger and recipient.
    def get_challenge(self, from_uid: str, to_uid: str) -> dict | None:
        key = (from_uid, to_uid)
        return self.pending_challenges.get(key)

    # Remove a pending challenge before it is accepted.
    def cancel_challenge(self, from_uid: str, to_uid: str) -> dict | None:
        key = (from_uid, to_uid)
        challenge = self.pending_challenges.get(key)
        if challenge is None or challenge.get("status") != "pending":
            return None
        return self.pending_challenges.pop(key)

    # Reject a pending challenge and return a rejected copy for notification.
    def reject_challenge(self, from_uid: str, to_uid: str) -> dict | None:
        key = (from_uid, to_uid)
        challenge = self.pending_challenges.get(key)
        if challenge is None or challenge.get("status") != "pending":
            return None
        rejected_challenge = {**challenge, "status": "rejected"}
        self.pending_challenges.pop(key)
        return rejected_challenge

    # Turn a pending challenge into a new active game for both users.
    def accept_challenge(self, from_uid: str, to_uid: str) -> GameState:
        key = (from_uid, to_uid)
        challenge = self.pending_challenges.get(key)
        if challenge is None or challenge.get("status") != "pending":
            raise ValueError("Challenge is not pending")
        if self.is_user_in_game(from_uid) or self.is_user_in_game(to_uid):
            raise ValueError("One or both users are already in an active game")

        game = GameState(
            game_id=str(uuid4()),
            x_uid=from_uid,
            o_uid=to_uid,
            turn_uid=from_uid,
        )
        self.pending_challenges.pop(key, None)
        self.games[game.game_id] = game
        self.user_to_game[from_uid] = game.game_id
        self.user_to_game[to_uid] = game.game_id
        return game

    # Return an active game by its ID.
    def get_game(self, game_id: str) -> GameState | None:
        game = self.games.get(game_id)
        if game is not None and game.is_active():
            return game
        return None

    # Return the active game currently associated with a user.
    def get_game_for_user(self, uid: str) -> GameState | None:
        game_id = self.user_to_game.get(uid)
        if game_id is None:
            return None
        game = self.games.get(game_id)
        if game is not None and game.is_active():
            return game
        self.user_to_game.pop(uid, None)
        return None

    # Check whether a user is already participating in an active game.
    def is_user_in_game(self, uid: str) -> bool:
        game_id = self.user_to_game.get(uid)
        if game_id is None:
            return False
        game = self.games.get(game_id)
        if game is not None and game.is_active():
            return True
        self.user_to_game.pop(uid, None)
        return False

    def apply_move(self, game_id: str, uid: str, cell: int) -> GameState:
        active_game_id = self.user_to_game.get(uid)
        if active_game_id is None:
            raise ValueError("Player is not in an active game")
        if active_game_id != game_id:
            raise ValueError("Player is not part of this game")

        game = self.games.get(game_id)
        if game is None:
            self.user_to_game.pop(uid, None)
            raise ValueError("Game not found")
        if not game.is_active():
            self.user_to_game.pop(uid, None)
            raise ValueError("Game is not active")
        if not game.has_player(uid):
            raise ValueError("Player is not part of this game")

        game.apply_move(uid, cell)
        return game

    # Forfeit an active game when one of its users disconnects.
    def handle_disconnect(self, uid: str) -> GameState | None:
        game_id = self.user_to_game.get(uid)
        if game_id is None:
            return None

        game = self.games.get(game_id)
        if game is None:
            self.user_to_game.pop(uid, None)
            return None

        if not game.is_active():
            self.user_to_game.pop(uid, None)
            return None

        if not game.has_player(uid):
            self.user_to_game.pop(uid, None)
            return None

        game.mark_forfeit(uid)
        return game

    # Mark a finished game ready for one-time cleanup or persistence work.
    def finalize_game(self, game_id: str) -> GameState | None:
        game = self.games.get(game_id)
        if game is None or game.is_active():
            return None
        if getattr(game, "_finalized", False):
            return None

        game._finalized = True
        return game

    # Remove a finished game and clear any player-to-game mappings.
    def remove_finished_game(self, game_id: str) -> None:
        game = self.games.get(game_id)
        if game is None or game.is_active():
            return

        self.games.pop(game_id, None)
        if self.user_to_game.get(game.x_uid) == game_id:
            self.user_to_game.pop(game.x_uid, None)
        if self.user_to_game.get(game.o_uid) == game_id:
            self.user_to_game.pop(game.o_uid, None)
        return

    # Clear all pending challenge and game-tracking state for a user.
    def clear_user_state(self, uid: str) -> None:
        game_id = self.user_to_game.pop(uid, None)
        if game_id is not None:
            game = self.games.get(game_id)
            if game is not None:
                other_uid = game.other_player(uid)
                if other_uid is not None and self.user_to_game.get(other_uid) == game_id:
                    self.user_to_game.pop(other_uid, None)
                self.games.pop(game_id, None)

        keys_to_remove = [
            key
            for key, challenge in self.pending_challenges.items()
            if challenge.get("from_uid") == uid or challenge.get("to_uid") == uid
        ]
        for key in keys_to_remove:
            self.pending_challenges.pop(key, None)
        return
