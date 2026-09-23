#!/usr/bin/env python3
"""
detect_face_crop.py
Analyzes video clip frames to detect the primary speaker/face and compute
the optimal horizontal crop coordinate for vertical (9:16) or square (1:1) reframing.
"""

import argparse
import json
import os
import sys

def main():
    parser = argparse.ArgumentParser(description="Detect face center for smart video cropping")
    parser.add_argument("--video", required=True, help="Path to input video or proxy")
    parser.add_argument("--start", type=float, default=0.0, help="Clip start time in seconds")
    parser.add_argument("--end", type=float, default=0.0, help="Clip end time in seconds")
    parser.add_argument("--ratio", default="9:16", choices=["9:16", "1:1", "4:5", "16:9"], help="Target aspect ratio")
    parser.add_argument("--samples", type=int, default=15, help="Number of frames to sample")
    args = parser.parse_args()

    if not os.path.exists(args.video):
        print(json.dumps({"error": "Video file not found", "cropX": 0, "detected": False}))
        sys.exit(1)

    try:
        import cv2
        import numpy as np
    except ImportError:
        # Fall back gracefully to center crop if opencv is not available
        print(json.dumps({"cropX": 0, "normalizedX": 0.5, "detected": False, "note": "opencv not installed"}))
        return

    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    if not os.path.exists(cascade_path):
        print(json.dumps({"cropX": 0, "normalizedX": 0.5, "detected": False, "note": "cascade missing"}))
        return

    face_cascade = cv2.CascadeClassifier(cascade_path)
    cap = cv2.VideoCapture(args.video)

    if not cap.isOpened():
        print(json.dumps({"cropX": 0, "normalizedX": 0.5, "detected": False, "note": "cannot open video"}))
        return

    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_duration = total_frames / fps if fps > 0 else 0

    clip_start = max(0.0, args.start)
    clip_end = args.end if args.end > clip_start else video_duration
    duration = clip_end - clip_start

    # Determine target crop width inside source resolution
    ratios = {
        "9:16": 9.0 / 16.0,
        "1:1": 1.0,
        "4:5": 4.0 / 5.0,
        "16:9": 16.0 / 9.0,
    }
    target_aspect = ratios.get(args.ratio, 9.0 / 16.0)
    source_aspect = frame_width / max(1, frame_height)

    # If source is already narrower than or equal to target, horizontal crop is not needed
    if source_aspect <= target_aspect:
        cap.release()
        print(json.dumps({
            "cropX": 0,
            "cropY": 0,
            "cropW": frame_width,
            "cropH": frame_height,
            "normalizedX": 0.5,
            "detected": False,
            "note": "source already narrower than target ratio"
        }))
        return

    crop_w = int(round(frame_height * target_aspect))
    if crop_w % 2 != 0:
        crop_w -= 1
    crop_w = min(crop_w, frame_width)
    max_x = frame_width - crop_w
    default_x = int(round(max_x / 2.0))

    sample_count = max(3, min(args.samples, 30))
    sample_times = [
        clip_start + (i + 0.5) * (duration / sample_count)
        for i in range(sample_count)
    ]

    detected_centers_x = []

    for t in sample_times:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ret, frame = cap.read()
        if not ret or frame is None:
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        scale = 1.0
        if frame_width > 1280:
            scale = 1280.0 / frame_width
            small = cv2.resize(gray, (1280, int(frame_height * scale)))
        else:
            small = gray

        faces = face_cascade.detectMultiScale(
            small,
            scaleFactor=1.15,
            minNeighbors=4,
            minSize=(int(40 * scale), int(40 * scale))
        )

        if len(faces) > 0:
            largest = max(faces, key=lambda f: f[2] * f[3])
            fx, fy, fw, fh = largest
            center_x = (fx + fw / 2.0) / scale
            detected_centers_x.append(center_x / frame_width)

    cap.release()

    if detected_centers_x:
        median_norm_x = float(np.median(detected_centers_x))
        desired_center_pixel = median_norm_x * frame_width
        calculated_crop_x = int(round(desired_center_pixel - crop_w / 2.0))
        clamped_crop_x = max(0, min(max_x, calculated_crop_x))
        if clamped_crop_x % 2 != 0:
            clamped_crop_x -= 1
            if clamped_crop_x < 0:
                clamped_crop_x = 0

        print(json.dumps({
            "cropX": clamped_crop_x,
            "cropY": 0,
            "cropW": crop_w,
            "cropH": frame_height,
            "normalizedX": round(median_norm_x, 3),
            "detected": True,
            "samplesCount": len(detected_centers_x),
            "maxCropX": max_x,
            "defaultCropX": default_x
        }))
    else:
        if default_x % 2 != 0:
            default_x -= 1
        print(json.dumps({
            "cropX": default_x,
            "cropY": 0,
            "cropW": crop_w,
            "cropH": frame_height,
            "normalizedX": 0.5,
            "detected": False,
            "maxCropX": max_x,
            "defaultCropX": default_x
        }))

if __name__ == "__main__":
    main()
