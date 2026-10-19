from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any


API_URL = "https://xenoblade.cn/api.php"
NPC_SOURCE_URL = "https://xenoblade.cn/NPC"
FUTURE_CONNECTED_SOURCE_URL = "https://hyperwiki.jp/xenobladede/quest-fc/"
SOURCE_DATE = "2026-10-01"
ROOT = Path(__file__).resolve().parents[1]
QUEST_PATH = ROOT / "data" / "xc1-quests.json"
OUTPUT_PATH = ROOT / "data" / "xc1-npcs.json"
SUPPLEMENT_PATH = ROOT / "data" / "xc1-npc-supplement.json"
USER_AGENT = "XenoArchiveDataImporter/1.0 (named quest NPC maintenance)"


NON_PERSON_GIVERS = {
    "全体６号殖民地居民",
    "剧情任务",
    "剧情自动触发",
    "废品号船员",
    "机神界人驻扎部队",
    "海恩塔灯塔看守",
    "海恩塔难民",
    "终端：均衡兵力",
    "终端：情报战略",
    "终端：维持治安",
    "终端：都市计划",
    "自动触发",
    "荷姆斯旅行者",
    "营地居民",
    "诺彭商会",
    "诺彭调查队",
    "边境村居民",
    "防卫队员",
    "阿卡莫托卫兵",
    "阿卡莫托居民",
    "９号殖民地居民",
}


FUTURE_CONNECTED_LOCATIONS = {
    "加奈特": "盟友海角",
    "赫尔穆特": "盟友海角",
    "雷纳特": "盟友海角",
    "托蕾雅娜": "盟友海角",
    "哈巧巧": "纳比尔三岔路",
    "希西": "岩门洞窟后方",
    "波罗罗": "空桥",
    "莎库莎库": "阿巴契的背鳍",
    "瑟琪琪": "阿巴契的背鳍",
    "露朵露": "蝉洞门",
    "诺伊诺": "调查团驻屯地遗址",
    "托罗托罗": "贝尔广场／贝尔遗迹洞窟",
    "纳维纳": "被埋葬的历代君王墓碑之间",
    "兹库库": "悲哀墓场／祈愿雕石标",
    "瓦那瓦那": "古岚戴尔正门",
    "罗特": "格兰德拱门",
    "赫尔米娜": "格兰德拱门",
    "塞莉塞托娜": "格兰德拱门",
    "伊妮丝": "亚基尼诞生之地",
    "安吉拉": "格兰德拱门",
    "玛戈": "格兰德拱门",
    "内斯特尔": "格兰德拱门",
    "梅里坎斯": "调查团驻屯地遗址",
    "米斯里尔": "废品号",
    "阿姆雷特": "格兰德拱门",
    "塞蕾": "格兰德拱门",
    "修修": "亚基尼诞生之地",
    "塔辛": "格兰德拱门",
    "阿尔芙蕾达": "格兰德拱门",
    "维妮娅": "格兰德拱门",
    "拉达姆": "格兰德拱门",
    "阿拉拉": "格兰德拱门",
    "莉法": "芙蕾丝街道",
    "多多拉": "皇都阿卡莫托正门",
    "拉班": "蝉洞门",
    "马克西斯": "古岚戴尔",
}


def api_get(params: dict[str, str]) -> dict[str, Any]:
    url = f"{API_URL}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.load(response)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("NPC API 请求失败")


def values(printouts: dict[str, Any], key: str) -> list[str]:
    raw_values = printouts.get(key, printouts.get(key[:1].upper() + key[1:], []))
    return [str(value).strip() for value in raw_values if str(value).strip()]


def appearance_rows(printouts: dict[str, Any]) -> list[dict[str, str]]:
    areas = values(printouts, "area")
    locations = values(printouts, "landmark")
    active_times = values(printouts, "timeRange")
    count = max(len(areas), len(locations), len(active_times), 1)
    appearances: list[dict[str, str]] = []
    for index in range(count):
        appearances.append({
            "region": areas[index] if index < len(areas) else (areas[-1] if areas else ""),
            # Semantic MediaWiki 会对同一 NPC 的重复属性值去重；缺位时沿用
            # 最后一个地点，避免同一地点的多种活动时间被误判为“地点缺失”。
            "location": locations[index] if index < len(locations) else (locations[-1] if locations else ""),
            "activeTime": active_times[index] if index < len(active_times) else (
                active_times[-1] if active_times else "6:00 ~ 6:00"
            ),
            "condition": "" if index == 0 else "随剧情推进或移居后",
        })
    return appearances


def quest_number(quest_id: str) -> int:
    return int(quest_id.rsplit("-", 1)[1])


def fetch_npc_detail(title: str) -> tuple[str, dict[str, Any]]:
    query = f"[[{title}]]|?id|?area|?landmark|?timeRange|limit=10"
    payload = api_get({"action": "ask", "query": query, "format": "json"})
    result = payload.get("query", {}).get("results", {}).get(title)
    if not result:
        raise RuntimeError(f"无法获取 NPC 详情：{title}")
    return title, result


def main() -> None:
    quests = json.loads(QUEST_PATH.read_text(encoding="utf-8"))
    quests_by_giver: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for quest in quests:
        arc = "futureConnected" if str(quest["chapter"]).startswith("相连的未来") else "main"
        quests_by_giver[(arc, str(quest["giver"]).strip())].append(quest)

    query = "[[NPC:+]]|?id|?area|?landmark|?timeRange|sort=id|limit=500"
    payload = api_get({"action": "ask", "query": query, "format": "json"})
    records: list[dict[str, Any]] = []

    matched_titles = [
        title
        for title in payload["query"]["results"]
        if quests_by_giver.get(("main", title.removeprefix("NPC:").strip()))
    ]
    # 带 sort 的汇总查询会分别排序多值属性，可能把“地点”和“时间”错配。
    # 单页查询保留模板中的属性顺序，因此在筛出具名委托人后逐页读取详情。
    with ThreadPoolExecutor(max_workers=3) as executor:
        details = dict(executor.map(fetch_npc_detail, matched_titles))

    for title in matched_titles:
        result = details[title]
        name = title.removeprefix("NPC:").strip()
        related = quests_by_giver.get(("main", name), [])
        if not related:
            continue
        printouts = result.get("printouts", {})
        numeric_ids = [int(float(value)) for value in values(printouts, "id")]
        source_id = min(numeric_ids) if numeric_ids else quest_number(related[0]["id"])
        appearances = appearance_rows(printouts)
        records.append({
            "id": f"XC1-NPC-MAIN-{source_id:04d}",
            "name": name,
            "arc": "main",
            "appearances": appearances,
            "questIds": sorted((quest["id"] for quest in related), key=quest_number),
            "source": "蒙纳多研究本部 NPC 汇总",
            "sourceUrl": result.get("fullurl") or NPC_SOURCE_URL,
            "notes": "出现多个地点时，表示该 NPC 可能随剧情推进或移居而改变位置。",
            "updatedAt": SOURCE_DATE,
        })

    for name, location in FUTURE_CONNECTED_LOCATIONS.items():
        related = quests_by_giver.get(("futureConnected", name), [])
        if not related:
            raise RuntimeError(f"相连的未来任务中找不到具名委托人：{name}")
        first_quest_number = min(quest_number(quest["id"]) for quest in related)
        region = "皇都阿卡莫托（相连的未来）" if name == "多多拉" else "巨神肩"
        records.append({
            "id": f"XC1-NPC-FC-{first_quest_number:04d}",
            "name": name,
            "arc": "futureConnected",
            "appearances": [{
                "region": region,
                "location": location,
                "activeTime": "无固定时间限制",
                "condition": "随《相连的未来》剧情与前置任务开放",
            }],
            "questIds": sorted((quest["id"] for quest in related), key=quest_number),
            "source": "hyperWiki 相连的未来任务表；简中实机资料",
            "sourceUrl": FUTURE_CONNECTED_SOURCE_URL,
            "notes": "仅收录任务委托人与任务接取位置；无姓名的通用委托不建立 NPC 资料。",
            "updatedAt": SOURCE_DATE,
        })

    # 汇总页并非完整 NPC 名录；以已核验的终极版简中 BDAT 记录补全。
    known_names = {(record["arc"], record["name"]) for record in records}
    for supplement in json.loads(SUPPLEMENT_PATH.read_text(encoding="utf-8")):
        key = (supplement["arc"], supplement["name"])
        if key in known_names:
            continue
        related = quests_by_giver.get(key, [])
        if not related:
            raise RuntimeError(f"补充 NPC 已无关联任务：{supplement['name']}")
        record = {key: value for key, value in supplement.items() if key != "sourceNpcIds"}
        record["questIds"] = sorted((quest["id"] for quest in related), key=quest_number)
        records.append(record)
        known_names.add(key)
    uncovered = sorted({
        giver for (arc, giver) in quests_by_giver
        if (arc, giver) not in known_names and giver not in NON_PERSON_GIVERS
    })
    if uncovered:
        raise RuntimeError(f"任务委托人缺少 NPC 档案：{uncovered}")

    records.sort(key=lambda record: (record["arc"] != "main", record["id"]))
    ids = [record["id"] for record in records]
    linked_quests = [quest_id for record in records for quest_id in record["questIds"]]
    if len(records) < 100 or len(ids) != len(set(ids)):
        raise RuntimeError("NPC 数据数量或编号校验失败")
    if len(linked_quests) != len(set(linked_quests)):
        raise RuntimeError("同一任务关联了多个委托人记录")
    if any(not record["questIds"] or not record["appearances"] for record in records):
        raise RuntimeError("NPC 缺少关联任务或出现位置")
    if any(
        record["arc"] == "main"
        and not all(
            appearance["region"] and appearance["location"] and appearance["activeTime"]
            for appearance in record["appearances"]
        )
        for record in records
    ):
        raise RuntimeError("本篇 NPC 缺少区域、地点或活动时间，可能是 API 字段解析失败")

    OUTPUT_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"saved: {len(records)} named quest NPCs, {len(linked_quests)} quest links -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
