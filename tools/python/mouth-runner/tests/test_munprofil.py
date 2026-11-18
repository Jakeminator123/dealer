import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "kod"))
from munprofil import load_profile, resolve_recipe


class MouthProfileTest(unittest.TestCase):
    def test_approved_default_matches_proof(self):
        profile = load_profile()
        resolved = resolve_recipe(profile)
        self.assertEqual(profile["proof"], "paow-realtid-mun-6")
        self.assertEqual(resolved["profilId"], "paow-realtid-mun-6@1")
        self.assertEqual(resolved["receptSha256"], "28cc0ac5e912918ddea6ee3b449ee1eee70b90628f4254b1cac4984181f72c51")
        self.assertFalse(resolved["receptOverstyrt"])

    def test_malformed_profiles_are_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "profile.json"
            for key, value in (("opening", [.55, 26]), ("reach", [70, 0]), ("wide", float("nan"))):
                with self.subTest(key=key):
                    profile = load_profile()
                    profile["recept"][key] = value
                    path.write_text(json.dumps(profile), encoding="utf-8")
                    with self.assertRaises(ValueError):
                        load_profile(path)
            profile = load_profile()
            profile["id"] = "another-profile@1"
            path.write_text(json.dumps(profile), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_profile(path)

    def test_override_keeps_other_fields_and_binds_effective_recipe(self):
        profile = load_profile()
        default = resolve_recipe(profile)
        override = {"opening": None, "reach": [70, 52]}
        changed = resolve_recipe(profile, override)
        self.assertTrue(changed["receptOverstyrt"])
        self.assertEqual(changed["profilId"], default["profilId"])
        self.assertEqual(changed["recept"], {**default["recept"], **override})
        self.assertNotEqual(changed["receptSha256"], default["receptSha256"])
        self.assertEqual(resolve_recipe(profile, dict(reversed(override.items()))), changed)
        changed["recept"]["reach"][0] = 999
        self.assertEqual(override["reach"], [70, 52])
        self.assertEqual(resolve_recipe(profile), default)

    def test_same_recipe_can_be_explicit(self):
        profile = load_profile()
        default = resolve_recipe(profile)
        explicit = resolve_recipe(profile, {"opening": default["recept"]["opening"]})
        self.assertEqual(explicit["receptSha256"], default["receptSha256"])
        self.assertTrue(explicit["receptOverstyrt"])
        with self.assertRaises(ValueError):
            resolve_recipe(profile, [])
