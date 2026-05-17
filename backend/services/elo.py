from backend.utils.database import get_user_ratings, update_user_ratings


def calculate_elo_updates(
    x_rating: int,
    o_rating: int,
    x_score: float,
    o_score: float,
    k: int = 32,
) -> tuple[int, int]:
    expected_x = 1 / (1 + 10 ** ((o_rating - x_rating) / 400))
    expected_o = 1 / (1 + 10 ** ((x_rating - o_rating) / 400))

    new_x = round(x_rating + k * (x_score - expected_x))
    new_o = round(o_rating + k * (o_score - expected_o))
    return new_x, new_o


def apply_elo_for_finished_game(
    x_uid: str,
    o_uid: str,
    winner_uid: str | None,
    result: str | None,
) -> dict:
    x_rating, o_rating = get_user_ratings(x_uid, o_uid)

    x_score = 0.5
    o_score = 0.5

    if result in {"win", "forfeit"}:
        if winner_uid == x_uid:
            x_score = 1.0
            o_score = 0.0
        else:
            x_score = 0.0
            o_score = 1.0

    new_x_rating, new_o_rating = calculate_elo_updates(
        x_rating,
        o_rating,
        x_score,
        o_score,
    )

    update_user_ratings(x_uid, new_x_rating, o_uid, new_o_rating)

    return {
        "x_uid": x_uid,
        "o_uid": o_uid,
        "x_old_rating": x_rating,
        "x_new_rating": new_x_rating,
        "o_old_rating": o_rating,
        "o_new_rating": new_o_rating,
    }
