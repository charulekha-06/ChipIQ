"""
ChipIQ Face Recognition Backend
FastAPI server for role-based face authentication
"""

import os
import io
import json
import base64
import numpy as np
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from PIL import Image
import cv2

# ─── Config ────────────────────────────────────────────────────────────────
FACE_DATA_DIR = Path(__file__).parent / "face_data"
FACE_DATA_DIR.mkdir(exist_ok=True)

app = FastAPI(title="ChipIQ Face Auth API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Demo users matching frontend ──────────────────────────────────────────
DEMO_USERS = {
    "engineer@chipiq.io": {"role": "engineer", "name": "R. Sharma"},
    "lead@chipiq.io":     {"role": "lead",     "name": "J. Chen"},
    "manager@chipiq.io":  {"role": "manager",  "name": "S. Patel"},
    "admin@chipiq.io":    {"role": "admin",    "name": "A. Kumar"},
}

# ─── Helper: decode base64 image ───────────────────────────────────────────
def decode_base64_image(data_url: str) -> np.ndarray:
    """Convert base64 data URL to numpy BGR image."""
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    img_bytes = base64.b64decode(data_url)
    img_array = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    return img

def get_user_face_path(email: str) -> Path:
    safe_name = email.replace("@", "_at_").replace(".", "_")
    return FACE_DATA_DIR / f"{safe_name}.npy"

# ─── Models ────────────────────────────────────────────────────────────────
class EnrollRequest(BaseModel):
    email: str
    image_base64: str  # data URL from webcam

class VerifyRequest(BaseModel):
    image_base64: str  # data URL from webcam

# ─── Routes ────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ChipIQ Face Auth API running", "version": "1.0.0"}

@app.get("/api/enrolled")
def list_enrolled():
    """List all enrolled users."""
    enrolled = []
    for f in FACE_DATA_DIR.glob("*.npy"):
        email = f.stem.replace("_at_", "@").replace("_", ".")
        # Fix double-dot issue from multiple underscores
        enrolled.append(f.stem)
    return {"enrolled": [f.stem for f in FACE_DATA_DIR.glob("*.npy")]}

@app.post("/api/enroll")
async def enroll_face(request: EnrollRequest):
    """
    Enroll a user's face embedding.
    POST body: { email, image_base64 }
    """
    try:
        from deepface import DeepFace

        if request.email not in DEMO_USERS:
            raise HTTPException(status_code=400, detail="Unknown email address")

        img = decode_base64_image(request.image_base64)

        # Get face embedding using DeepFace (Facenet512 is fast + accurate)
        result = DeepFace.represent(
            img_path=img,
            model_name="Facenet512",
            enforce_detection=True,
            detector_backend="opencv"
        )

        if not result:
            raise HTTPException(status_code=400, detail="No face detected in image")

        embedding = np.array(result[0]["embedding"])
        face_path = get_user_face_path(request.email)
        np.save(str(face_path), embedding)

        user = DEMO_USERS[request.email]
        return {
            "success": True,
            "message": f"Face enrolled for {user['name']} ({user['role']})",
            "email": request.email,
            "role": user["role"]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Enrollment failed: {str(e)}")


@app.post("/api/verify")
async def verify_face(request: VerifyRequest):
    """
    Verify a face against all enrolled users.
    POST body: { image_base64 }
    Returns the matched user + role, or 401 if no match.
    """
    try:
        from deepface import DeepFace

        img = decode_base64_image(request.image_base64)

        # Get embedding for the captured face
        result = DeepFace.represent(
            img_path=img,
            model_name="Facenet512",
            enforce_detection=True,
            detector_backend="opencv"
        )

        if not result:
            raise HTTPException(status_code=400, detail="No face detected in image")

        query_embedding = np.array(result[0]["embedding"])

        # Compare against all enrolled faces
        enrolled_files = list(FACE_DATA_DIR.glob("*.npy"))
        if not enrolled_files:
            raise HTTPException(
                status_code=404,
                detail="No faces enrolled yet. Please enroll first."
            )

        best_match = None
        best_distance = float("inf")
        THRESHOLD = 0.40  # Facenet512 cosine threshold

        for face_file in enrolled_files:
            stored_embedding = np.load(str(face_file))

            # Cosine similarity → distance
            dot = np.dot(query_embedding, stored_embedding)
            norm_q = np.linalg.norm(query_embedding)
            norm_s = np.linalg.norm(stored_embedding)
            cosine_sim = dot / (norm_q * norm_s + 1e-10)
            distance = 1 - cosine_sim  # lower = more similar

            if distance < best_distance:
                best_distance = distance
                best_match = face_file.stem

        if best_distance > THRESHOLD or best_match is None:
            raise HTTPException(
                status_code=401,
                detail=f"Face not recognized (distance: {best_distance:.3f}). Please try again or use password login."
            )

        # Decode filename back to email
        email = best_match.replace("_at_", "@").replace("_", ".")

        # Search for exact email key match
        matched_email = None
        for known_email in DEMO_USERS:
            safe = known_email.replace("@", "_at_").replace(".", "_")
            if safe == best_match:
                matched_email = known_email
                break

        if not matched_email:
            raise HTTPException(status_code=401, detail="Face matched but user record not found")

        user = DEMO_USERS[matched_email]
        return {
            "success": True,
            "email": matched_email,
            "name": user["name"],
            "role": user["role"],
            "confidence": round((1 - best_distance) * 100, 1),
            "message": f"Welcome, {user['name']}!"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")


@app.delete("/api/enroll/{email}")
async def delete_enrollment(email: str):
    """Delete a user's face enrollment."""
    face_path = get_user_face_path(email)
    if not face_path.exists():
        raise HTTPException(status_code=404, detail="Enrollment not found")
    face_path.unlink()
    return {"success": True, "message": f"Enrollment deleted for {email}"}


@app.get("/api/health")
def health():
    enrolled_count = len(list(FACE_DATA_DIR.glob("*.npy")))
    return {
        "status": "healthy",
        "enrolled_users": enrolled_count,
        "face_data_dir": str(FACE_DATA_DIR)
    }
