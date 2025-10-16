"""
Prometheus metrics for monitoring
"""

from prometheus_client import Counter, Histogram, Gauge, generate_latest
from functools import wraps
import time
from typing import Callable


# Metrics
requests_total = Counter(
    "ai_requests_total", "Total AI requests", ["endpoint", "model_type"]
)

request_duration_seconds = Histogram(
    "ai_request_duration_seconds",
    "Request duration in seconds",
    ["endpoint", "model_type"],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0],
)

tokens_generated_total = Counter(
    "ai_tokens_generated_total", "Total tokens generated", ["model_type"]
)

model_load_duration_seconds = Histogram(
    "ai_model_load_duration_seconds",
    "Model loading duration in seconds",
    ["model_name"],
)

active_models = Gauge("ai_active_models", "Number of currently loaded models")

errors_total = Counter("ai_errors_total", "Total errors", ["endpoint", "error_type"])


def track_request(endpoint: str, model_type: str):
    """Decorator to track request metrics"""

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            requests_total.labels(endpoint=endpoint, model_type=model_type).inc()

            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                errors_total.labels(
                    endpoint=endpoint, error_type=type(e).__name__
                ).inc()
                raise
            finally:
                duration = time.time() - start_time
                request_duration_seconds.labels(
                    endpoint=endpoint, model_type=model_type
                ).observe(duration)

        return wrapper

    return decorator


def get_metrics() -> bytes:
    """Get current metrics in Prometheus format"""
    return generate_latest()
