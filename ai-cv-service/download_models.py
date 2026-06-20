import os
import urllib.request

MODELS = {
    "yolo11n.pt": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt",
    "face_landmarker.task": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    "pose_landmarker_lite.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
}

MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")


def download_models():
    os.makedirs(MODELS_DIR, exist_ok=True)
    for filename, url in MODELS.items():
        filepath = os.path.join(MODELS_DIR, filename)
        if os.path.exists(filepath):
            print(f"{filename} already exists, skipping download.")
            continue
        print(f"Downloading {filename} from {url}...")
        try:
            # Simple downloader
            urllib.request.urlretrieve(url, filepath)
            print(f"Successfully downloaded {filename}.")
        except Exception as e:
            print(f"Error downloading {filename}: {e}")
            raise e


if __name__ == "__main__":
    download_models()
