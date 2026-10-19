#!/usr/bin/env python3
"""Build the Xenoblade Chronicles 2 quest catalog from xenoblade2.cn.

The Chinese wiki is the primary source.  Xenoblade Wiki is used only as an
independent count/classification reference because its English quest catalog
has the same 152 quest and 274 Merc Mission totals.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterable


API = "https://xenoblade2.cn/api.php"
PRIMARY_SOURCE = "乐园数据管理室"
REFERENCE_SOURCE = "Xenoblade Wiki"
REFERENCE_URL = "https://xenoblade.fandom.com/wiki/Quest_(XC2)"
MERC_REFERENCE_URL = "https://xenoblade.fandom.com/wiki/Merc_Group"
UPDATED_AT = "2026-08-12"

EXPANSION_QUEST_NAMES = {
    "工匠的灾难", "下落不明的诺彭", "废弃工厂探险团", "深夜中的食堂", "侦察兵",
    "这样就好嗼", "光天化日", "繁星之夜", "改造云海罗盘", "紧急情况！？",
    "铁匠的爱好", "名流帽", "制作迷恋药", "佣兵的规矩", "梅尔可利贝的强敌",
    "满载增幅器的沉船", "深受欢迎的糕点师", "巨匠的饰品", "斯佩比亚温泉旅行",
    "神秘的启动代码", "搜寻吉西西", "搜寻奥莱克", "搜寻萨拉夫",
    "全新的力量", "火花绽放", "神八的做派",
}

FREE_UPDATE_QUEST_NAMES = {"余恨"}

# Matched one by one against Xenoblade Wiki's 26 Expansion Pass Merc Missions
# using region, duration, Gold/EXP, Merc Points and Trust as a composite key.
EXPANSION_MERC_NAMES = {
    "巨神兽战舰的维护",
    "甜品配送1", "甜品配送2", "甜品配送3", "甜品配送4", "甜品配送5",
    "养护花园", "护卫六大贵族", "特别配送任务1", "特别配送任务2", "英维迪亚兵的特训", "婚礼",
    "檀佩兰提亚的生命线", "琪尔索耐斯的强敌",
    "开垦", "播种", "栽培", "梅尔可利贝的强敌再临",
    "偷袭", "看守农田", "情报收集", "八重切的提议", "雷鼓的提议",
    "贸易之桥", "坤帝斯的强敌", "伊吹的惊人情报是？",
}


def api_get(params: dict[str, str], retries: int = 4) -> dict:
    url = f"{API}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": "xeno-archive/1.0"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except Exception:
            if attempt + 1 == retries:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("unreachable")


def chunks(values: list[str], size: int = 40) -> Iterable[list[str]]:
    for offset in range(0, len(values), size):
        yield values[offset:offset + size]


def all_pages(namespace: int, prefix: str = "") -> list[str]:
    params = {
        "action": "query", "format": "json", "list": "allpages",
        "apnamespace": str(namespace), "aplimit": "max",
    }
    if prefix:
        params["apprefix"] = prefix
    return [page["title"] for page in api_get(params)["query"]["allpages"]]


def semantic_quest_titles() -> list[str]:
    query = "[[任务:+]]|?任务分类|?任务ID|sort=任务ID|limit=500|mainlabel=任务名"
    payload = api_get({"action": "ask", "format": "json", "query": query})
    return list(payload["query"]["results"])


def page_contents(titles: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for group in chunks(titles):
        payload = api_get({
            "action": "query", "format": "json", "prop": "revisions",
            "rvprop": "content", "rvslots": "main", "titles": "|".join(group),
        })
        for page in payload["query"]["pages"].values():
            revisions = page.get("revisions") or []
            if revisions:
                result[page["title"]] = revisions[0]["slots"]["main"].get("*", "")
    return result


def split_template(content: str, template_name: str) -> dict[str, str]:
    marker = "{{" + template_name
    start = content.find(marker)
    if start < 0:
        return {}
    depth = 0
    end = len(content)
    index = start
    while index < len(content) - 1:
        pair = content[index:index + 2]
        if pair == "{{":
            depth += 1
            index += 2
            continue
        if pair == "}}":
            depth -= 1
            index += 2
            if depth == 0:
                end = index
                break
            continue
        index += 1
    body = content[start + len(marker):end - 2]
    parts: list[str] = []
    current: list[str] = []
    nested = 0
    link_depth = 0
    index = 0
    while index < len(body):
        pair = body[index:index + 2]
        if pair == "{{":
            nested += 1
            current.append(pair)
            index += 2
            continue
        if pair == "}}" and nested:
            nested -= 1
            current.append(pair)
            index += 2
            continue
        if pair == "[[":
            link_depth += 1
            current.append(pair)
            index += 2
            continue
        if pair == "]]" and link_depth:
            link_depth -= 1
            current.append(pair)
            index += 2
            continue
        if body[index] == "|" and not nested and not link_depth:
            parts.append("".join(current))
            current = []
        else:
            current.append(body[index])
        index += 1
    parts.append("".join(current))
    fields: dict[str, str] = {}
    for part in parts:
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        fields[key.strip()] = value.strip()
    return fields


def clean_wikitext(value: str) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"<br\s*/?>", "；", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    value = re.sub(r"\[\[(?:[^\]|]+\|)?([^\]]+)\]\]", r"\1", value)
    previous = None
    while previous != value:
        previous = value
        value = re.sub(r"\{\{[^{}]*?\|([^{}|]+?)(?:\|[^{}]*)?\}\}", r"\1", value)
        value = re.sub(r"\{\{[^{}]+\}\}", "", value)
    value = re.sub(r"'{2,}", "", value)
    value = value.replace("&nbsp;", " ")
    value = re.sub(r"\s*；\s*", "；", value)
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n+", "；", value)
    return value.strip(" ；|")


def clean_wiki_inline(value: str, cell: bool = False) -> str:
    """Convert the inline subset used by special-event pages to readable text."""
    value = html.unescape(value or "")
    separator = "、" if cell else " "
    value = re.sub(r"<br\s*/?>", separator, value, flags=re.I)

    def replace_file(match: re.Match[str]) -> str:
        locations = re.findall(r"\{\{location\|([^{}]+)\}\}", match.group(0), flags=re.I)
        if not locations:
            return ""
        location = " · ".join(part.strip() for part in locations[-1].split("|") if part.strip())
        suffix_match = re.search(r"\}\}([^\]]*)\]\]$", match.group(0))
        suffix = suffix_match.group(1).strip(" |").strip() if suffix_match else ""
        return f"{location}{suffix}"

    value = re.sub(r"\[\[(?:文件|File):.*?\]\]", replace_file, value, flags=re.I)
    value = re.sub(
        r"\{\{location\|([^{}]+)\}\}",
        lambda match: " · ".join(part.strip() for part in match.group(1).split("|") if part.strip()),
        value,
        flags=re.I,
    )
    value = re.sub(r"\[\[(?:[^\]|]+\|)?([^\]]+)\]\]", r"\1", value)
    previous = None
    while previous != value:
        previous = value
        value = re.sub(r"\{\{[^{}]*?\|([^{}|]+?)(?:\|[^{}]*)?\}\}", r"\1", value)
        value = re.sub(r"\{\{[^{}]+\}\}", "", value)
    value = re.sub(r"<[^>]+>", "", value)
    value = re.sub(r"'{2,}", "", value)
    value = re.sub(r"\b\d+px\b(?:\|无)?", "", value, flags=re.I)
    value = re.sub(r"\[\s*\]", "", value)
    value = re.sub(r"(?:^|\s)(?:无|缩略图)\\?(?=\s|$)", " ", value)
    value = re.sub(r"\]{2,}", "", value)
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\s*、\s*", "、", value)
    return value.strip(" ；、|")


def markdown_table(block: str) -> str:
    lines = [line.rstrip() for line in block.strip().splitlines()]
    headers: list[str] = []
    raw_rows: list[list[tuple[str, int]]] = []
    current: list[tuple[str, int]] = []

    def parse_cell(raw: str) -> tuple[str, int]:
        raw = raw.strip()
        rowspan = 1
        attributes = re.match(r'^rowspan\s*=\s*["\']?(\d+)["\']?\s*\|\s*(.*)$', raw, flags=re.I)
        if attributes:
            rowspan = int(attributes.group(1))
            raw = attributes.group(2)
        return clean_wiki_inline(raw, cell=True).replace("|", "\\|"), rowspan

    for line in lines[1:]:
        stripped = line.strip()
        if not stripped or stripped == "|}" or stripped.startswith("|+"):
            continue
        if stripped.startswith("!"):
            headers.extend(clean_wiki_inline(cell, cell=True).replace("|", "\\|") for cell in stripped[1:].split("!!"))
            continue
        if stripped.startswith("|-"):
            if current:
                raw_rows.append(current)
                current = []
            continue
        if stripped.startswith("|"):
            current.extend(parse_cell(cell) for cell in stripped[1:].split("||"))
    if current:
        raw_rows.append(current)
    if not headers:
        return ""

    rows: list[list[str]] = []
    carried: dict[int, tuple[str, int]] = {}
    for raw_row in raw_rows:
        row = [""] * len(headers)
        for column, (value, remaining) in list(carried.items()):
            row[column] = value
            if remaining <= 1:
                carried.pop(column)
            else:
                carried[column] = (value, remaining - 1)
        column = 0
        for value, rowspan in raw_row:
            while column < len(headers) and row[column]:
                column += 1
            if column >= len(headers):
                break
            row[column] = value
            if rowspan > 1:
                carried[column] = (value, rowspan - 1)
            column += 1
        rows.append(row)

    divider = ["---"] * len(headers)
    rendered = [headers, divider, *rows]
    return "\n".join("| " + " | ".join(row) + " |" for row in rendered)


def special_event_markdown(content: str) -> str:
    """Convert headings, lists and wikitables without leaking raw MediaWiki syntax."""
    content = re.sub(r"\{\{#set:.*?\}\}\s*", "", content, flags=re.S | re.I)
    tables: list[str] = []

    def replace_table(match: re.Match[str]) -> str:
        token = f"@@XC2_TABLE_{len(tables)}@@"
        tables.append(markdown_table(match.group(0)))
        return f"\n{token}\n"

    content = re.sub(r"\{\|.*?\n\|\}", replace_table, content, flags=re.S)
    lines: list[str] = []
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            if lines and lines[-1]:
                lines.append("")
            continue
        table_token = re.fullmatch(r"@@XC2_TABLE_(\d+)@@", line)
        if table_token:
            lines.extend([tables[int(table_token.group(1))], ""])
            continue
        heading = re.match(r"^(={2,6})\s*(.*?)\s*\1$", line)
        if heading:
            title = clean_wiki_inline(heading.group(2))
            level = min(4, len(heading.group(1)) + 1)
            lines.extend([f"{'#' * level} {title}", ""])
            continue
        bullet = re.match(r"^\*+\s*(.*)$", line)
        if bullet:
            lines.append(f"- {clean_wiki_inline(bullet.group(1))}")
            continue
        numbered = re.match(r"^#+\s*(.*)$", line)
        if numbered:
            lines.append(f"1. {clean_wiki_inline(numbered.group(1))}")
            continue
        cleaned = clean_wiki_inline(line)
        if cleaned:
            lines.append(cleaned)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def item_names(value: str) -> list[str]:
    names: list[str] = []
    for match in re.finditer(r"\{\{ItemQuestRewardRow\|([^|}]+)(?:\|([^}]+))?\}\}", value or ""):
        name = clean_wikitext(match.group(1))
        count = clean_wikitext(match.group(2) or "")
        names.append(f"{name} ×{count}" if count and count != "1" else name)
    return names


def reward_text(fields: dict[str, str], merc: bool = False) -> str:
    rewards: list[str] = []
    for key, label in (("金币", "G"), ("EXP", "EXP"), ("SP", "SP"), ("佣兵团点数", "佣兵团点数"), ("信赖度", "信赖度")):
        value = clean_wikitext(fields.get(key, ""))
        if value and value != "0":
            rewards.append(f"{value}{label}" if label == "G" else f"{label} {value}")
    rewards.extend(item_names(fields.get("物品", "")))
    if merc:
        for index in range(1, 5):
            name = clean_wikitext(fields.get(f"物品{index}", ""))
            count = clean_wikitext(fields.get(f"数量{index}", ""))
            if name:
                rewards.append(f"{name} ×{count}" if count and count != "1" else name)
    return " · ".join(rewards) or ("任务完成报酬" if not merc else "佣兵团任务报酬")


def quest_steps(content: str) -> str:
    match = re.search(r"==\s*任务流程\s*==(.*?)(?:\n==|\Z)", content, flags=re.S)
    if not match:
        return ""
    block = match.group(1)
    rows = re.findall(r"^\s*#\s*(.+)$", block, flags=re.M)
    rows.extend(re.findall(r"<li>(.*?)</li>", block, flags=re.S | re.I))
    cleaned = [clean_wikitext(row) for row in rows]
    return " → ".join(row for row in cleaned if row)


def stable_id(prefix: str, source_id: str, title: str) -> str:
    normalized = clean_wikitext(source_id)
    if normalized and "{" not in normalized:
        token = re.sub(r"[^0-9A-Za-z-]+", "-", normalized).strip("-").upper()
        if token:
            return f"XC2-{prefix}-{token}"
    digest = hashlib.sha1(title.encode("utf-8")).hexdigest()[:10].upper()
    return f"XC2-{prefix}-{digest}"


def page_url(title: str) -> str:
    return "https://xenoblade2.cn/" + urllib.parse.quote(title, safe=":/・·!?！？")


def title_name(title: str) -> str:
    return title.split(":", 1)[-1]


def normalize_dot(value: str) -> str:
    return unicodedata.normalize("NFKC", value).replace("・", "·")


def quest_record(title: str, content: str) -> dict:
    fields = split_template(content, "任务")
    name = title_name(title)
    quest_type = clean_wikitext(fields.get("分类", "")) or "普通任务"
    source_id = fields.get("任务ID", "")
    is_expansion = name in EXPANSION_QUEST_NAMES or clean_wikitext(source_id).lower().startswith("qd")
    arc = "扩展票" if is_expansion else "本篇"
    condition = clean_wikitext(fields.get("条件", "")) or "随剧情或前置任务开放"
    region = clean_wikitext(fields.get("地点1", "")) or "随剧情变化"
    giver = clean_wikitext(fields.get("NPC", ""))
    if not giver:
        giver = "剧情自动触发" if quest_type == "主线任务" else "任务事件触发"
    description = clean_wikitext(fields.get("任务说明", ""))
    steps = quest_steps(content)
    sections: list[str] = []
    if description:
        sections.append(f"## 任务说明\n\n{description}")
    if steps:
        ordered_steps = "\n".join(f"{index}. {step.strip()}" for index, step in enumerate(steps.split(" → "), 1))
        sections.append(f"## 任务流程\n\n{ordered_steps}")
    details = [f"- **内容归属**：{arc}"]
    if name in FREE_UPDATE_QUEST_NAMES:
        details.append("- **版本说明**：Ver.1.4.0 免费更新追加，并非扩展票任务")
    details.append(f"- **资料核对**：[Xenoblade Wiki 地区汇总表]({REFERENCE_URL.replace('(', '%28').replace(')', '%29')})")
    sections.append("## 补充信息\n\n" + "\n".join(details))
    return {
        "id": stable_id("QUEST", source_id, title), "game": "XC2", "name": name,
        "type": quest_type, "chapter": f"{arc} · {condition}", "region": region,
        "giver": giver, "reward": reward_text(fields), "prerequisites": condition,
        "source": f"{PRIMARY_SOURCE}；{REFERENCE_SOURCE}", "sourceUrl": page_url(title),
        "status": "complete", "markerId": "", "isTimed": False,
        "isExclusive": False, "exclusiveGroup": "", "exclusiveRoute": "",
        "manualNotes": "", "notes": "\n\n".join(sections), "updatedAt": UPDATED_AT,
    }


def merc_record(title: str, content: str) -> dict:
    fields = split_template(content, "佣兵团任务")
    name = title_name(title)
    condition = clean_wikitext(fields.get("触发条件", "")) or "随地区发展度、佣兵团等级或关联任务开放"
    region = clean_wikitext(fields.get("地域", "")) or "地区未限定"
    description = clean_wikitext(fields.get("任务说明", ""))
    requirements: list[str] = []
    for index in range(1, 4):
        requirement = clean_wikitext(fields.get(f"任务条件{index}", ""))
        count = clean_wikitext(fields.get(f"任务条件数量{index}", ""))
        if requirement:
            requirements.append(f"{requirement} ×{count}" if count else requirement)
    recommended = [clean_wikitext(fields.get(f"推荐技能{index}", "")) for index in range(1, 4)]
    recommended = [value for value in recommended if value]
    duration = clean_wikitext(fields.get("所需时间", ""))
    is_expansion = name in EXPANSION_MERC_NAMES
    arc = "扩展票" if is_expansion else "本篇"
    sections: list[str] = []
    if description:
        sections.append(f"## 任务说明\n\n{description}")
    dispatch: list[str] = []
    if requirements:
        dispatch.append("- **编队条件**：" + "、".join(requirements))
    if recommended:
        dispatch.append("- **推荐技能**：" + "、".join(recommended))
    if duration:
        dispatch.append(f"- **基础时间**：{duration} 分钟")
    if dispatch:
        sections.append("## 派遣要求\n\n" + "\n".join(dispatch))
    sections.append("## 补充信息\n\n" + "\n".join([
        f"- **内容归属**：{arc}",
        f"- **资料核对**：[Xenoblade Wiki 佣兵团地区汇总表]({MERC_REFERENCE_URL})",
    ]))
    return {
        "id": stable_id("MERC", fields.get("任务ID", ""), title), "game": "XC2", "name": name,
        "type": "佣兵团任务", "chapter": f"{arc} · {condition}", "region": region,
        "giver": clean_wikitext(fields.get("限定队长", "")) or "佣兵团派遣",
        "reward": reward_text(fields, merc=True), "prerequisites": condition,
        "source": f"{PRIMARY_SOURCE}；{REFERENCE_SOURCE}", "sourceUrl": page_url(title),
        "status": "complete", "markerId": "", "isTimed": False, "isExclusive": False,
        "exclusiveGroup": "", "exclusiveRoute": "", "manualNotes": "",
        "notes": "\n\n".join(sections), "updatedAt": UPDATED_AT,
    }


def special_event_record(title: str, content: str) -> dict:
    name = title.rsplit("/", 1)[-1]
    source_id_match = re.search(r"\|任务ID\s*=\s*([^|}\n]+)", content)
    obtained = [clean_wikitext(value) for value in re.findall(r"\[\[获得物品::(?:[^\]|]+\|)?([^\]]+)\]\]", content)]
    description = special_event_markdown(content)
    return {
        "id": stable_id("EVENT", source_id_match.group(1) if source_id_match else "", title),
        "game": "XC2", "name": name, "type": "特殊事件", "chapter": "本篇 · 特殊条件触发",
        "region": "多地区或事件地点", "giver": "场景事件触发",
        "reward": " · ".join(obtained) or "事件限定奖励", "prerequisites": "满足页面所列角色、章节或调查条件",
        "source": PRIMARY_SOURCE, "sourceUrl": page_url(title), "status": "complete", "markerId": "",
        "isTimed": False, "isExclusive": False, "exclusiveGroup": "", "exclusiveRoute": "",
        "manualNotes": "", "notes": "\n\n".join(filter(None, [
            f"## 事件说明\n\n{description}" if description else "",
            "## 补充信息\n\n- **内容归属**：本篇",
        ])), "updatedAt": UPDATED_AT,
    }


def torna_record(title: str, content: str) -> dict:
    fields = split_template(content, "黄金之国任务")
    name = title_name(title)
    quest_type = clean_wikitext(fields.get("分类", "")) or "普通任务"
    condition = clean_wikitext(fields.get("条件", "")) or "随《黄金之国伊拉》剧情或人和之力开放"
    region = clean_wikitext(fields.get("地点1", "")) or "伊拉王国 / 古拉"
    description = clean_wikitext(fields.get("任务说明", ""))
    steps = quest_steps(content)
    community = clean_wikitext(fields.get("人和之力", ""))
    sections: list[str] = []
    if description:
        sections.append(f"## 任务说明\n\n{description}")
    if steps:
        ordered_steps = "\n".join(f"{index}. {step.strip()}" for index, step in enumerate(steps.split(" → "), 1))
        sections.append(f"## 任务流程\n\n{ordered_steps}")
    details = ["- **内容归属**：黄金之国伊拉"]
    if community:
        details.append(f"- **人和相关**：{community}")
    details.append(f"- **资料核对**：[Xenoblade Wiki《黄金之国伊拉》汇总表]({REFERENCE_URL.replace('(', '%28').replace(')', '%29')})")
    sections.append("## 补充信息\n\n" + "\n".join(details))
    return {
        "id": stable_id("TORNA", fields.get("任务ID", ""), title), "game": "XC2", "name": name,
        "type": quest_type, "chapter": f"黄金之国伊拉 · {condition}", "region": region,
        "giver": community or ("剧情自动触发" if quest_type == "主线任务" else "当地居民 / 事件触发"),
        "reward": reward_text(fields), "prerequisites": condition,
        "source": f"{PRIMARY_SOURCE}；{REFERENCE_SOURCE}", "sourceUrl": page_url(title),
        "status": "complete", "markerId": "", "isTimed": False, "isExclusive": False,
        "exclusiveGroup": "", "exclusiveRoute": "", "manualNotes": "",
        "notes": "\n\n".join(sections), "updatedAt": UPDATED_AT,
    }


def build_catalog() -> list[dict]:
    quest_titles = semantic_quest_titles()
    quest_pages = page_contents(quest_titles)
    quests = [quest_record(title, quest_pages[title]) for title in quest_titles]

    merc_titles = all_pages(3300)
    merc_pages = page_contents(merc_titles)
    quests.extend(merc_record(title, merc_pages[title]) for title in merc_titles)

    event_titles = all_pages(0, "特殊事件/")
    event_pages = page_contents(event_titles)
    quests.extend(special_event_record(title, event_pages[title]) for title in event_titles)

    torna_titles = [title for title in all_pages(5300) if "/" not in title]
    torna_pages = page_contents(torna_titles)
    deduplicated: dict[str, str] = {}
    for title in torna_titles:
        key = normalize_dot(title)
        existing = deduplicated.get(key)
        if not existing or "#REDIRECT" not in torna_pages[title].upper():
            deduplicated[key] = title
    quests.extend(torna_record(title, torna_pages[title]) for title in deduplicated.values())

    ids = [quest["id"] for quest in quests]
    if len(ids) != len(set(ids)):
        duplicates = sorted({value for value in ids if ids.count(value) > 1})
        raise ValueError(f"duplicate ids: {duplicates}")
    return sorted(quests, key=lambda quest: quest["id"])


def validate_catalog(quests: list[dict]) -> dict[str, int]:
    type_counts: dict[str, int] = {}
    for quest in quests:
        type_counts[quest["type"]] = type_counts.get(quest["type"], 0) + 1
    arc_counts = {
        "本篇": sum(quest["chapter"].startswith("本篇 ·") for quest in quests),
        "扩展票": sum(quest["chapter"].startswith("扩展票 ·") for quest in quests),
        "黄金之国伊拉": sum(quest["chapter"].startswith("黄金之国伊拉 ·") for quest in quests),
    }
    expected_types = {"主线任务": 15, "普通任务": 163, "异刃任务": 32, "佣兵团任务": 274, "特殊事件": 9}
    if type_counts != expected_types:
        raise ValueError(f"unexpected type counts: {type_counts}")
    if len(quests) != 493:
        raise ValueError(f"expected 493 records, got {len(quests)}")
    if arc_counts["黄金之国伊拉"] != 58:
        raise ValueError(f"expected 58 Torna quests, got {arc_counts['黄金之国伊拉']}")
    if arc_counts["扩展票"] != 52:
        raise ValueError(f"expected 52 Expansion Pass records, got {arc_counts['扩展票']}")
    if any(quest["isTimed"] or quest["isExclusive"] for quest in quests):
        raise ValueError("XC2 records must not use timed or mutually exclusive flags")
    required = ("id", "name", "type", "chapter", "region", "giver", "reward", "sourceUrl")
    incomplete = [quest["id"] for quest in quests if any(not str(quest[key]).strip() for key in required)]
    if incomplete:
        raise ValueError(f"records with missing required fields: {incomplete[:10]}")
    return {"total": len(quests), **type_counts, **arc_counts}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("data/xc2-quests.json"))
    args = parser.parse_args()
    quests = build_catalog()
    report = validate_catalog(quests)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(quests, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
