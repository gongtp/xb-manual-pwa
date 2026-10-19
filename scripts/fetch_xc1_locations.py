"""Build the XC1 Definitive Edition atlas from the Simplified Chinese BDAT data.

Run with --refresh to re-fetch sources. Cached sources live in ignored work/.
This importer only writes data/xc1-locations.json; it never changes the database.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "work" / "xc1-locations-cache"
BDAT = "https://xenobladedata.github.io/xb1de/bdat/bdat_common/"


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "XenoArchiveAtlas/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8")


def localized(table: str, ids: list[int] | None = None) -> list[dict]:
    invocations = [f"{{{{#invoke:RequestHelper|output|bdat_common.{table}{suffix}}}}}"
                   for suffix in ([f"|{i}" for i in ids] if ids else [""])]
    query = urllib.parse.urlencode({"action": "expandtemplates", "text": "<SPLIT>".join(invocations),
                                   "prop": "wikitext", "format": "json", "formatversion": "2"})
    payload = json.loads(fetch("https://xenoblade.cn/api.php?" + query))
    text = payload["expandtemplates"]["wikitext"]
    return [json.loads(part) for part in text.split("<SPLIT>")] if ids else json.loads(text)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    if args.refresh or not (CACHE / "localized.json").exists():
        rows = localized("landmarklist")
        (CACHE / "localized.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    rows = json.loads((CACHE / "localized.json").read_text(encoding="utf-8"))
    if args.refresh or not (CACHE / "maps.json").exists():
        ids = sorted({row["mapID"] for row in rows})
        maps = []
        for offset in range(0, len(ids), 8):
            maps.extend(localized("FLD_maplist", ids[offset:offset + 8]))
        (CACHE / "maps.json").write_text(json.dumps(maps, ensure_ascii=False), encoding="utf-8")
    maps = json.loads((CACHE / "maps.json").read_text(encoding="utf-8"))
    for table in ["landmarklist", "FLD_maplist"]:
        file = CACHE / f"{table}.html"
        if args.refresh or not file.exists():
            file.write_text(fetch(BDAT + table + ".html"), encoding="utf-8")

    def english_names(table: str) -> dict[int, str]:
        markup = (CACHE / f"{table}.html").read_text(encoding="utf-8")
        return {int(i): html.unescape(re.sub(r"<[^>]*>", "", name)).strip()
                for i, name in re.findall(r'<tr id="(\d+)">.*?<td class="side">(.*?)</td>', markup, re.S)}

    english = english_names("landmarklist")
    region_english = english_names("FLD_maplist")
    # ma0801 is the unused original shoulder, ma2701 an event-only duplicate.
    # Keep the zero-reward Mechon Wreckage Site: it is an actual landmark.
    rows = [row for row in rows if row["mapID"] not in {10, 34}]
    map_ids = {row["mapID"] for row in rows}
    regions = []
    for entry in maps:
        if entry["row_id"] not in map_ids:
            continue
        mid = entry["row_id"]
        regions.append({"id": f"XC1-REGION-{mid:02}", "name": entry["name"],
                        "englishName": region_english[mid],
                        "arc": "futureConnected" if mid in {29, 30} else "main",
                        "stage": {14: "初访", 15: "再访"}.get(mid, ""),
                        "order": {26: 24, 28: 21.5}.get(mid, entry["index"]),
                        "floors": entry["minimap_floor_cnt"],
                        "sourceUrl": BDAT + f"FLD_maplist.html#{mid}"})
    regions.sort(key=lambda r: (r["arc"] != "main", r["order"]))
    locations = [{"id": f"XC1-PLACE-{row['row_id']:03}", "name": row["name"],
                  "englishName": english[row["row_id"]],
                  "regionId": f"XC1-REGION-{row['mapID']:02}",
                  "kind": {0: "landmark", 1: "secret", 2: "location"}[row["category"]],
                  "position": {"x": row["posX"], "y": row["posY"], "z": row["posZ"]},
                  "rewards": {"exp": row["getEXP"], "ap": row["getAP"], "sp": row["getPP"]},
                  "sourceUrl": BDAT + f"landmarklist.html#{row['row_id']}"} for row in rows]
    assert len(regions) == 26 and len(locations) == 485
    assert len({r["id"] for r in locations}) == len(locations)
    assert sum(r["kind"] == "secret" for r in locations) == 20
    assert all(r["name"] and r["englishName"] for r in locations)
    output = {"edition": "异度神剑 终极版", "language": "简体中文", "updatedAt": "2026-09-06",
              "source": "蒙纳多研究本部简体中文 BDAT；Xenoblade DE Data Tables",
              "localizationSourceUrl": "https://xenoblade.cn/模块:RequestHelper",
              "regions": regions, "locations": locations}
    (ROOT / "data" / "xc1-locations.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(regions)} regions, {len(locations)} locations, 20 secret areas.")


if __name__ == "__main__":
    main()
