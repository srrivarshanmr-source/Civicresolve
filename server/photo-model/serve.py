import hashlib
import hmac
import io
import os
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException, Request
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from model import PREPROCESS, build_model, load_photo

MODEL_ID = "Ateeqq/ai-vs-human-image-detector"
MODEL_REVISION = "60e82406916921b823616bee33397baab38af3f0"
token = ("Bearer " + os.environ.get("PHOTO_SCREEN_TOKEN", "civic-screen-token")).encode()


def load_detector(checkpoint):
    if checkpoint:
        artifact = Path(checkpoint).read_bytes()
        state = torch.load(io.BytesIO(artifact), map_location="cpu", weights_only=True)
        model = build_model()
        model.load_state_dict(state["weights"])
        model.eval()

        def predict(photo):
            return (model(PREPROCESS(photo).unsqueeze(0)) / state["temperature"]).softmax(dim=1)[0, 1]

        return predict, hashlib.sha256(artifact).hexdigest()

    from transformers import AutoImageProcessor, AutoModelForImageClassification

    processor = AutoImageProcessor.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
    model = AutoModelForImageClassification.from_pretrained(
        MODEL_ID, revision=MODEL_REVISION, use_safetensors=True,
    ).eval()
    if set(model.config.label2id) != {"ai", "hum"}:
        raise RuntimeError("Unexpected photo detector labels")
    ai_index = model.config.label2id["ai"]

    def predict(photo):
        inputs = processor(images=photo, return_tensors="pt")
        return model(**inputs).logits.softmax(dim=1)[0, ai_index]

    return predict, f"{MODEL_ID}@{MODEL_REVISION}"


predict, version = load_detector(os.getenv("PHOTO_MODEL_PATH"))
app = FastAPI()


@torch.inference_mode()
def screen(payload):
    photo = load_photo(io.BytesIO(payload))
    probability = predict(photo).item()
    return {"aiProbability": probability, "modelVersion": version}


@app.post("/screen")
async def classify(request: Request):
    if not hmac.compare_digest(request.headers.get("authorization", "").encode(), token):
        raise HTTPException(401)
    if request.headers.get("content-type") not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415)
    payload = bytearray()
    async for chunk in request.stream():
        if len(payload) + len(chunk) > 2 * 1024 * 1024:
            raise HTTPException(413)
        payload.extend(chunk)
    try:
        return await run_in_threadpool(screen, payload)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise HTTPException(422, "Image could not be decoded")
