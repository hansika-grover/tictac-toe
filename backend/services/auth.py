import logging
import os
import pickle
import time
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

from backend.utils.facial_recognition_module import build_encodings_cache
from backend.utils.facial_recognition_module import find_closest_match as fr_match

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

mongo_client = MongoClient(os.getenv("MONGODB_CONNECTION_STRING"))
mongo_db = mongo_client["student_assets"]
mongo_collection = mongo_db["profile_images"]
CACHE_PATH = Path(__file__).resolve().parent.parent / ".cache" / "face_encodings.pkl"
logger = logging.getLogger(__name__)


def get_db_images_dict():
    logger.info("Loading raw profile images from MongoDB")
    db_images_dict = {}

    for doc in mongo_collection.find():
        uid = doc.get("uid")
        image_data = doc.get("image")

        if uid and image_data:
            db_images_dict[uid] = image_data

    logger.info("Loaded %s raw profile images", len(db_images_dict))
    return db_images_dict


def load_cached_encodings():
    if not CACHE_PATH.exists():
        return None

    with CACHE_PATH.open("rb") as cache_file:
        cache_payload = pickle.load(cache_file)

    encodings_cache = cache_payload.get("encodings")
    if not isinstance(encodings_cache, dict):
        return None

    logger.info("Loaded %s cached encodings from %s", len(encodings_cache), CACHE_PATH)
    return encodings_cache


def save_cached_encodings(encodings_cache):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)

    with CACHE_PATH.open("wb") as cache_file:
        pickle.dump({"encodings": encodings_cache}, cache_file)

    logger.info("Saved %s cached encodings to %s", len(encodings_cache), CACHE_PATH)


def load_or_build_encodings_cache():
    encodings_cache = load_cached_encodings()
    if encodings_cache is not None:
        return encodings_cache

    logger.info("Cached encodings not found; rebuilding from MongoDB")
    db_images_dict = get_db_images_dict()
    encodings_cache = build_encodings_cache(db_images_dict)
    save_cached_encodings(encodings_cache)
    return encodings_cache


encodings_cache = load_or_build_encodings_cache()


def facial_recog(image):
    started_at = time.time()
    logger.info(
        "Comparing login image against %s cached encodings", len(encodings_cache)
    )
    matched_uid = fr_match(image, encodings_cache)
    logger.info("Cached-encoding flow completed in %.2fs", time.time() - started_at)
    return matched_uid
