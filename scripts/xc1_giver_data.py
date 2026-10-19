"""Verified route-specific quest givers from XC1 DE Simplified Chinese data."""
import json
from pathlib import Path

CORRECTIONS_PATH = Path(__file__).resolve().parents[1] / "data" / "xc1-giver-corrections.json"


def apply_giver_corrections(quests: list[dict]) -> None:
    correction_data = json.loads(CORRECTIONS_PATH.read_text(encoding="utf-8"))
    quest_by_id = {quest["id"]: quest for quest in quests}
    for correction in correction_data["quests"]:
        quest = quest_by_id[correction["id"]]
        if quest["name"] != correction["name"]:
            raise RuntimeError(f"委托人修正任务名不匹配：{quest['id']}")
        quest["giver"] = correction["giver"]
        if correction["notes"] not in quest.get("notes", ""):
            quest["notes"] = quest.get("notes", "").rstrip("；") + "；" + correction["notes"]
        quest["updatedAt"] = correction_data["updatedAt"]
