from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import numpy as np
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = SentenceTransformer('all-MiniLM-L6-v2')

THRESHOLD = 0.15

class VideoCheckRequest(BaseModel):
    title: str
    description: str
    blocked_categories: list[str]

class VideoCheckResponse(BaseModel):
    action: str
    reason: str = ""
    matched_category: str = ""
    similarity: float = 0.0


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a_norm = np.linalg.norm(a)
    b_norm = np.linalg.norm(b)
    if a_norm == 0 or b_norm == 0:
        return 0.0
    return float(np.dot(a, b) / (a_norm * b_norm))


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.casefold()).strip()


def contains_blocked_keyword(video_text: str, category: str) -> bool:
    normalized_video = normalize_text(video_text)
    normalized_category = normalize_text(category)

    if not normalized_video or not normalized_category:
        return False

    pattern = rf"(?<!\w){re.escape(normalized_category)}(?!\w)"
    return re.search(pattern, normalized_video) is not None


def category_comparison_texts(category: str) -> list[str]:
    return [
        category,
        f"videos about {category}",
        f"content focused on {category}",
        f"This YouTube video is about {category}",
        f"This YouTube video is heavily focused on the topic of: {category}",
    ]


@app.post("/check-video", response_model=VideoCheckResponse)
def check_video(payload: VideoCheckRequest):
    if not payload.blocked_categories:
        return {"action": "allow", "reason": "no_blocked_categories"}

    video_text = f"{payload.title}. {payload.description}".strip()

    for category in payload.blocked_categories:
        if contains_blocked_keyword(video_text, category):
            return {
                "action": "block",
                "reason": "keyword",
                "matched_category": category,
                "similarity": 1.0,
            }

    video_embedding = model.encode(video_text, convert_to_numpy=True)
    best_category = ""
    best_similarity = 0.0

    for category in payload.blocked_categories:
        comparison_embeddings = model.encode(
            category_comparison_texts(category),
            convert_to_numpy=True,
        )
        similarity = max(
            cosine_similarity(video_embedding, category_embedding)
            for category_embedding in comparison_embeddings
        )

        if similarity > best_similarity:
            best_similarity = similarity
            best_category = category

        if similarity > THRESHOLD:
            return {
                "action": "block",
                "reason": "semantic_similarity",
                "matched_category": category,
                "similarity": similarity,
            }

    return {
        "action": "allow",
        "reason": "below_similarity_threshold",
        "matched_category": best_category,
        "similarity": best_similarity,
    }
