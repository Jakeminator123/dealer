"""Ansiktets landmärken, ruta och mask för köraren.

Landmärkena tas med MediaPipe Face Landmarker (Apache-2.0) i stället för MuseTalks DWPose/mmpose. Rutan räknas med
MuseTalks öppna logik ur `musetalk/utils/preprocessing.py::get_landmark_and_bbox` (MIT, Tencent Music Entertainment
Group 2024): punkt 29 i 68-punktsschemat är mitten, hakans underkant är nederkanten, överkanten ligger lika långt över
mitten som nederkanten under den, och `bbox_shift` flyttar mitten (och därmed överkanten med det dubbla).

Masken: MuseTalks `jaw`-läge byggde ytan ur ansiktssegmenteringen BiSeNet (79999_iter.pth). De vikterna används inte
här (se LICENSER.md); i stället ritas en etikettkarta i samma schema (1 hud, 10 näsa, 11 munhåla, 12/13 läppar) ur
MediaPipes polygoner, och MuseTalks egen efterbehandling för `jaw` (kärnorna och stegen nedan, kopierade ur
`musetalk/utils/face_parsing/__init__.py`, MIT) körs på den.
"""
import cv2
import numpy as np
from PIL import Image

# MediaPipe Face Mesh: ansiktets kontur i ordning (FACEMESH_FACE_OVAL), läpparnas yttre och inre kontur, näsans punkter.
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176,
             149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
NOSE = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 97, 326, 327, 64, 294, 48, 278, 49, 279, 102, 331, 129, 358, 219,
        439, 115, 344, 220, 440, 45, 275, 44, 274, 240, 460, 60, 290, 75, 305, 59, 289, 166, 392, 79, 309, 218, 438,
        237, 457, 241, 461, 242, 462, 250, 20, 99, 328]
# 68-punktsschemats käklinje (0–16), som MuseTalk tar rutans sidor och nederkant ur.
JAW17 = [127, 234, 93, 132, 58, 172, 136, 150, 152, 379, 365, 397, 288, 361, 323, 454, 356]
NASION, NOSE_TIP = 168, 1  # 68-punkternas 27 (näsroten) och 30 (nästippen); 28 och 29 ligger på tredjedelarna mellan.


class Landmarker:
    def __init__(self, model_path):
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision
        self.mp = mp
        opts = vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=model_path),
                                            running_mode=vision.RunningMode.IMAGE, num_faces=1,
                                            min_face_detection_confidence=0.3, min_face_presence_confidence=0.3)
        self.det = vision.FaceLandmarker.create_from_options(opts)

    def __call__(self, bgr, window=None):
        """478 punkter i bildpunkter (x, y). window = (x0, y0, x1, y1): sök i ett utsnitt (snabbare och skarpare)."""
        x0, y0 = 0, 0
        img = bgr
        if window is not None:
            x0, y0, x1, y1 = [int(v) for v in window]
            x0, y0 = max(0, x0), max(0, y0)
            img = bgr[y0:min(y1, bgr.shape[0]), x0:min(x1, bgr.shape[1])]
        rgb = np.ascontiguousarray(img[:, :, ::-1])
        res = self.det.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=rgb))
        if not res.face_landmarks:
            return None
        h, w = img.shape[:2]
        return np.array([[p.x * w + x0, p.y * h + y0] for p in res.face_landmarks[0]], dtype=np.float64)


def landmarks68_subset(lm):
    """De punkter i 68-schemat som MuseTalks ruta använder: käklinjen 0–16 och näsryggen 27–30 (index i en 68-array)."""
    out = np.full((68, 2), np.nan)
    out[0:17] = lm[JAW17]
    a, b = lm[NASION], lm[NOSE_TIP]
    out[27], out[28], out[29], out[30] = a, a + (b - a) / 3, a + 2 * (b - a) / 3, b
    return out


def bbox_from_68(f68, bbox_shift=0, extra_margin=10, height=None):
    """MuseTalks ruta (get_landmark_and_bbox + v1.5:s extra_margin), på heltalsavrundade punkter som där."""
    pts = f68[~np.isnan(f68[:, 0])].astype(np.int32)
    half = f68[29].astype(np.int32).copy()
    half[1] = half[1] + bbox_shift
    half_face_dist = np.max(pts[:, 1]) - half[1]
    upper = max(0, half[1] - half_face_dist)
    x1, y1, x2, y2 = int(np.min(pts[:, 0])), int(upper), int(np.max(pts[:, 0])), int(np.max(pts[:, 1]))
    y2 = y2 + extra_margin
    if height is not None:
        y2 = min(y2, height)
    return [x1, y1, x2, y2]


class JawParsing:
    """Ersätter musetalk.utils.face_parsing.FaceParsing i get_image_prepare_material: samma anrop (bild, mode) och samma
    efterbehandling för 'jaw', men etikettkartan ritas ur landmärken. set_frame() talar om vilka landmärken och vilken
    utsnittsruta nästa anrop gäller."""

    def __init__(self, left_cheek_width=90, right_cheek_width=90):
        # --- ur MuseTalk FaceParsing.__init__ (MIT) ---
        cone_height = 21
        tail_height = 12
        total_size = cone_height + tail_height
        kernel = np.zeros((total_size, total_size), dtype=np.uint8)
        center_x = total_size // 2
        for row in range(cone_height):
            if row < cone_height // 2:
                continue
            width = int(2 * (row - cone_height // 2) + 1)
            start = int(center_x - (width // 2))
            end = int(center_x + (width // 2) + 1)
            kernel[row, start:end] = 1
        base_width = int(kernel[cone_height - 1].sum()) if cone_height > 0 else 1
        for row in range(cone_height, total_size):
            start = max(0, int(center_x - (base_width // 2)))
            end = min(total_size, int(center_x + (base_width // 2) + 1))
            kernel[row, start:end] = 1
        self.kernel = kernel
        self.cheek_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (35, 3))
        mask = np.zeros((512, 512), dtype=np.uint8)
        center = 512 // 2
        cv2.rectangle(mask, (0, 0), (center - left_cheek_width, 512), 255, -1)
        cv2.rectangle(mask, (center + right_cheek_width, 0), (512, 512), 255, -1)
        self.cheek_mask = mask
        # --- slut på det kopierade ---
        self.lm = None
        self.crop_box = None

    def set_frame(self, lm478, crop_box):
        self.lm, self.crop_box = lm478, crop_box

    def labels(self, size=(512, 512)):
        """Etikettkarta i BiSeNets schema för utsnittet crop_box, i storleken size (bredd, höjd)."""
        x_s, y_s, x_e, y_e = self.crop_box
        sx, sy = size[0] / (x_e - x_s), size[1] / (y_e - y_s)
        p = (self.lm - [x_s, y_s]) * [sx, sy]
        poly = lambda idx: np.round(p[idx]).astype(np.int32)
        lab = np.zeros((size[1], size[0]), dtype=np.uint8)
        cv2.fillPoly(lab, [poly(FACE_OVAL)], 1)
        cv2.fillConvexPoly(lab, cv2.convexHull(poly(NOSE)), 10)
        cv2.fillPoly(lab, [poly(LIPS_OUTER)], 12)
        cv2.fillPoly(lab, [poly(LIPS_INNER)], 11)
        return lab

    def __call__(self, image, size=(512, 512), mode="jaw"):
        assert mode == "jaw", "köraren har bara jaw-läget"
        parsing = self.labels(size).astype(np.int64)
        # --- ur MuseTalk FaceParsing.__call__, mode == "jaw" (MIT) ---
        face_region = np.isin(parsing, [1]) * 255
        face_region = face_region.astype(np.uint8)
        original_dilated = cv2.dilate(face_region, self.kernel, iterations=1)
        eroded = cv2.erode(original_dilated, self.cheek_kernel, iterations=2)
        face_region = cv2.bitwise_and(eroded, self.cheek_mask)
        face_region = cv2.bitwise_or(face_region, cv2.bitwise_and(original_dilated, ~self.cheek_mask))
        parsing[(face_region == 255) & (~np.isin(parsing, [10]))] = 255
        parsing[np.isin(parsing, [11, 12, 13])] = 255
        parsing[np.where(parsing != 255)] = 0
        # --- slut på det kopierade ---
        return Image.fromarray(parsing.astype(np.uint8))


def smooth_track(arr, sigma):
    """Gaussisk utjämning längs rutorna (axel 0) med speglade kanter; sigma i rutor, 0 = av."""
    if sigma <= 0 or len(arr) < 3:
        return arr
    r = int(np.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    pad = np.concatenate([arr[r:0:-1], arr, arr[-2:-r - 2:-1]], axis=0)
    out = np.zeros_like(arr)
    for i, w in enumerate(k):
        out += w * pad[i:i + len(arr)]
    return out
