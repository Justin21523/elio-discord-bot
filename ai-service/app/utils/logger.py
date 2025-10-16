"""
Logging utilities with structured logging support
"""

import logging
import sys
import json
from datetime import datetime
from typing import Any, Dict


class StructuredFormatter(logging.Formatter):
    """JSON structured logging formatter"""

    def format(self, record: logging.LogRecord) -> str:
        log_data: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add extra fields if present
        if hasattr(record, "extra"):
            log_data.update(record.extra)  # type: ignore

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)


def setup_logger(name: str, level: str = "INFO") -> logging.Logger:
    """
    Setup a structured logger

    Args:
        name: Logger name
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper()))

    # Remove existing handlers
    logger.handlers.clear()

    # Console handler with structured formatting
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(StructuredFormatter())
    logger.addHandler(handler)

    return logger


# Global logger instance
logger = setup_logger("ai-service")


def log_info(message: str, **kwargs):
    """Log info message with extra fields"""
    logger.info(message, extra=kwargs)


def log_error(message: str, **kwargs):
    """Log error message with extra fields"""
    logger.error(message, extra=kwargs)


def log_warning(message: str, **kwargs):
    """Log warning message with extra fields"""
    logger.warning(message, extra=kwargs)


def log_debug(message: str, **kwargs):
    """Log debug message with extra fields"""
    logger.debug(message, extra=kwargs)
