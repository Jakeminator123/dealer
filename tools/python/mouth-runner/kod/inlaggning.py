"""Inläggningen: modellens ritade mun läggs in i klippets egen ruta, så som Jakob valde den 2026-11-17 (storlek F, bara
läpparna). Egen kod, en omskrivning till numpy av talbanans `layMouth`/`layBack` (dealer-repots `src/speech-plan.ts` och
`tools/speech.ts`, klonens gren tal21) för den väg receptet F går:

  1. hela modellens mun med gipor (inget av hennes egen överläpp eller hennes gipor hålls kvar: `under` och `corners` av),
  2. förstorad kring hennes läppars mitt: `wide` i bredd, `tall` under mitten och `tallUp` över den, med full styrka inom
     ellipsen `grow` (uppåt bara `growUp` bildpunkter, så att näsan lämnas i fred),
  3. läpparnas färg flyttad till hennes egen (`colour`, skiftet ges utifrån) och bilden skärpt (`sharpen`),
  4. inlagd genom ellipsen `reach` och bara där det finns läppar eller munöppning (`lipsOnly`: modellens läppar som de
     läggs, det mellan dem och hennes egna läppar, vidgat och tonat; med ett tredje tal fortsätter modellens bild mjukt
     ned över hakan),
  4b. med `opening` görs öppningen mellan läpparna mindre för vanligt tal (Jakob 2026-11-17 om provet med F: "ska hon
     förmodligen ha en lite mindre öppen mun … hon ska visa mindre tänder … max kunna gå upp så här"): läpparna förs mot
     varandra över tänderna, hela och lika stora som förut; tänderna står kvar. `opening` är [andel, full, potens,
     överläppens del]: en liten öppning behåller `andel` av sin höjd, en öppning på `full` bildpunkter (som den läggs)
     eller mer behåller hela, och däremellan stiger andelen med (öppning/full) upphöjt till `potens` (2 om den inte
     ges); överläppen tar `överläppens del` av minskningen (0,4 om den inte ges) och underläppen resten,
  5. bara medan hon hörs (grinden: en ruta av båda munnarna vid varje byte, lagd där de två munnarna skiljer sig minst).

Allt räknas på klippets egna värden (yuv 4:2:0) i ett fönster kring munnen: Y i full storlek, U och V i halv.
Avrundning och gränser följer förlagan (JavaScripts Math.round, medianen som det övre mittvärdet).
"""
import math

import cv2
import numpy as np

GATE = {"floorDb": -30, "before": 2, "after": 3, "pause": 6, "own": 4, "both": 0.5}
SAMPLES_PER_FRAME = 1000  # 24 000 Hz, 24 rutor per sekund


def jsround(v):
    return np.floor(np.asarray(v, np.float64) + 0.5)


def iround(v):
    return int(math.floor(v + 0.5))


def eased(r, whole):
    r = np.asarray(r, np.float64)
    return np.where(r <= whole, 1.0, np.where(r >= 1, 0.0, 0.5 + 0.5 * np.cos(np.pi * (r - whole) / (1 - whole))))


def lip_map(V):
    """Hur mycket varje bildpunkt i färgplanet V är läpp, 0–1: hur mycket rödare än huden runt om (fönstrets median)."""
    flat = np.asarray(V, np.float64).ravel()
    k = flat.size >> 1
    skin = np.partition(flat, k)[k]
    return np.clip((np.asarray(V, np.float64) - skin - 8) / 6, 0, 1)


def lips_middle(lip, w, h, guess=None):
    """Läpparnas mitt i fönstret (dess bildpunkter i full storlek): läppunkternas mitt, snävad två gånger. None utan läppar."""
    ys, xs = np.nonzero(lip > 0.5)
    x, y = 2 * xs + 1, 2 * ys + 1
    c, found = guess or (w / 2, h * 0.45), False
    for rx, ry in ((w, h), (60, 34), (48, 26)):
        m = (np.abs(x - c[0]) <= rx) & (np.abs(y - c[1]) <= ry)
        if int(m.sum()) < 12:
            break
        c, found = (float(x[m].mean()), float(y[m].mean())), True
    return c if found else None


def lip_tone(Y, U, V, lip, middle):
    """Summan av läppunkternas färg nära läpparnas mitt, och hur många de är: (y, u, v, n)."""
    hh, hw = lip.shape
    cy, cx = np.mgrid[0:hh, 0:hw]
    m = (lip > 0.5) & (np.abs(2 * cx + 1 - middle[0]) <= 48) & (np.abs(2 * cy + 1 - middle[1]) <= 26)
    return np.array([Y[::2, ::2][m].sum(), U[m].sum(), V[m].sum(), m.sum()], np.float64)


def heard_frames(track, frames, gate=GATE):
    """Vilka rutor hon hörs i: starkare än grindens golv räknat från filmens starkaste ruta. track: int16, 24 kHz, mono."""
    db = []
    for k in range(frames):
        seg = track[k * SAMPLES_PER_FRAME:(k + 1) * SAMPLES_PER_FRAME].astype(np.float64) / 32768
        db.append(10 * math.log10(float(np.mean(seg * seg)) + 1e-12) if seg.size else -120.0)
    peak = max(db)
    return [peak > -90 and d > peak + gate["floorDb"] for d in db]


def speech_gate(heard, gate=GATE, apart=None):
    """Hur mycket av den ritade munnen varje ruta får: 1 från strax före att hon hörs till strax efter, 0 annars, och en
    ruta av båda (`both`) vid varje byte, lagd på den tysta ruta inom grindens räckvidd där munnarna skiljer sig minst."""
    n = len(heard)
    weights = [0.0] * n

    def least(a, b, near):
        best = -1
        for k in range(max(0, a), min(b, n - 1) + 1):
            if heard[k]:
                continue
            d = (apart[k] - (math.inf if best < 0 else apart[best])) if apart is not None else 0
            if best < 0 or d < -1e-9 or (abs(d) <= 1e-9 and abs(k - near) < abs(best - near)):
                best = k
        return best

    st = []
    for k in range(n):
        if not heard[k]:
            continue
        now = st[-1] if st else None
        if now and k - now["last"] - 1 < gate["pause"]:
            now["last"] = k
            continue
        if now:
            go = least(now["last"] + 1, min(now["last"] + gate["after"], k - gate["own"] - 2), now["last"] + 1)
            come = -1 if go < 0 else least(max(go + gate["own"] + 1, k - gate["before"]), k - 1, k - 1)
            if come < 0:
                now["last"] = k
                continue
            now["go"] = go
            st.append({"first": k, "last": k, "come": come, "go": -1})
        else:
            st.append({"first": k, "last": k, "come": least(k - gate["before"], k - 1, k - 1), "go": -1})
    if st:
        st[-1]["go"] = least(st[-1]["last"] + 1, st[-1]["last"] + gate["after"], st[-1]["last"] + 1)
    for s in st:
        for k in range(s["first"] if s["come"] < 0 else s["come"] + 1, (s["last"] if s["go"] < 0 else s["go"] - 1) + 1):
            weights[k] = 1.0
        if s["come"] >= 0:
            weights[s["come"]] = gate["both"]
        if s["go"] >= 0:
            weights[s["go"]] = gate["both"]
    return weights


def bilinear(a, x, y):
    h, w = a.shape
    xf, yf = np.clip(x, 0, w - 1.001), np.clip(y, 0, h - 1.001)
    xi, yi = xf.astype(np.int64), yf.astype(np.int64)
    tx, ty = xf - xi, yf - yi
    return (a[yi, xi] * (1 - tx) + a[yi, xi + 1] * tx) * (1 - ty) + (a[yi + 1, xi] * (1 - tx) + a[yi + 1, xi + 1] * tx) * ty


def _box(src, r, biggest):
    """Förlagans `pass`: största värdet eller medelvärdet över en ruta med halva sidan r, bara över det som finns."""
    k = (2 * r + 1, 2 * r + 1)
    if biggest:
        return cv2.dilate(src, np.ones(k, np.uint8))
    s = cv2.boxFilter(src, -1, k, normalize=False, borderType=cv2.BORDER_CONSTANT)
    return s / cv2.boxFilter(np.ones_like(src), -1, k, normalize=False, borderType=cv2.BORDER_CONSTANT)


_SHARP = np.array([[1, 2, 1], [2, 4, 2], [1, 2, 1]], np.float64) / 16
_grids = {}


def _grid(w, h):
    if (w, h) not in _grids:
        y, x = np.mgrid[0:h, 0:w].astype(np.float64)
        cy, cx = np.mgrid[0:h // 2, 0:w // 2].astype(np.float64)
        _grids[(w, h)] = (x, y, 2 * cx + 0.5, 2 * cy + 0.5)
    return _grids[(w, h)]


def check_recipe(lips):
    """Den här omskrivningen täcker bara vägen utan hennes egen överläpp och utan gipornas slut (receptet F)."""
    if lips.get("under") is not None or lips.get("corners") is not None or lips.get("sink") is not None or lips.get("drop"):
        raise ValueError("Inläggningen här tar bara recept med under och corners av (hela modellens mun), utan sink och drop.")
    for key in ("wide", "tall", "colour", "sharpen", "grow", "reach"):
        if key not in lips:
            raise ValueError(f"Receptet saknar {key}.")


def _smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


# Mått i bildpunkter för det som flyttas hela och det som dras ut när läpparna förs mot varandra: överläppen och huden
# över den, underläppen och hakan under den (Paows mått i bankens filmer, som de läggs med F).
_LIP_UP, _SKIN_UP, _LIP_DOWN, _SKIN_DOWN = 16, 12, 24, 30


def _calm(Y, U, V, mx, my, opening, seen=None):
    """Öppningen mellan de lagda läpparna görs mindre (receptets `opening`): bilden ovanför öppningen flyttas ned och den
    under flyttas upp, kolumn för kolumn, så att läpparna täcker mer av tänderna. Ger (Y, U, V)."""
    share, full = float(opening[0]), float(opening[1])
    power = float(opening[2]) if len(opening) > 2 else 2.0
    upper = float(opening[3]) if len(opening) > 3 else 0.4
    hh, hw = V.shape
    h, w = Y.shape
    lip = lip_map(V) > 0.5
    cxm, cym = mx / 2, my / 2
    x0, x1 = max(0, iround(cxm - 34)), min(hw - 1, iround(cxm + 34))
    y0, y1 = max(0, iround(cym - 24)), min(hh - 1, iround(cym + 26))
    if x1 - x0 < 4 or y1 - y0 < 4:
        return Y, U, V
    d = lip[y0:y1 + 1, x0:x1 + 1]
    R, C = d.shape
    rows = np.arange(R)[:, None]
    top, bottom = np.argmax(d, 0), R - 1 - np.argmax(d[::-1], 0)
    between = d.any(0)[None, :] & (rows >= top[None, :]) & (rows <= bottom[None, :]) & ~d
    # Öppningen i en kolumn: det första sammanhängande stycket som inte är läpp under överläppen (tänder, munnens mörker).
    a = np.argmax(between, 0)
    run = np.cumsum(~between & (rows >= a[None, :]), 0) == 0
    size = (between & run & (rows >= a[None, :])).sum(0)
    size[size < 2] = 0  # en ensam rad är brus i läppkartan, ingen öppning
    cols = np.arange(C)
    near = np.abs(x0 + cols - cxm) <= 8
    gap_mid = 2.0 * float(np.median(size[near])) if near.any() else 0.0
    ratio = share + (1 - share) * min(1.0, gap_mid / full) ** power
    if seen is not None:
        seen.update({"gap": gap_mid, "ratio": round(ratio, 3)})
    ok = size > 0
    if gap_mid <= 0 or ratio >= 0.999 or int(ok.sum()) < 3:
        return Y, U, V
    box = np.ones(5) / 5
    pad = lambda v: np.convolve(np.pad(v, 2, mode="edge"), box, "valid")  # noqa: E731
    edge_a = pad(np.interp(cols, cols[ok], (y0 + a)[ok].astype(np.float64)))
    gap = pad(size.astype(np.float64))
    # Till fönstrets alla kolumner, i lumans bildpunkter: öppningens överkant, dess höjd, och hur långt läpparna flyttas.
    lx = np.arange(w, dtype=np.float64)
    at = lambda v, fill: np.interp(lx, 2 * (x0 + cols) + 0.5, v, left=fill, right=fill)  # noqa: E731
    A, G = at(2 * edge_a, 2 * float(edge_a.mean())), at(2 * gap, 0.0)
    B, r = A + G, G * (1 - ratio)
    du, dl = (upper * r)[None, :], ((1 - upper) * r)[None, :]
    A, B = A[None, :], B[None, :]
    ramp = np.clip((B - dl - A - du) / 2, 1, 5)

    def rows_from(y):
        up = y < A + du
        down = y >= B - dl
        s_up = _smooth((y - (A + du - _LIP_UP - _SKIN_UP)) / _SKIN_UP)
        s_down = _smooth(((B - dl + _LIP_DOWN + _SKIN_DOWN) - y) / _SKIN_DOWN)
        # I öppningen står mitten kvar; närmast läpparna trycks tänderna ihop över en kort sträcka (ramp), så att bilden
        # hänger ihop med de flyttade läpparna också där läppkanten inte ligger precis där den mättes.
        top = -du * (1 - _smooth((y - (A + du)) / ramp))
        low = dl * (1 - _smooth(((B - dl) - y) / ramp))
        return np.where(up, y - du * s_up, np.where(down, y + dl * s_down, y + top + low))

    x, y, _, _ = _grid(w, h)
    Y2 = bilinear(Y, x, rows_from(y))
    # Färgplanen i halv storlek: samma flytt, räknad i lumans bildpunkter vid varje färgpunkts mitt.
    A, B, du, dl, ramp = A[:, ::2], B[:, ::2], du[:, ::2], dl[:, ::2], ramp[:, ::2]
    cy, cx = np.mgrid[0:hh, 0:hw].astype(np.float64)
    src = (rows_from(2 * cy + 0.5) - 0.5) / 2
    return Y2, bilinear(U, cx, src), bilinear(V, cx, src)


def lay_mouth(own, drawn, middle, shift, lips, own_lip=None, seen=None):
    """Lägger den ritade munnen i fönstret. own, drawn: (Y, U, V) som flyttal, Y h × w och U, V i halv storlek; middle:
    hennes läppars mitt i fönstret (x, y); shift: hur läpparnas färg flyttas (y, u, v). Ger fönstrets (Y, U, V) som uint8."""
    oy, ou, ov = (np.asarray(p, np.float64) for p in own)
    dy, du, dv = (np.asarray(p, np.float64) for p in drawn)
    h, w = oy.shape
    hh, hw = h // 2, w // 2
    mx, my = middle
    gx, gy = lips["grow"]
    rx, ry = lips["reach"]
    x, y, cx, cy = _grid(w, h)

    def source(px, py):
        up = py < my
        t = eased(np.hypot((px - mx) / gx, (py - my) / np.where(up, lips.get("growUp", gy), gy)) / 1.8, 1 / 1.8)
        tall = np.where(up, lips.get("tallUp", lips["tall"]), lips["tall"])
        return mx + (px - mx) / (1 + (lips["wide"] - 1) * t), my + (py - my) / (1 + (tall - 1) * t)

    sx, sy = source(x, y)
    Y = bilinear(dy, sx, sy)
    sx, sy = source(cx, cy)
    U, V = bilinear(du, (sx - 0.5) / 2, (sy - 0.5) / 2), bilinear(dv, (sx - 0.5) / 2, (sy - 0.5) / 2)
    if lips["colour"] > 0:
        lip = lip_map(V)
        U = U + lips["colour"] * shift[1] * lip
        V = V + lips["colour"] * shift[2] * lip
        Y = Y + lips["colour"] * shift[0] * np.repeat(np.repeat(lip, 2, 0), 2, 1)
    if lips["sharpen"] > 0:
        blur = cv2.filter2D(Y, -1, _SHARP, borderType=cv2.BORDER_REPLICATE)
        sharp = Y + lips["sharpen"] * (Y - blur)
        Y = Y.copy()
        Y[1:-1, 1:-1] = sharp[1:-1, 1:-1]
    if lips.get("opening"):
        Y, U, V = _calm(Y, U, V, mx, my, lips["opening"], seen)
    tight = None
    if lips.get("lipsOnly"):
        widen, ease, chin = (list(lips["lipsOnly"]) + [0])[:3]
        drawn_lip = lip_map(V) > 0.5
        if own_lip is None:
            own_lip = lip_map(ov)
        on = np.zeros((hh, hw), np.float64)
        soft = np.zeros((hh, hw), np.float64)
        cxm, cym = mx / 2, my / 2
        x0, x1 = max(0, iround(cxm - 34)), min(hw - 1, iround(cxm + 34))
        y0, y1 = max(0, iround(cym - 24)), min(hh - 1, iround(cym + 26))
        if x1 >= x0 and y1 >= y0:
            d = drawn_lip[y0:y1 + 1, x0:x1 + 1]
            rows = np.arange(d.shape[0])[:, None]
            has = d.any(0)
            top = np.argmax(d, 0)
            bottom = d.shape[0] - 1 - np.argmax(d[::-1], 0)
            fill = has[None, :] & (rows >= top[None, :]) & (rows <= bottom[None, :])
            on[y0:y1 + 1, x0:x1 + 1] = ((own_lip[y0:y1 + 1, x0:x1 + 1] > 0.5) | fill).astype(np.float64)
            if chin > 0:
                for i in np.nonzero(has)[0]:
                    col, low = x0 + int(i), y0 + int(bottom[i])
                    across = max(0.0, 1 - abs(col - cxm) / 30)
                    k = 1
                    while k <= chin / 2 and low + k < hh:
                        t = 1 - k / (chin / 2)
                        soft[low + k, col] = across * t * t * (3 - 2 * t)
                        k += 1
        rw, re = max(1, iround((widen + ease) / 2)), max(1, iround(ease / 2))
        tight = _box(_box(_box(on, rw, True), re, False), re, False)
        if chin > 0:
            tight = np.maximum(tight, _box(soft, 2, False))
    my_mask = eased(np.hypot((x - mx) / rx, (y - my - 4) / ry), 0.7)
    mc_mask = eased(np.hypot((cx - mx) / rx, (cy - my - 4) / ry), 0.7)
    if tight is not None:
        my_mask = my_mask * np.repeat(np.repeat(tight, 2, 0), 2, 1)
        mc_mask = mc_mask * tight

    def blend(o, v, m):
        return np.where(m > 0, np.clip(np.floor(o + (v - o) * m + 0.5), 0, 255), o).astype(np.uint8)

    return blend(oy, Y, my_mask), blend(ou, U, mc_mask), blend(ov, V, mc_mask)


def mix(laid, own, weight):
    """En ruta av båda munnarna: där inläggningen ändrat något behålls så här mycket (0–1) av det, resten är klippets eget."""
    out = []
    for a, b in zip(laid, own):
        a16, b16 = a.astype(np.float64), np.asarray(b, np.float64)
        out.append(np.where(a16 != b16, np.floor(b16 + (a16 - b16) * weight + 0.5), a16).astype(np.uint8))
    return tuple(out)


def cut(planes, win):
    """Fönstret (x, y, w, h; jämna tal) ur en hel rutas plan (Y, U, V) som flyttal."""
    x, y, w, h = win
    Y, U, V = planes
    return (Y[y:y + h, x:x + w].astype(np.float64), U[y // 2:(y + h) // 2, x // 2:(x + w) // 2].astype(np.float64),
            V[y // 2:(y + h) // 2, x // 2:(x + w) // 2].astype(np.float64))


def put(planes, win, laid):
    """En kopia av rutans plan med fönstret bytt mot det inlagda."""
    x, y, w, h = win
    Y, U, V = (p.copy() for p in planes)
    Y[y:y + h, x:x + w] = laid[0]
    U[y // 2:(y + h) // 2, x // 2:(x + w) // 2] = laid[1]
    V[y // 2:(y + h) // 2, x // 2:(x + w) // 2] = laid[2]
    return Y, U, V


def inner(win):
    """Den yta inne i fönstret där de två munnarna jämförs (förlagans `changed`): fönstret utan dess marginaler."""
    x, y, w, h = win
    return x + 28, y + 24, w - 56, h - 20


def window_from_inner(changed):
    """Förlagans `mouthWindow` utan bryggans gränser: fönstret kring en yta (x, y, w, h)."""
    cx, cy, cw, ch = changed
    x, y = (cx - 28) & ~1, max(0, (cy - 24) & ~1)
    return x, y, (cx + cw + 28 - x) & ~1, (cy + ch - 4 - y) & ~1


def window_from_lips(points, width, height):
    """Fönstret för ett klipp ur läpparnas landmärken (rutor × punkter × 2): så stort att läpparnas mitt i varje ruta har
    80 bildpunkter åt sidorna, 56 över sig och 68 under sig. Jämna tal, inom rutan."""
    lo, hi = points.min(axis=1), points.max(axis=1)
    cx, cy = (lo[:, 0] + hi[:, 0]) / 2, (lo[:, 1] + hi[:, 1]) / 2
    x0 = max(0, int(math.floor((cx.min() - 80) / 2)) * 2)
    y0 = max(0, int(math.floor((cy.min() - 56) / 2)) * 2)
    x1 = min(width, int(math.ceil((cx.max() + 80) / 2)) * 2)
    y1 = min(height, int(math.ceil((cy.max() + 68) / 2)) * 2)
    return x0, y0, x1 - x0, y1 - y0


class Line:
    """En replik som läggs in ruta för ruta, i filmens ordning. `add` tar varje ritad ruta (klippets ruta och modellens
    bild av samma ruta, hela plan); `ready` ger de rutor som är färdiga som (nummer, vikt, fönstrets plan eller None när
    rutan är klippets egen; `put` sätter fönstret i rutan): en ruta är färdig när de tre följande är ritade (grinden
    väljer bytets ruta bland högst tre) eller när filmen är slut.

    shift: None = läpparnas färgskifte räknas ur de rutor som är ritade när den första rutan med mun ska ut (för ström);
    "hela" = ur alla rutor som får munnen, som förlagan gör (då kommer inget ut förrän allt är ritat)."""
    AHEAD = 3

    def __init__(self, win, heard, lips, gate=GATE, shift=None, own_cache=None):
        check_recipe(lips)
        self.win, self.heard, self.lips, self.gate = win, heard, lips, gate
        self.n = len(heard)
        self.whole = shift == "hela"
        self.shift = None if shift in (None, "hela") else tuple(shift)
        self.cache = own_cache if own_cache is not None else {}
        self.items, self.apart, self.tones, self.out, self.seen = [], [], [], 0, {}
        self.weights = None
        self.last = (win[2] / 2, win[3] * 0.45)

    def own(self, key, planes):
        """Klippets egen ruta i fönstret, med det som bara beror på den: läppkartan, läpparnas mitt och deras färg."""
        if key not in self.cache:
            Y, U, V = cut(planes, self.win)
            lip = lip_map(V)
            middle = lips_middle(lip, self.win[2], self.win[3])
            at = middle or (self.win[2] / 2, self.win[3] * 0.45)
            self.cache[key] = {"planes": (Y, U, V), "lip": lip, "middle": middle, "tone": lip_tone(Y, U, V, lip, at), "at": at}
        return self.cache[key]

    def add(self, key, own_planes, drawn_planes, drawn_win=None):
        """drawn_win: fönstret i den ritade rutan när den har andra mått än klippets (en film mot rendererns klipp)."""
        o = self.own(key, own_planes)
        d = cut(drawn_planes, drawn_win or self.win)
        ix, iy, iw, ih = inner((0, 0, self.win[2], self.win[3]))
        self.apart.append(float(np.mean(np.abs(o["planes"][0][iy:iy + ih, ix:ix + iw] - d[0][iy:iy + ih, ix:ix + iw]))))
        self.tones.append(lip_tone(d[0], d[1], d[2], lip_map(d[2]), o["at"]))
        self.items.append((key, own_planes, d))

    def ready(self):
        got = len(self.items)
        done = got == self.n
        upto = self.n if done else (0 if self.whole else max(0, got - self.AHEAD))
        if upto <= self.out:
            return []
        weights = speech_gate(self.heard, self.gate, self.apart + [0.0] * (self.n - got))
        if done:
            self.weights = weights
        res = []
        for k in range(self.out, upto):
            key, own_planes, d = self.items[k]
            o = self.cache[key]
            if weights[k] > 0:
                if o["middle"]:
                    self.last = o["middle"]
                if self.shift is None:
                    on = [i for i in range(got) if weights[i] > 0]
                    own_sum = sum(self.cache[self.items[i][0]]["tone"] for i in on)
                    drawn_sum = sum(self.tones[i] for i in on)
                    self.shift = tuple(own_sum[j] / own_sum[3] - drawn_sum[j] / drawn_sum[3] for j in range(3)) \
                        if own_sum[3] and drawn_sum[3] else (0.0, 0.0, 0.0)
                self.seen[k] = {}
                laid = lay_mouth(o["planes"], d, self.last, self.shift, self.lips, o["lip"], self.seen[k])
                if weights[k] < 1:
                    laid = mix(laid, o["planes"], weights[k])
                res.append((k, weights[k], laid))
            else:
                res.append((k, 0.0, None))
            self.items[k] = (key, None, None)
        self.out = upto
        return res
