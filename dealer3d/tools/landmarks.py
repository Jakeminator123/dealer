# Reads a film of the dealer frame by frame with MediaPipe and writes what it finds of her hands and her body: for each
# hand its 21 points in the bank's pixels and as a hand of real size in metres, for the body its 33 points likewise.
#   python -I dealer3d/tools/landmarks.py <film.mp4> <out.json>
# Run with the environment of tools/python (tools/python/README.md); the model files lie in tools/python/models, or
# where DEALER_MODELS points. Reads the film only. The numbers are MediaPipe's own, unsmoothed; laying them into the
# room under the table's lens is dealer3d/src/capture.ts.
import sys, json, os
import numpy as np, cv2
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

MODELS = os.environ.get('DEALER_MODELS') or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'tools', 'python', 'models')
BANK_W = 1764


def main():
    film, out = sys.argv[1], sys.argv[2]
    cap = cv2.VideoCapture(film)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    scale = BANK_W / w
    hands_opt = vision.HandLandmarkerOptions(base_options=BaseOptions(model_asset_path=os.path.join(MODELS, 'hand_landmarker.task')), running_mode=vision.RunningMode.VIDEO, num_hands=2,
                                             min_hand_detection_confidence=0.3, min_hand_presence_confidence=0.3, min_tracking_confidence=0.3)
    pose_opt = vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=os.path.join(MODELS, 'pose_landmarker_heavy.task')), running_mode=vision.RunningMode.VIDEO, num_poses=1)
    frames = []
    with vision.HandLandmarker.create_from_options(hands_opt) as hm, vision.PoseLandmarker.create_from_options(pose_opt) as pm:
        index = 0
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)))
            stamp = int(index * 1000 / fps)
            hr, pr = hm.detect_for_video(image, stamp), pm.detect_for_video(image, stamp)
            px = lambda q: [round(q.x * w * scale, 2), round(q.y * h * scale, 2), round(q.z * w * scale, 2)]   # depth in the same pixels, from the wrist (hand) or the hips (body)
            metres = lambda q: [round(q.x, 5), round(q.y, 5), round(q.z, 5)]
            pose = None
            if pr.pose_landmarks:
                pose = {'image': [px(q) + [round(q.visibility, 3)] for q in pr.pose_landmarks[0]], 'world': [metres(q) for q in pr.pose_world_landmarks[0]]}
            hands = {}
            for n, pts in enumerate(hr.hand_landmarks):
                wrist = np.array([pts[0].x * w * scale, pts[0].y * h * scale])
                if pose:   # her left hand is the one at her left wrist; MediaPipe's own left and right is not used
                    side = 'L' if np.linalg.norm(wrist - np.array(pose['image'][15][:2])) <= np.linalg.norm(wrist - np.array(pose['image'][16][:2])) else 'R'
                else:
                    side = 'L' if wrist[0] > BANK_W / 2 else 'R'
                if side in hands:
                    side = 'R' if side == 'L' else 'L'
                hands[side] = {'image': [px(q) for q in pts], 'world': [metres(q) for q in hr.hand_world_landmarks[n]], 'score': round(hr.handedness[n][0].score, 3), 'said': hr.handedness[n][0].category_name}
            frames.append({'i': index, 'hands': hands, 'pose': pose})
            index += 1
    cap.release()
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'film': os.path.basename(os.path.dirname(os.path.abspath(film))), 'width': BANK_W, 'height': round(h * scale), 'fps': round(fps, 3), 'frameCount': len(frames),
                   'about': 'MediaPipe hand_landmarker and pose_landmarker_heavy, video mode. image: bank pixels x, y and a relative depth; world: metres about the hand\'s or the hips\' middle, x right, y down, z away from the camera.',
                   'frames': frames}, f, separators=(',', ':'))
    found = sum(1 for fr in frames if 'L' in fr['hands'])
    print(f'{len(frames)} frames, her left hand found in {found}, her right in {sum(1 for fr in frames if "R" in fr["hands"])}, body in {sum(1 for fr in frames if fr["pose"])}')


main()
