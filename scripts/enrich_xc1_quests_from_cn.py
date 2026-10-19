from __future__ import annotations

from xc1_giver_data import apply_giver_corrections

import argparse
import html
import json
import re
import sqlite3
import time
import unicodedata
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
QUESTS_PATH = ROOT / "data" / "xc1-quests.json"
CN_SOURCE_PATH = ROOT / "data" / "xc1-quests-xenoblade-cn.json"
BDAT_CATALOG_CACHE_PATH = ROOT / "data" / "xc1-bdat-catalog-cache.json"
LOCALIZED_CACHE_PATH = ROOT / "data" / "xc1-bdat-cn-cache.json"
DEFAULT_DATABASE = ROOT / "data" / "xeno-archive.sqlite"
BDAT_INDEX = "https://xenobladedata.github.io/xb1de/bdat/index.html"
BDAT_ROOT = "https://xenobladedata.github.io/xb1de/bdat/"
SOURCE_NAME = "蒙纳多研究本部"
BDAT_SOURCE_NAME = "蒙纳多研究本部本地化数据库"
BDAT_PUBLIC_NAME = "Xenoblade 1 DE Data Tables"
SOURCE_DATE = "2026-08-05"
USER_AGENT = "XenoArchiveDataEnricher/1.0 (quest catalog maintenance)"

REGION_ALIASES = {
    "诺彭村": "边境村",
    "落腕": "坠落巨臂",
    "燐光之地扎托尔": "磷光之地扎托尔",
    "帝都安格尼拉特": "帝都安古尼拉特",
    "玛克纳原生林": "玛格纳原始森林",
    "机神界领域": "机神界区域",
    "加拉哈德要塞": "卡拉哈德要塞",
}
GENERIC_PREREQUISITE = "剧情进度、地区评价、羁绊关系或前置任务可能影响出现。"


def get_text(url: str, attempts: int = 3) -> str:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.read().decode("utf-8")
        except Exception as error:  # noqa: BLE001 - retry transient source failures
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"request failed: {url}") from last_error


def fetch_bdat_catalog() -> dict[int, dict[str, str]]:
    if BDAT_CATALOG_CACHE_PATH.exists():
        cached = json.loads(BDAT_CATALOG_CACHE_PATH.read_text(encoding="utf-8"))
        return {int(row_id): value for row_id, value in cached.items()}

    index = get_text(BDAT_INDEX)
    paths = sorted(
        {
            path.replace("\\", "/")
            for path in re.findall(r'href="([^"]*JNL_quest\d+\.html)"', index)
            if "_ms" not in path
        }
    )
    if len(paths) < 20:
        raise RuntimeError(f"unexpected BDAT quest table count: {len(paths)}")

    records: dict[int, dict[str, str]] = {}
    row_pattern = re.compile(
        r'<tr id="(\d+)">.*?<td class="side">(.*?)</td>',
        flags=re.DOTALL,
    )
    for path in paths:
        markup = get_text(BDAT_ROOT + path)
        for raw_id, raw_name in row_pattern.findall(markup):
            name = html.unescape(re.sub(r"<[^>]+>", "", raw_name)).strip()
            if name:
                records[int(raw_id)] = {"english": name, "path": path}
    if len(records) < 350:
        raise RuntimeError(f"unexpected BDAT quest title count: {len(records)}")
    BDAT_CATALOG_CACHE_PATH.write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return records


def fetch_english_names() -> dict[int, str]:
    return {
        row_id: record["english"]
        for row_id, record in fetch_bdat_catalog().items()
    }


def fetch_localized_record(row_id: int) -> dict[str, Any]:
    invocation = f"{{{{#invoke:RequestHelper|output|bdat_common.JNL_quest|{row_id}}}}}"
    params = {
        "action": "expandtemplates",
        "text": invocation,
        "prop": "wikitext",
        "format": "json",
        "formatversion": "2",
    }
    payload = json.loads(get_text("https://xenoblade.cn/api.php?" + urllib.parse.urlencode(params)))
    return json.loads(payload["expandtemplates"]["wikitext"])


def fetch_localized_batch(row_ids: list[int]) -> dict[int, dict[str, Any]]:
    delimiter = "<XENO_QUEST_SPLIT>"
    invocation = delimiter.join(
        f"{{{{#invoke:RequestHelper|output|bdat_common.JNL_quest|{row_id}}}}}"
        for row_id in row_ids
    )
    params = {
        "action": "expandtemplates",
        "text": invocation,
        "prop": "wikitext",
        "format": "json",
        "formatversion": "2",
    }
    payload = json.loads(get_text("https://xenoblade.cn/api.php?" + urllib.parse.urlencode(params)))
    parts = payload["expandtemplates"]["wikitext"].split(delimiter)
    if len(parts) != len(row_ids):
        raise RuntimeError(
            f"localized batch returned {len(parts)} records; expected {len(row_ids)}"
        )
    return {row_id: json.loads(part) for row_id, part in zip(row_ids, parts, strict=True)}


def fetch_localized_records(row_ids: set[int]) -> dict[int, dict[str, Any]]:
    records: dict[int, dict[str, Any]] = {}
    if LOCALIZED_CACHE_PATH.exists():
        cached = json.loads(LOCALIZED_CACHE_PATH.read_text(encoding="utf-8"))
        records = {int(row_id): value for row_id, value in cached.items()}

    missing = sorted(row_ids - records.keys())
    batches = [missing[index : index + 5] for index in range(0, len(missing), 5)]
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(fetch_localized_batch, batch): batch for batch in batches}
        for future in as_completed(futures):
            batch = futures[future]
            records.update(future.result())
            LOCALIZED_CACHE_PATH.write_text(
                json.dumps(records, ensure_ascii=False) + "\n", encoding="utf-8"
            )
            print(f"localized cache: {len(row_ids & records.keys())}/{len(row_ids)}", flush=True)
    return {row_id: records[row_id] for row_id in row_ids}


def normalize_english(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).lower()
    value = "".join(character for character in value if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", "", value)


def english_name(quest: dict[str, Any]) -> str:
    match = re.search(r"英文原名：([^；]+)", quest.get("notes", ""))
    return match.group(1).strip() if match else ""


def canonical_region(value: str) -> str:
    return REGION_ALIASES.get(value, value)


def note_value(notes: str, label: str) -> str:
    match = re.search(rf"(?:^|；){re.escape(label)}：([^；]+)", notes)
    return match.group(1).strip() if match else ""


def sync_structured_flags(quest: dict[str, Any]) -> None:
    notes = quest.get("notes", "")
    exclusive_group = note_value(notes, "互斥组")
    quest["isTimed"] = note_value(notes, "限时") == "是"
    quest["isExclusive"] = bool(exclusive_group)
    quest["exclusiveGroup"] = exclusive_group
    quest["exclusiveRoute"] = note_value(notes, "路线")


def canonical_type(source: dict[str, Any], current: dict[str, Any]) -> str:
    if source["type"] == "剧情任务":
        return "剧情任务"
    if current["type"] == "突发任务" or source["giver"] == "自动触发":
        return "突发任务"
    return "支线任务"


def merge_source_names(current: str) -> str:
    names = [part.strip() for part in current.split("；") if part.strip()]
    if SOURCE_NAME not in names:
        names.append(SOURCE_NAME)
    return "；".join(names)


def enriched_notes(current: dict[str, Any], source: dict[str, Any], english: str) -> str:
    old_notes = current.get("notes", "")
    timed = "是" if source["type"] == "限时任务" else "否"
    parts = [
        f"英文原名：{english}",
        f"蒙纳多研究本部中文名：{source['name']}",
        f"限时：{timed}",
    ]
    if source.get("notes"):
        parts.extend(part for part in source["notes"].split("；") if part.strip())

    for label in ("互斥组", "路线", "截止点/风险", "目标分类"):
        value = note_value(old_notes, label)
        if value:
            parts.append(f"{label}：{value}")
    if current["type"] == "突发任务":
        parts.append("类型核验：突发任务（满足条件后自动触发）")
    parts.append("详细目标与步骤见蒙纳多研究本部来源链接。")

    reference = note_value(old_notes, "参考底稿")
    if reference:
        parts.append(f"参考底稿：{reference}")
    return "；".join(dict.fromkeys(parts))


def build_matches(
    quests: list[dict[str, Any]],
    source_records: list[dict[str, Any]],
    bdat_names: dict[int, str],
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    current_by_key: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for quest in quests:
        if quest["game"] != "XC1" or quest["chapter"].startswith("相连的未来"):
            continue
        key = (canonical_region(quest["region"]), normalize_english(english_name(quest)))
        if key[1]:
            current_by_key.setdefault(key, []).append(quest)

    matches: dict[str, dict[str, Any]] = {}
    unresolved: list[dict[str, Any]] = []
    for source in source_records:
        source_id = int(source["id"].rsplit("-", 1)[1])
        english = bdat_names.get(source_id, "")
        key = (canonical_region(source["region"]), normalize_english(english))
        candidates = current_by_key.get(key, []) if english else []
        if len(candidates) == 1 and candidates[0]["id"] not in matches:
            matches[candidates[0]["id"]] = {"source": source, "english": english}
            continue
        if len(candidates) == 2:
            groups = {note_value(candidate["notes"], "互斥组") for candidate in candidates}
            routes = {note_value(candidate["notes"], "路线") for candidate in candidates}
            if len(groups) == 1 and "" not in groups and routes == {"A", "B"}:
                for candidate in candidates:
                    matches[candidate["id"]] = {"source": source, "english": english}
                continue

        chinese_candidates = [
            quest
            for quest in quests
            if quest["game"] == "XC1"
            and not quest["chapter"].startswith("相连的未来")
            and canonical_region(quest["region"]) == canonical_region(source["region"])
            and quest["name"] == source["name"]
            and quest["id"] not in matches
        ]
        if len(chinese_candidates) == 1:
            matches[chinese_candidates[0]["id"]] = {"source": source, "english": english}
            continue
        unresolved.append({**source, "english": english, "candidateCount": len(candidates)})
    return matches, unresolved


def infer_table_regions(
    source_records: list[dict[str, Any]],
    bdat_catalog: dict[int, dict[str, str]],
) -> dict[str, set[str]]:
    regions: dict[str, set[str]] = {}
    for source in source_records:
        row_id = int(source["id"].rsplit("-", 1)[1])
        catalog_record = bdat_catalog.get(row_id)
        if catalog_record:
            regions.setdefault(catalog_record["path"], set()).add(
                canonical_region(source["region"])
            )
    return regions


def build_bdat_matches(
    quests: list[dict[str, Any]],
    source_matches: dict[str, dict[str, Any]],
    source_records: list[dict[str, Any]],
    bdat_catalog: dict[int, dict[str, str]],
) -> tuple[dict[str, int], list[dict[str, Any]]]:
    table_regions = infer_table_regions(source_records, bdat_catalog)
    catalog_by_english: dict[str, list[int]] = {}
    for row_id, record in bdat_catalog.items():
        catalog_by_english.setdefault(normalize_english(record["english"]), []).append(row_id)

    current_groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for quest in quests:
        if (
            quest["game"] != "XC1"
            or quest["chapter"].startswith("相连的未来")
            or quest["id"] in source_matches
        ):
            continue
        key = (canonical_region(quest["region"]), normalize_english(english_name(quest)))
        current_groups.setdefault(key, []).append(quest)

    matches: dict[str, int] = {}
    unresolved: list[dict[str, Any]] = []
    for (region, normalized_english), current_group in current_groups.items():
        candidates = catalog_by_english.get(normalized_english, [])
        regional_candidates = [
            row_id
            for row_id in candidates
            if region in table_regions.get(bdat_catalog[row_id]["path"], set())
        ]
        if regional_candidates:
            candidates = regional_candidates

        ordered_current = sorted(
            current_group,
            key=lambda quest: (
                note_value(quest["notes"], "路线") or "Z",
                quest["id"],
            ),
        )
        ordered_candidates = sorted(candidates)
        if len(ordered_current) == len(ordered_candidates) and ordered_candidates:
            for quest, row_id in zip(ordered_current, ordered_candidates, strict=True):
                matches[quest["id"]] = row_id
            continue
        unresolved.append(
            {
                "region": region,
                "english": english_name(current_group[0]),
                "currentIds": [quest["id"] for quest in ordered_current],
                "candidateIds": ordered_candidates,
            }
        )
    return matches, unresolved


def plain_text(value: Any) -> str:
    if not value:
        return ""
    text = str(value).replace("<br />", "；").replace("<br/>", "；")
    text = re.sub(r"\[/System:[^\]]+\]", "", text)
    text = re.sub(r"\[System:[^\]]+\]", "", text)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", text))).strip(" ；")


def localized_giver(data: dict[str, Any]) -> str:
    npc = data.get("npc_id") or {}
    if npc.get("mob_name") == "突发任务":
        return "自动触发"
    return npc.get("mob_name") or npc.get("name") or "未注明"


def localized_reward_item(item: Any) -> str:
    if not isinstance(item, dict) or not isinstance(item.get("itemID"), dict):
        return ""
    item_data = item["itemID"]
    name = str(item_data.get("name") or "")
    rank = int(item.get("rankType") or 0)
    if rank:
        name += str(rank)
    if item_data.get("uni_flag") == 0 and "jwl_slot" in item_data:
        name += f"[{item_data['jwl_slot']}]"
    return name


def localized_reward(data: dict[str, Any], route: str) -> str:
    parts = [
        f"MONEY {int(data.get('reward_money') or 0) * 10}",
        f"EXP {int(data.get('reward_exp') or 0) * 10}",
    ]
    reward_route = "B" if route == "B" and data.get("reward_B1") else "A"
    for index in range(1, 4):
        item = localized_reward_item(data.get(f"reward_{reward_route}{index}"))
        if item:
            parts.append(item)
    return " · ".join(parts)


def localized_prerequisites(data: dict[str, Any]) -> str:
    requirements: list[str] = []
    if int(data.get("flg_s") or 0):
        requirements.append(f"主线进度 {data['flg_s']}")
    prerequisite = data.get("cnd_questID")
    if isinstance(prerequisite, dict) and prerequisite.get("title"):
        requirements.append(f"前置任务：{prerequisite['title']}")
    if int(data.get("cnd_famous") or 0):
        requirements.append(f"地区评价值 {data['cnd_famous']} 以上")
    for key in ("npcmeetID1", "npcmeetID2"):
        npc = data.get(key)
        if isinstance(npc, dict) and npc.get("name"):
            requirements.append(f"羁绊图已登记：{npc['name']}")
    return "；".join(requirements) or GENERIC_PREREQUISITE


def localized_notes(
    current: dict[str, Any],
    data: dict[str, Any],
    english: str,
) -> str:
    old_notes = current.get("notes", "")
    parts = [
        f"英文原名：{english}",
        f"蒙纳多研究本部中文名：{data['title']}",
        f"限时：{'是' if data.get('qst_genre') == '限时任务' else '否'}",
    ]
    menu = data.get("menu") or {}
    purpose = plain_text(menu.get("purpose"))
    progress = plain_text(menu.get("info_prog"))
    result = plain_text(menu.get("info_end_A"))
    if purpose:
        parts.append(f"目标：{purpose}")
    if progress and progress != purpose:
        parts.append(f"步骤：{progress}")
    if result:
        parts.append(f"完成说明：{result}")
    if int(data.get("up_famous_A") or 0):
        parts.append(f"完成后地区评价增加 {data['up_famous_A']}")
    for label in ("互斥组", "路线", "截止点/风险", "目标分类"):
        value = note_value(old_notes, label)
        if value:
            parts.append(f"{label}：{value}")
    if current["type"] == "突发任务":
        parts.append("类型核验：突发任务（满足条件后自动触发）")
    parts.append(
        "该任务尚无蒙纳多研究本部独立页面；中文名与字段直接取自其使用的简体中文本地化数据库。"
    )
    reference = note_value(old_notes, "参考底稿")
    if reference:
        parts.append(f"参考底稿：{reference}")
    return "；".join(dict.fromkeys(parts))


def apply_bdat_matches(
    quests: list[dict[str, Any]],
    matches: dict[str, int],
    localized_records: dict[int, dict[str, Any]],
    bdat_catalog: dict[int, dict[str, str]],
) -> tuple[int, int]:
    completed_pending = 0
    renamed = 0
    for current in quests:
        row_id = matches.get(current["id"])
        if row_id is None:
            continue
        data = localized_records[row_id]
        catalog = bdat_catalog[row_id]
        was_pending = current["status"] == "pending"
        if current["name"] != data["title"]:
            renamed += 1

        current["name"] = data["title"]
        if data.get("qst_genre") == "剧情任务":
            current["type"] = "剧情任务"
        elif localized_giver(data) == "自动触发":
            current["type"] = "突发任务"
        else:
            current["type"] = "支线任务"
        if int(data.get("flg_s") or 0):
            current["chapter"] = f"本篇 · 主线进度 {data['flg_s']}"
        current["region"] = canonical_region(
            data["npc_id"]["rlt_lnd"]["mapID"]["name"]
        )
        current["giver"] = localized_giver(data)
        route = note_value(current["notes"], "路线")
        current["reward"] = localized_reward(data, route)
        current["prerequisites"] = localized_prerequisites(data)
        source_names = [
            name
            for name in current["source"].split("；")
            if name and name != SOURCE_NAME
        ]
        current["source"] = "；".join(
            dict.fromkeys([*source_names, BDAT_SOURCE_NAME, BDAT_PUBLIC_NAME])
        )
        current["sourceUrl"] = f"{BDAT_ROOT}{catalog['path']}#{row_id}"
        current["status"] = "complete"
        current["notes"] = localized_notes(current, data, catalog["english"])
        sync_structured_flags(current)
        current["updatedAt"] = SOURCE_DATE
        if was_pending:
            completed_pending += 1
    return completed_pending, renamed


def apply_matches(
    quests: list[dict[str, Any]],
    matches: dict[str, dict[str, Any]],
) -> tuple[int, int]:
    completed_pending = 0
    renamed = 0
    for current in quests:
        if current["game"] == "XC1" and not current["chapter"].startswith("相连的未来"):
            current["region"] = canonical_region(current["region"])

        match = matches.get(current["id"])
        if not match:
            continue
        source = match["source"]
        english = match["english"] or english_name(current)
        was_pending = current["status"] == "pending"
        if current["name"] != source["name"]:
            renamed += 1

        current["name"] = source["name"]
        current["type"] = canonical_type(source, current)
        if source.get("chapter"):
            current["chapter"] = f"本篇 · {source['chapter']}"
        elif not current["chapter"].startswith("本篇 ·"):
            current["chapter"] = "本篇 · 随剧情/地区评价"
        current["region"] = canonical_region(source["region"])
        current["giver"] = source["giver"]
        current["reward"] = source["reward"]
        if source.get("prerequisites"):
            current["prerequisites"] = source["prerequisites"]
        elif not current.get("prerequisites"):
            current["prerequisites"] = GENERIC_PREREQUISITE
        current["source"] = merge_source_names(current["source"])
        current["sourceUrl"] = source["sourceUrl"]
        current["status"] = "complete"
        current["notes"] = enriched_notes(current, source, english)
        sync_structured_flags(current)
        current["updatedAt"] = SOURCE_DATE
        if was_pending:
            completed_pending += 1
    return completed_pending, renamed


def sync_database(database: Path, quests: list[dict[str, Any]]) -> None:
    if not database.exists():
        raise FileNotFoundError(database)
    sql = """
        UPDATE quests SET
          game = ?, name = ?, type = ?, chapter = ?, region = ?, giver = ?,
          reward = ?, prerequisites = ?, source = ?, source_url = ?, status = ?,
          is_timed = ?, is_exclusive = ?, exclusive_group = ?, exclusive_route = ?,
          manual_notes = ?, notes = ?, updated_at = ?
        WHERE id = ?
    """
    rows = [
        (
            quest["game"],
            quest["name"],
            quest["type"],
            quest["chapter"],
            quest["region"],
            quest["giver"],
            quest["reward"],
            quest["prerequisites"],
            quest["source"],
            quest["sourceUrl"],
            quest["status"],
            int(quest["isTimed"]),
            int(quest["isExclusive"]),
            quest["exclusiveGroup"],
            quest["exclusiveRoute"],
            quest.get("manualNotes", ""),
            quest["notes"],
            quest["updatedAt"],
            quest["id"],
        )
        for quest in quests
    ]
    with sqlite3.connect(database) as connection:
        connection.executemany(sql, rows)
        if connection.total_changes != len(rows):
            raise RuntimeError(
                f"database sync changed {connection.total_changes} rows; expected {len(rows)}"
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE)
    args = parser.parse_args()

    quests = json.loads(QUESTS_PATH.read_text(encoding="utf-8"))
    source_records = json.loads(CN_SOURCE_PATH.read_text(encoding="utf-8"))
    bdat_catalog = fetch_bdat_catalog()
    bdat_names = {
        row_id: record["english"] for row_id, record in bdat_catalog.items()
    }
    matches, unresolved = build_matches(quests, source_records, bdat_names)
    bdat_matches, unresolved_bdat = build_bdat_matches(
        quests, matches, source_records, bdat_catalog
    )
    matched_pending = sum(
        quest["status"] == "pending" and quest["id"] in matches for quest in quests
    )
    bdat_matched_pending = sum(
        quest["status"] == "pending" and quest["id"] in bdat_matches for quest in quests
    )
    print(
        json.dumps(
            {
                "sourceRecords": len(source_records),
                "bdatEnglishNames": len(bdat_names),
                "matched": len(matches),
                "matchedPending": matched_pending,
                "unresolvedSource": len(unresolved),
                "matchedFromLocalizedDatabase": len(bdat_matches),
                "localizedDatabasePending": bdat_matched_pending,
                "unresolvedCurrent": len(unresolved_bdat),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    for record in unresolved:
        print(
            "UNRESOLVED\t"
            + "\t".join(
                [record["id"], record["region"], record["name"], record["english"]]
            )
        )
    for record in unresolved_bdat:
        print(
            "UNRESOLVED_CURRENT\t"
            + "\t".join(
                [
                    ",".join(record["currentIds"]),
                    record["region"],
                    record["english"],
                    ",".join(str(value) for value in record["candidateIds"]),
                ]
            )
        )

    if not args.apply:
        return
    source_completed_pending, source_renamed = apply_matches(quests, matches)
    localized_records = fetch_localized_records(set(bdat_matches.values()))
    bdat_completed_pending, bdat_renamed = apply_bdat_matches(
        quests, bdat_matches, localized_records, bdat_catalog
    )
    # 同名 A/B 路线不能共用汇总页最后一个委托人。
    apply_giver_corrections(quests)
    QUESTS_PATH.write_text(
        json.dumps(quests, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    sync_database(args.database, quests)
    print(
        "applied: "
        f"completedPending={source_completed_pending + bdat_completed_pending}, "
        f"renamed={source_renamed + bdat_renamed}"
    )


if __name__ == "__main__":
    main()
