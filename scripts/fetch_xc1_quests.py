from __future__ import annotations

import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any


API_URL = "https://xenoblade.cn/api.php"
SOURCE_NAME = "蒙纳多研究本部"
SOURCE_DATE = "2026-08-05"
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "xc1-quests-xenoblade-cn.json"
USER_AGENT = "XenoArchiveDataImporter/1.0 (quest catalog maintenance)"


def api_get(params: dict[str, str], attempts: int = 3) -> dict[str, Any]:
    url = f"{API_URL}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.load(response)
        except Exception as error:  # noqa: BLE001 - retry network and remote errors
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"request failed: {url}") from last_error


def fetch_catalog() -> list[tuple[str, dict[str, Any]]]:
    rows: list[tuple[str, dict[str, Any]]] = []
    offset = 0
    while True:
        query = (
            "[[任务:+]][[Id::+]]"
            "|?Id|?Npc|?Money|?Exp|?Famous|?Genre|?Reward"
            f"|sort=Id|order=asc|limit=100|offset={offset}"
        )
        payload = api_get({"action": "ask", "query": query, "format": "json"})
        results = payload["query"]["results"]
        batch = list(results.items())
        rows.extend(batch)
        print(f"catalog: {len(rows)} records", flush=True)
        if len(batch) < 100:
            break
        offset += len(batch)
    return rows


def rendered_page_details(title: str) -> dict[str, str]:
    payload = api_get(
        {
            "action": "parse",
            "page": title,
            "prop": "text",
            "format": "json",
            "formatversion": "2",
        }
    )
    markup = payload["parse"]["text"]
    prerequisite_link = re.search(
        r"前置任务\s*[:：]\s*<a[^>]*>(.*?)</a>",
        markup,
        flags=re.IGNORECASE | re.DOTALL,
    )
    markup_with_breaks = re.sub(r"<br\s*/?>", "\n", markup, flags=re.IGNORECASE)
    markup_with_breaks = re.sub(r"<hr\s*/?>", "\n", markup_with_breaks, flags=re.IGNORECASE)
    plain = html.unescape(re.sub(r"<[^>]+>", "", markup_with_breaks))
    lines = [re.sub(r"\s+", " ", line).strip() for line in plain.splitlines()]
    plain = "\n".join(line for line in lines if line)

    progress = re.search(r"主线进度\s*[:：]\s*(\d+)", plain)
    prerequisite = ""
    if prerequisite_link:
        prerequisite = html.unescape(re.sub(r"<[^>]+>", "", prerequisite_link.group(1))).strip()
    return {
        "progress": progress.group(1) if progress else "",
        "prerequisite": prerequisite,
    }


def first(values: Any, default: Any = "") -> Any:
    return values[0] if isinstance(values, list) and values else default


def numeric_text(values: Any) -> str:
    value = first(values, "0")
    try:
        return str(int(float(str(value))))
    except ValueError:
        return str(value)


def make_record(title: str, result: dict[str, Any], details: dict[str, str]) -> dict[str, str]:
    printouts = result.get("printouts", {})
    row_id = int(first(printouts.get("Id"), 0))
    path = title.removeprefix("任务:")
    region, name = path.split("/", 1)
    genre = str(first(printouts.get("Genre"), "普通任务"))
    npc = str(first(printouts.get("Npc"), ""))
    giver = "自动触发" if npc == "突发任务" else npc
    money = numeric_text(printouts.get("Money"))
    experience = numeric_text(printouts.get("Exp"))
    rewards = [str(value) for value in printouts.get("Reward", []) if str(value).strip()]
    reward_parts = [f"MONEY {money}", f"EXP {experience}", *rewards]
    famous = numeric_text(printouts.get("Famous"))
    notes: list[str] = []
    if npc == "突发任务":
        notes.append("突发任务，会在满足条件时自动触发")
    if famous != "0":
        notes.append(f"完成后地区评价增加 {famous}")
    if details["progress"]:
        notes.append(f"来源标注主线进度：{details['progress']}")

    source_url = result.get("fullurl") or f"https://xenoblade.cn/{urllib.parse.quote(title)}"
    return {
        "id": f"XC1-Q-{row_id:04d}",
        "game": "XC1",
        "name": name,
        "type": genre,
        "chapter": f"主线进度 {details['progress']}" if details["progress"] else "",
        "region": region,
        "giver": giver or "未注明",
        "reward": " · ".join(reward_parts),
        "prerequisites": details["prerequisite"],
        "source": SOURCE_NAME,
        "sourceUrl": source_url,
        "status": "complete",
        "notes": "；".join(notes),
        "updatedAt": SOURCE_DATE,
    }


def main() -> None:
    fetched_catalog = fetch_catalog()
    catalog_by_id: dict[int, tuple[str, dict[str, Any]]] = {}
    for title, result in fetched_catalog:
        row_id = int(first(result.get("printouts", {}).get("Id"), 0))
        if row_id in catalog_by_id:
            kept_title = catalog_by_id[row_id][0]
            print(f"duplicate source row {row_id}: keeping {kept_title}, skipping {title}", flush=True)
            continue
        catalog_by_id[row_id] = (title, result)
    catalog = list(catalog_by_id.values())
    print(f"catalog: {len(catalog)} unique quest ids", flush=True)
    detail_map: dict[str, dict[str, str]] = {}
    failures: list[str] = []

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(rendered_page_details, title): title for title, _ in catalog}
        for index, future in enumerate(as_completed(futures), start=1):
            title = futures[future]
            try:
                detail_map[title] = future.result()
            except Exception:  # noqa: BLE001 - keep catalog rows when an optional detail page fails
                detail_map[title] = {"progress": "", "prerequisite": ""}
                failures.append(title)
            if index % 25 == 0 or index == len(futures):
                print(f"details: {index}/{len(futures)}", flush=True)

    records = [make_record(title, result, detail_map[title]) for title, result in catalog]
    records.sort(key=lambda record: int(record["id"].rsplit("-", 1)[1]))

    ids = [record["id"] for record in records]
    if len(records) < 350 or len(ids) != len(set(ids)):
        raise RuntimeError("catalog validation failed")
    if {record["type"] for record in records} != {"剧情任务", "普通任务", "限时任务"}:
        raise RuntimeError("unexpected quest types")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"saved: {len(records)} records -> {OUTPUT_PATH}", flush=True)
    if failures:
        print(f"optional detail failures: {len(failures)}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
