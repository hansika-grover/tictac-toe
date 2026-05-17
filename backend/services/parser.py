import csv
import hashlib
import logging
import os
from pathlib import Path

import requests
import pymysql
from bson.binary import Binary
from dotenv import load_dotenv
from pymongo import MongoClient

from backend.logging_config import configure_logging
from backend.utils.facial_recognition_module import get_face_encoding

configure_logging()
logger = logging.getLogger(__name__)

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

mysql_conn = pymysql.connect(
    host=os.getenv("MYSQL_HOST"),
    port=int(os.getenv("MYSQL_PORT")),
    user=os.getenv("MYSQL_USER"),
    password=os.getenv("MYSQL_PASSWORD"),
    database=os.getenv("MYSQL_DATABASE"),
)

mysql_cursor = mysql_conn.cursor()

mongo_client = MongoClient(os.getenv("MONGODB_CONNECTION_STRING"))
mongo_db = mongo_client["student_assets"]
mongo_collection = mongo_db["profile_images"]

filename = "backend/batch_data.csv"

with open(filename, "r") as csvfile:
    csvreader = csv.DictReader(csvfile)

    for row in csvreader:
        uid = row["uid"]
        name = row["name"]
        website_url = row["website_url"]

        image_url = "https://" + website_url + "/images/pfp.jpg"

        try:
            response = requests.get(image_url, timeout=5)

            if response.status_code == 200:
                image_data = response.content
                image_hash = hashlib.sha256(image_data).hexdigest()
                encoding = get_face_encoding(image_data)

                mysql_query = """
                INSERT INTO users (uid, name)
                VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE name=%s
                """

                mysql_cursor.execute(mysql_query, (uid, name, name))
                mysql_conn.commit()

                mongo_update = {"image": Binary(image_data), "image_hash": image_hash}
                if encoding is not None:
                    mongo_update["encoding"] = encoding.tolist()
                    mongo_collection.update_one(
                        {"uid": uid}, {"$set": mongo_update}, upsert=True
                    )
                    logger.info(
                        "Stored image and encoding for uid=%s name=%s", uid, name
                    )
                else:
                    mongo_collection.update_one(
                        {"uid": uid},
                        {"$set": mongo_update, "$unset": {"encoding": ""}},
                        upsert=True,
                    )
                    logger.info(
                        "Stored image without face encoding for uid=%s name=%s",
                        uid,
                        name,
                    )

            else:
                logger.warning("No image found for uid=%s name=%s", uid, name)

        except Exception:
            logger.exception("Failed processing uid=%s", uid)

mysql_cursor.close()
mysql_conn.close()
mongo_client.close()
