# backend/app/core/logging.py
import sys
from logging.config import dictConfig

def setup_logging():
    dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            # Single JSON formatter we’ll use everywhere
            "json": {
                "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
                "fmt": (
                    "%(asctime)s %(levelname)s %(name)s %(message)s "
                    "%(request_id)s %(method)s %(path)s %(status_code)s "
                    "%(duration_ms)s %(client_ip)s %(user_agent)s"
                ),
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "stream": sys.stdout,
                "formatter": "json",
            },
        },
        "loggers": {
            # Our app loggers
            "http":         {"handlers": ["console"], "level": "INFO", "propagate": False},
            "retention":    {"handlers": ["console"], "level": "INFO", "propagate": False},

            # Uvicorn loggers — keep, but lower access noise to WARNING to avoid dup lines
            "uvicorn":         {"handlers": ["console"], "level": "INFO",    "propagate": False},
            "uvicorn.error":   {"handlers": ["console"], "level": "INFO",    "propagate": False},
            "uvicorn.access":  {"handlers": ["console"], "level": "WARNING", "propagate": False},
        },
        "root": {"level": "INFO", "handlers": ["console"]},
    })
