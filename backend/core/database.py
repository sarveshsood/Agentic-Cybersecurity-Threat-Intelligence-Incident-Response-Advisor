"""Mongo client + database handle (import early after dotenv)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")

if "MONGO_URL" not in os.environ:
    raise RuntimeError(
        "MONGO_URL is not set. Copy backend/.env.example to backend/.env and configure it, "
        "or set the environment variable. Mongo is required for ACTIRA."
    )
if "DB_NAME" not in os.environ:
    raise RuntimeError("DB_NAME is not set in environment (see backend/.env).")

mongo_url = os.environ["MONGO_URL"]
_MONGO_SERVER_SELECTION_MS = int(os.environ.get("MONGO_SERVER_SELECTION_MS", "5000") or "5000")
client = AsyncIOMotorClient(
    mongo_url,
    serverSelectionTimeoutMS=_MONGO_SERVER_SELECTION_MS,
    connectTimeoutMS=int(os.environ.get("MONGO_CONNECT_TIMEOUT_MS", "5000") or "5000"),
)
db = client[os.environ["DB_NAME"]]
