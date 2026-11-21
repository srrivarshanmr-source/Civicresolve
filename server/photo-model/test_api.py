import os
import io
from PIL import Image

# Ensure test token is set before importing serve
os.environ["PHOTO_SCREEN_TOKEN"] = "test-secret-token"

from starlette.testclient import TestClient
from serve import app

client = TestClient(app)

print("--- 1. Testing Unauthorized Request ---")
res = client.post("/screen", headers={"Authorization": "Bearer wrong-token", "Content-Type": "image/jpeg"}, content=b"123")
print("Status code:", res.status_code)
assert res.status_code == 401, f"Expected 401, got {res.status_code}"
print("Passed!")

print("\n--- 2. Testing Unsupported Media Type ---")
res = client.post("/screen", headers={"Authorization": "Bearer test-secret-token", "Content-Type": "application/pdf"}, content=b"123")
print("Status code:", res.status_code)
assert res.status_code == 415, f"Expected 415, got {res.status_code}"
print("Passed!")

print("\n--- 3. Testing Real Photo ---")
with open("real_photo.jpg", "rb") as f:
    photo_bytes = f.read()

res = client.post(
    "/screen",
    headers={"Authorization": "Bearer test-secret-token", "Content-Type": "image/jpeg"},
    content=photo_bytes,
)
print("Status code:", res.status_code)
assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
data = res.json()
print("Response:", data)
assert "aiProbability" in data and "modelVersion" in data
print(f"Real photo aiProbability: {data['aiProbability']:.4f} (Expected < 0.5)")
assert data["aiProbability"] < 0.5, "Real photo should not be flagged as AI"
print("Passed!")

print("\n--- 4. Testing AI-Generated Image ---")
ai_image_path = r"C:\Users\kanna\.gemini\antigravity\brain\5f0ecd11-a695-462b-90c1-cd3ea7c4ae3d\.user_uploaded\media_1795271145479_23e8b388.jpg"
with open(ai_image_path, "rb") as f:
    ai_bytes = f.read()

res = client.post(
    "/screen",
    headers={"Authorization": "Bearer test-secret-token", "Content-Type": "image/jpeg"},
    content=ai_bytes,
)
print("Status code:", res.status_code)
assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
ai_data = res.json()
print("Response:", ai_data)
print(f"AI image aiProbability: {ai_data['aiProbability']:.4f} (Expected > 0.5)")
assert ai_data["aiProbability"] > 0.5, "AI image must be flagged as AI"
print("Passed! AI image successfully flagged and rejected!")
