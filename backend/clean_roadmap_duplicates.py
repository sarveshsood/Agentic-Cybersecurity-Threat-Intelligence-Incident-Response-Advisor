import asyncio
import os
from pathlib import Path

# Safe environment loading
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "soc_console")


async def cleanup_duplicates():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    print(f"Connected to MongoDB: {DB_NAME}.roadmap")

    all_docs = await db.roadmap.find({}).to_list(None)
    print(f"Total roadmap documents found: {len(all_docs)}")

    seen_ids = set()
    seen_titles = set()
    deleted_count = 0

    for doc in all_docs:
        doc_mongo_id = doc.get("_id")
        doc_custom_id = doc.get("id")
        title = (doc.get("title") or "").strip().lower()

        is_duplicate = False

        if doc_custom_id:
            if doc_custom_id in seen_ids:
                is_duplicate = True
            else:
                seen_ids.add(doc_custom_id)

        if not is_duplicate and title:
            if title in seen_titles:
                is_duplicate = True
            else:
                seen_titles.add(title)

        if is_duplicate:
            print(
                f"Deleting duplicate -> Custom ID: {doc_custom_id}, Title: {doc.get('title')}, Mongo ID: {doc_mongo_id}")
            await db.roadmap.delete_one({"_id": doc_mongo_id})
            deleted_count += 1

    print(f"Cleanup complete! Successfully removed {deleted_count} duplicate document(s).")
    client.close()


if __name__ == "__main__":
    asyncio.run(cleanup_duplicates())
