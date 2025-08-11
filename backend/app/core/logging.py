import logging
from logging.config import dictConfig

def setup_logging():
    dictConfig({
        "version": 1,
        "formatters": {
            "default": {"format": "%(asctime)s | %(levelname)s | %(name)s | %(message)s"}
        },
        "handlers": {
            "console": {"class": "logging.StreamHandler", "formatter": "default"}
        },
        "root": {"level": "INFO", "handlers": ["console"]},
    })
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
