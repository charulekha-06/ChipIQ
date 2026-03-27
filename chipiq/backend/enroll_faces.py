"""
ChipIQ Face Enrollment Script
Run this ONCE to register each user's face via webcam.

Usage:
    python enroll_faces.py

It will open the camera for each demo user and capture their face.
"""

import cv2
import base64
import requests
import sys

API_BASE = "http://localhost:8000"

USERS = [
    ("engineer@chipiq.io", "R. Sharma — Verification Engineer"),
    ("lead@chipiq.io",     "J. Chen — Project Lead"),
    ("manager@chipiq.io",  "S. Patel — Manager"),
    ("admin@chipiq.io",    "A. Kumar — Admin"),
]

def capture_face_from_webcam(user_label: str) -> str | None:
    """Open webcam, show preview, capture on SPACE, return base64."""
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("❌ Cannot open webcam!")
        return None

    print(f"\n📷 Enrolling: {user_label}")
    print("   → Press SPACE to capture | ESC to skip")

    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )

    captured_b64 = None
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        display = frame.copy()
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.3, 5)

        for (x, y, w, h) in faces:
            cv2.rectangle(display, (x, y), (x+w, y+h), (0, 255, 0), 2)

        label = f"Enrolling: {user_label}"
        cv2.putText(display, label, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 255), 2)
        cv2.putText(display, "SPACE=Capture | ESC=Skip", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        if len(faces) > 0:
            cv2.putText(display, "✓ Face detected", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        cv2.imshow("ChipIQ Face Enrollment", display)

        key = cv2.waitKey(1) & 0xFF
        if key == 27:  # ESC
            print(f"   ⏭ Skipped {user_label}")
            break
        elif key == 32:  # SPACE
            if len(faces) == 0:
                print("   ⚠ No face detected — try again")
                continue
            # Encode to base64
            _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
            b64 = base64.b64encode(buffer.tobytes()).decode("utf-8")
            captured_b64 = f"data:image/jpeg;base64,{b64}"
            print(f"   ✅ Face captured!")
            break

    cap.release()
    cv2.destroyAllWindows()
    return captured_b64


def enroll_user(email: str, label: str):
    image_b64 = capture_face_from_webcam(label)
    if not image_b64:
        return

    print(f"   📤 Sending to API...")
    try:
        resp = requests.post(
            f"{API_BASE}/api/enroll",
            json={"email": email, "image_base64": image_b64},
            timeout=60
        )
        data = resp.json()
        if resp.status_code == 200 and data.get("success"):
            print(f"   ✅ Enrolled: {data['message']}")
        else:
            print(f"   ❌ Failed: {data.get('detail', data)}")
    except Exception as e:
        print(f"   ❌ Error: {e}")


def main():
    print("=" * 50)
    print("  ChipIQ Face Enrollment Tool")
    print("=" * 50)

    # Check API is running
    try:
        resp = requests.get(f"{API_BASE}/api/health", timeout=5)
        health = resp.json()
        print(f"\n✅ API connected | Currently enrolled: {health['enrolled_users']} users\n")
    except Exception:
        print("\n❌ Cannot connect to API at http://localhost:8000")
        print("   Make sure the backend is running: uvicorn main:app --reload")
        sys.exit(1)

    print("Which users do you want to enroll?")
    print("  [1] All users (one by one)")
    print("  [2] Pick specific user")
    choice = input("\nChoice: ").strip()

    if choice == "1":
        for email, label in USERS:
            enroll_user(email, label)
    elif choice == "2":
        print("\nUsers:")
        for i, (email, label) in enumerate(USERS):
            print(f"  [{i+1}] {email} — {label}")
        idx = int(input("Pick number: ").strip()) - 1
        if 0 <= idx < len(USERS):
            enroll_user(*USERS[idx])
    else:
        print("Invalid choice")

    print("\n✅ Enrollment complete! Start the ChipIQ app and use Face Login.")


if __name__ == "__main__":
    main()
