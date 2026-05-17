import logging
import os


LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"


def configure_logging() -> None:
    level_name = os.getenv("BACKEND_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    if not logging.getLogger().handlers:
        logging.basicConfig(level=level, format=LOG_FORMAT)

    logging.getLogger("backend").setLevel(level)
