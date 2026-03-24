import os
from pathlib import Path

from slowapi import Limiter
from slowapi.util import get_remote_address

BASE_DIR = Path(__file__).resolve().parent.parent.parent
_env_file = os.path.join(BASE_DIR, ".env")
limiter = Limiter(
    key_func=get_remote_address,
    config_filename=_env_file if os.path.exists(_env_file) else None
)
