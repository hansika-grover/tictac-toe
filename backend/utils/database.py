import os
import pymysql
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

mysql_conn = pymysql.connect(
    host=os.getenv("MYSQL_HOST"),
    port=int(os.getenv("MYSQL_PORT", "3306")),
    user=os.getenv("MYSQL_USER"),
    password=os.getenv("MYSQL_PASSWORD"),
    database=os.getenv("MYSQL_DATABASE"),
)


def set_online(uid):
    cursor = mysql_conn.cursor()
    query = "update users set is_online = true where uid=%s"
    cursor.execute(query, (uid,))
    mysql_conn.commit()


def set_offline(uid):
    cursor = mysql_conn.cursor()
    query = "update users set is_online = false where uid=%s"
    cursor.execute(query, (uid,))
    mysql_conn.commit()


def check_user_exists(uid):
    cursor = mysql_conn.cursor()
    cursor.execute("select * from users where uid= %s", (uid,))
    result = cursor.fetchone()
    if result:
        return True
    return False


def get_user_by_uid(uid):
    cursor = mysql_conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute("SELECT * FROM users WHERE uid = %s", (uid,))
    result = cursor.fetchone()

    return result


def get_user_ratings(uid_one, uid_two):
    cursor = mysql_conn.cursor()

    query = """
    SELECT uid, elo_rating
    FROM users
    WHERE uid IN (%s, %s)
    """

    cursor.execute(query, (uid_one, uid_two))
    rows = cursor.fetchall()

    ratings = {}

    for row in rows:
        uid, rating = row
        ratings[uid] = rating

    return ratings[uid_one], ratings[uid_two]


def update_user_ratings(x_uid, x_rating, o_uid, o_rating):
    cursor = mysql_conn.cursor()

    cursor.execute(
        "UPDATE users SET elo_rating = %s WHERE uid = %s",
        (x_rating, x_uid),
    )

    cursor.execute(
        "UPDATE users SET elo_rating = %s WHERE uid = %s",
        (o_rating, o_uid),
    )

    mysql_conn.commit()

def get_online_users():
    cursor = mysql_conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute(
        "SELECT uid, name, elo_rating, is_online FROM users WHERE is_online = TRUE "
    )
    return cursor.fetchall()


def get_leaderboard():
    cursor = mysql_conn.cursor(pymysql.cursors.DictCursor)
    cursor.execute(
        """
        SELECT uid, name, elo_rating, is_online
        FROM users
        ORDER BY elo_rating DESC, name ASC, uid ASC
        """
    )
    return cursor.fetchall()
