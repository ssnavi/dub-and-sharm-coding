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
ALLOW_ONLY_THRESHOLD = 0.30

class VideoCheckRequest(BaseModel):
    title: str
    description: str
    blocked_categories: list[str] = []
    allowed_categories: list[str] = []
    mode: str = "block"

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


def contains_keyword_match(video_text: str, category: str) -> bool:
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


def get_best_match(video_embedding: np.ndarray, categories: list[str]) -> tuple[str, float]:
    best_category = ""
    best_similarity = 0.0

    for category in categories:
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

    return best_category, best_similarity


def evaluate_video_against_categories(video_text: str, categories: list[str]) -> tuple[str, float, bool]:
    for category in categories:
        if contains_keyword_match(video_text, category):
            return category, 1.0, True

    video_embedding = model.encode(video_text, convert_to_numpy=True)
    best_category, best_similarity = get_best_match(video_embedding, categories)
    return best_category, best_similarity, False


@app.post("/check-video", response_model=VideoCheckResponse)
def check_video(payload: VideoCheckRequest):
    video_text = f"{payload.title}. {payload.description}".strip()
    categories = payload.allowed_categories if payload.mode == "allow_only" else payload.blocked_categories

    if not categories:
        return {
            "action": "allow",
            "reason": f"no_{payload.mode}_categories",
            "matched_category": "",
            "similarity": 0.0,
        }

    matched_category, similarity, keyword_match = evaluate_video_against_categories(video_text, categories)

    if payload.mode == "block":
        if keyword_match or similarity > THRESHOLD:
            return {
                "action": "block",
                "reason": "semantic_similarity" if not keyword_match else "keyword",
                "matched_category": matched_category,
                "similarity": similarity,
            }

        return {
            "action": "allow",
            "reason": "below_similarity_threshold",
            "matched_category": matched_category,
            "similarity": similarity,
        }

    # allow_only mode
    if keyword_match or similarity >= ALLOW_ONLY_THRESHOLD:
        return {
            "action": "allow",
            "reason": "allowed_category_match" if not keyword_match else "keyword",
            "matched_category": matched_category,
            "similarity": similarity,
        }

    return {
        "action": "block",
        "reason": "not_allowed_category",
        "matched_category": matched_category,
        "similarity": similarity,
    }
