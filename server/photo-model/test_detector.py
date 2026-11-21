import sys
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

MODEL_ID = "Ateeqq/ai-vs-human-image-detector"
MODEL_REVISION = "60e82406916921b823616bee33397baab38af3f0"

print("Loading processor and model...")
processor = AutoImageProcessor.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
model = AutoModelForImageClassification.from_pretrained(
    MODEL_ID, revision=MODEL_REVISION, use_safetensors=True,
).eval()

print("Model labels:", model.config.label2id)
assert set(model.config.label2id) == {"ai", "hum"}, "Unexpected labels"
ai_index = model.config.label2id["ai"]
hum_index = model.config.label2id["hum"]

@torch.inference_mode()
def predict_image(img_path):
    img = Image.open(img_path).convert("RGB")
    inputs = processor(images=img, return_tensors="pt")
    logits = model(**inputs).logits
    probs = logits.softmax(dim=1)[0]
    ai_prob = probs[ai_index].item()
    hum_prob = probs[hum_index].item()
    return ai_prob, hum_prob

if len(sys.argv) > 1:
    for path in sys.argv[1:]:
        ai_p, hum_p = predict_image(path)
        print(f"File: {path}")
        print(f"  AI Probability:    {ai_p:.4f} ({ai_p*100:.2f}%)")
        print(f"  Human Probability: {hum_p:.4f} ({hum_p*100:.2f}%)")
        print(f"  Result: {'REJECTED (AI)' if ai_p > 0.5 else 'ACCEPTED (HUMAN)'}")
