"""Versionerat munrecept och kvittots identitet. Använder bara standardbiblioteket."""

import hashlib
import json
import math
from copy import deepcopy
from pathlib import Path

PROFILE_ID = "paow-realtid-mun-6@1"
PROFILE_PATH = Path(__file__).with_name("profiler") / f"{PROFILE_ID}.json"
_SCALARS = ("wide", "tall", "tallUp", "growUp", "colour", "sharpen")
_VECTORS = {"grow": 2, "reach": 2, "lipsOnly": 3, "opening": 4}


def _number(value):
    return type(value) in (float, int) and math.isfinite(value)


def load_profile(path=PROFILE_PATH):
    profile = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(profile, dict) or profile.get("schemaVersion") != 1 or profile.get("id") != PROFILE_ID:
        raise ValueError(f"Ogiltigt format eller id för munprofilen {PROFILE_ID}.")
    recipe = profile.get("recept")
    if not isinstance(recipe, dict) or set(recipe) != set(_SCALARS) | _VECTORS.keys():
        raise ValueError(f"Munprofilen {PROFILE_ID} måste ange hela receptet.")
    for key in _SCALARS:
        if not _number(recipe[key]) or recipe[key] < 0 or (key not in ("colour", "sharpen") and recipe[key] == 0):
            raise ValueError(f"Ogiltigt värde för {key} i munprofilen.")
    for key, length in _VECTORS.items():
        values = recipe[key]
        if not isinstance(values, list) or len(values) != length or not all(_number(v) and v >= 0 for v in values):
            raise ValueError(f"Ogiltiga värden för {key} i munprofilen.")
    share, full, power, upper = recipe["opening"]
    if share > 1 or upper > 1 or not full or not power or not all(recipe["grow"] + recipe["reach"]):
        raise ValueError("Ogiltiga mått eller andelar i munprofilen.")
    return profile


def resolve_recipe(profile, override=None):
    """Behåll den valda basprofilen och bind hashen till det faktiskt sammanslagna receptet."""
    if override is not None and not isinstance(override, dict):
        raise ValueError("recept ska vara ett JSON-objekt eller null.")
    recipe = deepcopy(profile["recept"])
    if override is not None:
        recipe.update(deepcopy(override))
    canonical = json.dumps(recipe, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return {
        "profilId": profile["id"],
        "recept": recipe,
        "receptSha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        "receptOverstyrt": override is not None,
    }
