#!/usr/bin/env python3
"""Build the Xenoblade Chronicles 3 quest catalog from xenoblade3.cn.

The primary site renders a Next.js wiki rather than exposing the MediaWiki API
used by the XC1/XC2 sources.  This scraper therefore follows the four public
quest indexes and parses the semantic HTML of every quest page.  Xenoblade Wiki
is recorded as a classification/count cross-check, never as the source of the
Chinese task text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path


BASE_URL = "https://xenoblade3.cn"
PRIMARY_SOURCE = "送行者的收集手册"
REFERENCE_SOURCE = "Xenoblade Wiki（分类与数量核对）"
REFERENCE_URLS = {
    "主线剧情": "https://xenoblade.fandom.com/wiki/Main_Story_Quest_(XC3)",
    "英雄任务": "https://xenoblade.fandom.com/wiki/Hero_Quest",
    "普通任务": "https://xenoblade.fandom.com/wiki/Standard_Quest",
}
UPDATED_AT = "2026-08-12"
CACHE_DIRECTORY = Path("work/xc3-cache")

INDEXES = {
    "story": ("/任务/主线剧情", "/任务/主线剧情/"),
    "hero": ("/任务/英雄任务", "/任务/英雄任务/"),
    "standard": ("/任务/普通任务", "/任务/普通任务/"),
    "future": ("/崭新的未来/任务", "/崭新的未来/任务/"),
}
EXPECTED_COUNTS = {"story": 7, "hero": 42, "standard": 155, "future": 42}

EXPANSION_PASS_QUESTS = {
    "DX的改造委托",
    "以太告急！！",
    "诺彭守护者",
    "我是机械师",
    "宝石巧匠",
    "情之所钟",
}

BROKEN_PRIMARY_PAGE = "/任务/普通任务/让艾塞尔成长"
ETHEL_REFERENCE_URL = (
    "https://www.gamerguides.com/xenoblade-chronicles-3/guide/hero-quests/"
    "ethel/ascension-quest-how-to-undergo-the-maturation-process"
)
ETHEL_SECONDARY_URL = (
    "https://gamefaqs.gamespot.com/boards/357204-xenoblade-chronicles-3/80110601"
)

REGION_NAMES = (
    "亚艾提亚地区",
    "佛尼斯地区",
    "潘特拉斯地区",
    "嘉登西亚地区",
    "科维斯主堡",
    "安格努斯主堡",
    "利嘉德收容所",
    "都市",
    "始源",
)

FUTURE_REGION_NAMES = (
    "拉古纳利亚遗迹群",
    "极光平原",
    "伊格斯荒野",
    "黑色山脉",
    "9号殖民地",
    "森托姆尼亚地区",
)

STEP_KINDS = {
    "行动", "交流", "收集", "调查", "追踪", "对话", "讨伐", "目的地",
    "护卫", "搜索", "跟随", "等待", "送行", "修理", "交付", "选择",
}

BLOCK_TAGS = {
    "article", "br", "dd", "div", "dl", "dt", "figcaption", "figure",
    "h1", "h2", "h3", "h4", "h5", "h6", "li", "p", "section", "td",
    "th", "tr", "ul", "ol",
}


def fetch(url: str, retries: int = 4) -> str:
    cache_path = CACHE_DIRECTORY / f"{hashlib.sha1(url.encode('utf-8')).hexdigest()}.html"
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8")
    request = urllib.request.Request(url, headers={"User-Agent": "xeno-archive/1.0"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                content = response.read().decode("utf-8")
                CACHE_DIRECTORY.mkdir(parents=True, exist_ok=True)
                cache_path.write_text(content, encoding="utf-8")
                return content
        except Exception:
            if attempt + 1 == retries:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("unreachable")


def absolute_url(path: str) -> str:
    quoted = urllib.parse.quote(path, safe="/%:@!！?？·＆DX")
    return urllib.parse.urljoin(BASE_URL, quoted)


def decoded_path(href: str) -> str:
    return urllib.parse.unquote(urllib.parse.urlsplit(href).path)


class DirectoryParser(HTMLParser):
    """Collect quest links and the surrounding section headings."""

    def __init__(self, prefix: str) -> None:
        super().__init__(convert_charrefs=True)
        self.prefix = prefix
        self.in_main = 0
        self.ignored: list[str] = []
        self.heading_level = 0
        self.heading_parts: list[str] = []
        self.headings: dict[int, str] = {}
        self.links: list[tuple[str, tuple[str, ...]]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag == "main":
            self.in_main += 1
            return
        if not self.in_main:
            return
        if self.ignored:
            if tag == self.ignored[-1]:
                self.ignored.append(tag)
            return
        if tag in {"aside", "nav", "script", "style", "svg"}:
            self.ignored.append(tag)
            return
        if re.fullmatch(r"h[2-5]", tag):
            self.heading_level = int(tag[1])
            self.heading_parts = []
        if tag == "a" and (href := attrs_dict.get("href")):
            path = decoded_path(href)
            tail = path[len(self.prefix):] if path.startswith(self.prefix) else ""
            if tail and "/" not in tail:
                trail = tuple(self.headings[level] for level in sorted(self.headings))
                self.links.append((path, trail))

    def handle_endtag(self, tag: str) -> None:
        if tag == "main" and self.in_main:
            self.in_main -= 1
            return
        if not self.in_main:
            return
        if self.ignored:
            if tag == self.ignored[-1]:
                self.ignored.pop()
            return
        if self.heading_level and tag == f"h{self.heading_level}":
            value = clean_inline("".join(self.heading_parts))
            if value:
                self.headings = {
                    level: text for level, text in self.headings.items()
                    if level < self.heading_level
                }
                self.headings[self.heading_level] = value
            self.heading_level = 0
            self.heading_parts = []

    def handle_data(self, data: str) -> None:
        if self.in_main and not self.ignored and self.heading_level:
            self.heading_parts.append(data)


class MainTextParser(HTMLParser):
    """Extract readable text from the article main while excluding navigation."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_main = 0
        self.ignored: list[str] = []
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "main":
            self.in_main += 1
            return
        if not self.in_main:
            return
        if self.ignored:
            if tag == self.ignored[-1]:
                self.ignored.append(tag)
            return
        if tag in {"aside", "nav", "script", "style", "svg", "footer"}:
            self.ignored.append(tag)
            return
        if tag in BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag == "main" and self.in_main:
            self.in_main -= 1
            return
        if not self.in_main:
            return
        if self.ignored:
            if tag == self.ignored[-1]:
                self.ignored.pop()
            return
        if tag in BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.in_main and not self.ignored:
            self.parts.append(data)

    def lines(self) -> list[str]:
        text = "".join(self.parts).replace("\xa0", " ")
        lines: list[str] = []
        for raw in text.splitlines():
            value = clean_inline(raw)
            if value and (not lines or value != lines[-1]):
                lines.append(value)
        if "QQ群 291964224" in lines:
            lines = lines[:lines.index("QQ群 291964224")]
        return lines


def clean_inline(value: str) -> str:
    value = re.sub(r"\s+", " ", value or "")
    return value.strip()


def directory_entries(kind: str, html: str) -> list[dict[str, object]]:
    _, prefix = INDEXES[kind]
    parser = DirectoryParser(prefix)
    parser.feed(html)
    entries: dict[str, tuple[str, ...]] = {}
    for path, headings in parser.links:
        entries.setdefault(path, headings)
    if len(entries) != EXPECTED_COUNTS[kind]:
        raise RuntimeError(
            f"{kind} index returned {len(entries)} links; expected {EXPECTED_COUNTS[kind]}"
        )
    return [
        {"kind": kind, "path": path, "headings": list(headings)}
        for path, headings in sorted(entries.items())
    ]


def find_index(lines: list[str], label: str, start: int = 0) -> int:
    try:
        return lines.index(label, start)
    except ValueError:
        return -1


def text_between(lines: list[str], start_label: str, end_label: str) -> list[str]:
    start = find_index(lines, start_label)
    if start < 0:
        return []
    end = find_index(lines, end_label, start + 1)
    return lines[start + 1:end if end >= 0 else len(lines)]


def next_number(lines: list[str], label: str) -> str:
    index = find_index(lines, label)
    if index < 0:
        return ""
    for value in lines[index + 1:index + 5]:
        if match := re.search(r"\d[\d,]*", value):
            return match.group(0).replace(",", "")
    return ""


def merge_tokens(values: list[str]) -> str:
    ignored = {"任务", "已完成", "触发任务"}
    cleaned = [value for value in values if value not in ignored]
    text = "；".join(cleaned)
    text = re.sub(r"；([，。！？])", r"\1", text)
    text = re.sub(r"([，。！？])；", r"\1", text)
    text = re.sub(r"[；]{2,}", "；", text)
    return text.strip("；")


def chapter_from(values: list[str], fallback: str = "") -> str:
    text = " ".join(values)
    match = re.search(r"第\s*([一二三四五六七八九十0-9]+)\s*章", text)
    value = match.group(1) if match else re.sub(r"^第|章$", "", fallback)
    numbers = {
        "一": "1", "二": "2", "三": "3", "四": "4", "五": "5",
        "六": "6", "七": "7", "八": "8", "九": "9", "十": "10",
    }
    return f"第{numbers.get(value, value)}章" if value else ""


def region_from(values: list[str], headings: list[str], kind: str) -> str:
    haystack = " ".join(values)
    if kind == "future":
        for region in FUTURE_REGION_NAMES:
            if region in haystack:
                return region
        return "崭新的未来"
    heading_parts = [
        value.replace("&", "、") for value in headings
        if value not in {"普通任务", "英雄任务", "主线剧情", "主线必做任务"}
        and value != "崭新的未来任务列表"
        and not re.fullmatch(r"第[一二三四五六七0-9]+章", value)
    ]
    heading_parts = [value for value in heading_parts if not value.endswith("地区其他任务")]
    heading_region = " · ".join(heading_parts[-2:])
    if heading_region:
        return heading_region
    for region in REGION_NAMES:
        if region in haystack:
            return region
    return "多地区" if kind == "story" else "随任务地点变化"


def level_from(lines: list[str]) -> str:
    for value in lines[:30]:
        if match := re.fullmatch(r"Lv\s*(\d+)", value, flags=re.I):
            return match.group(1)
    return ""


def giver_from(prerequisite_lines: list[str], quest_type: str) -> str:
    joined = "；".join(prerequisite_lines)
    patterns = (
        r"与；?([^；]{1,24})；?对话",
        r"和；?([^；]{1,24})；?对话",
        r"从；?([^；]{1,24})；?处(?:接取|接受)",
    )
    for pattern in patterns:
        if match := re.search(pattern, joined):
            return match.group(1).strip()
    return "剧情自动推进" if quest_type == "主线剧情" else "情报、对话或场景触发"


def reward_from(lines: list[str]) -> str:
    rewards: list[str] = []
    for label, suffix in (("经验值", "EXP"), ("报酬金额", "G"), ("SP", "SP")):
        value = next_number(lines, label)
        if value and value != "0":
            rewards.append(f"{value}{suffix}" if suffix == "G" else f"{suffix} {value}")

    bond_index = find_index(lines, "殖民地牵绊")
    if bond_index >= 0:
        bond = lines[bond_index + 1:bond_index + 5]
        number = next((value for value in bond if re.fullmatch(r"\d+", value)), "")
        colony = next((value for value in bond if value not in {number, "pt"}), "")
        if number:
            rewards.append(f"{colony or '殖民地'}牵绊 {number}pt")

    boundary_candidates = [index for index in (
        find_index(lines, "任务条件"), find_index(lines, "任务流程")
    ) if index >= 0]
    boundary = min(boundary_candidates) if boundary_candidates else len(lines)
    reward_indexes = [index for index, value in enumerate(lines[:boundary]) if value == "报酬"]
    if reward_indexes:
        items = lines[reward_indexes[-1] + 1:boundary]
        index = 0
        while index < len(items):
            item = items[index]
            if index + 1 < len(items) and re.fullmatch(r"[x×]\d+", items[index + 1], flags=re.I):
                item += f" ×{re.sub(r'\D', '', items[index + 1])}"
                index += 1
            if item not in {"无", "-"}:
                rewards.append(item)
            index += 1
    return " · ".join(dict.fromkeys(rewards)) or "任务完成报酬"


def flow_markdown(lines: list[str]) -> str:
    if not lines:
        return "1. 按主来源页面的任务指引推进。"
    steps: list[tuple[str, list[str]]] = []
    current_kind = "行动"
    current: list[str] = []
    for value in lines:
        if value in STEP_KINDS:
            if current:
                steps.append((current_kind, current))
            current_kind = value
            current = []
        else:
            current.append(value)
    if current:
        steps.append((current_kind, current))
    if not steps:
        steps = [("行动", lines)]
    rendered: list[str] = []
    for index, (kind, values) in enumerate(steps, 1):
        detail = merge_tokens(values)
        rendered.append(f"{index}. **{kind}**：{detail or '按任务指引推进'}")
    return "\n".join(rendered)


def stable_id(kind: str, name: str) -> str:
    digest = hashlib.sha1(f"{kind}:{name}".encode("utf-8")).hexdigest()[:10].upper()
    labels = {"story": "STORY", "hero": "HERO", "standard": "STANDARD", "future": "FR"}
    return f"XC3-{labels[kind]}-{digest}"


def parse_quest(entry: dict[str, object], html: str) -> dict[str, object]:
    kind = str(entry["kind"])
    path = str(entry["path"])
    headings = [str(value) for value in entry["headings"]]
    name = path.rsplit("/", 1)[-1]
    parser = MainTextParser()
    parser.feed(html)
    lines = parser.lines()
    if not lines or lines[0] != name:
        raise RuntimeError(f"could not identify article for {path}")

    level = level_from(lines)
    reward_boundary = find_index(lines, "经验值")
    result_index = find_index(lines, "结果")
    summary_start = result_index + 1 if result_index >= 0 else 1
    summary_lines = lines[summary_start:reward_boundary if reward_boundary >= 0 else summary_start]
    prerequisites_lines = text_between(lines, "任务条件", "任务流程")
    flow_index = find_index(lines, "任务流程")
    flow_lines = lines[flow_index + 1:] if flow_index >= 0 else []

    if kind == "future" and re.fullmatch(r"第[1-5]章", name):
        quest_type = "主线剧情"
    else:
        quest_type = {"story": "主线剧情", "hero": "英雄任务"}.get(kind, "普通任务")

    if kind == "future":
        arc = "崭新的未来"
    elif name in EXPANSION_PASS_QUESTS:
        arc = "扩展票"
    else:
        arc = "本篇"
    fallback_chapter = name if quest_type == "主线剧情" and "章" in name else ""
    chapter = chapter_from(lines + headings, fallback_chapter)
    if not chapter:
        chapter = "通关后" if "通关" in " ".join(prerequisites_lines) else "随剧情或前置任务开放"

    prerequisites = merge_tokens(prerequisites_lines) or (
        "随主线剧情自动推进" if quest_type == "主线剧情" else "满足章节、情报或前置任务条件"
    )
    region = region_from(prerequisites_lines + flow_lines[:30], headings, kind)
    giver = giver_from(prerequisites_lines, quest_type)
    reference_url = REFERENCE_URLS[quest_type]
    notes_sections: list[str] = []
    summary = merge_tokens(summary_lines)
    if summary:
        notes_sections.append(f"## 任务说明\n\n{summary}")
    notes_sections.append(f"## 任务条件\n\n{prerequisites}")
    notes_sections.append(f"## 任务流程\n\n{flow_markdown(flow_lines)}")
    verification = [
        f"- **内容归属**：{arc}",
        f"- **推荐等级**：{'Lv' + level if level else '主来源未标注'}",
        f"- **目录核对**：[Xenoblade Wiki]({reference_url.replace('(', '%28').replace(')', '%29')})",
    ]
    notes_sections.append("## 核验信息\n\n" + "\n".join(verification))

    return {
        "id": stable_id(kind, name),
        "game": "XC3",
        "name": name,
        "type": quest_type,
        "chapter": f"{arc} · {chapter}",
        "region": region,
        "giver": giver,
        "reward": reward_from(lines),
        "prerequisites": prerequisites,
        "source": f"{PRIMARY_SOURCE}；{REFERENCE_SOURCE}",
        "sourceUrl": absolute_url(path),
        "status": "complete",
        "markerId": "",
        "isTimed": False,
        "isExclusive": False,
        "exclusiveGroup": "",
        "exclusiveRoute": "",
        "manualNotes": "",
        "notes": "\n\n".join(notes_sections),
        "updatedAt": UPDATED_AT,
    }


def ethel_growth_record() -> dict[str, object]:
    """Fill the primary directory's one broken link from two independent guides."""
    name = "让艾塞尔成长"
    prerequisites = (
        "完成英雄任务“祸根”；任一角色的闪光击剑士与炼世士职阶均达到Rank 10；"
        "让卡姆纳维加入队伍"
    )
    notes = "\n\n".join([
        "## 事件说明\n\n"
        "该条目收录在主站普通任务目录中，但不会作为正式任务进入游戏任务日志。完成后艾塞尔恢复成长，"
        "并同时解锁闪光击剑士与炼世士的Rank 20上限。",
        f"## 任务条件\n\n{prerequisites}",
        "## 任务流程\n\n"
        "1. **编队**：确认闪光击剑士与炼世士均已由任一角色练到Rank 10，并让卡姆纳维入队。\n"
        "2. **目的地**：返回亚艾提亚地区的欧米伽殖民地，进入研究室。\n"
        "3. **行动**：进入平时关闭的内门，调查成长舱并同意让艾塞尔成长；若选择拒绝，可再次调查。",
        "## 核验信息\n\n"
        "- **内容归属**：本篇\n"
        "- **目录状态**：主站目录存在该项，但详情页返回404\n"
        f"- **流程核对**：[Gamer Guides]({ETHEL_REFERENCE_URL})、"
        f"[GameFAQs]({ETHEL_SECONDARY_URL})",
    ])
    return {
        "id": stable_id("standard", name),
        "game": "XC3",
        "name": name,
        "type": "普通任务",
        "chapter": "本篇 · 第7章",
        "region": "亚艾提亚地区 · 欧米伽殖民地",
        "giver": "成长舱事件",
        "reward": "艾塞尔重新加入 · 闪光击剑士与炼世士Rank上限提升至20",
        "prerequisites": prerequisites,
        "source": f"{PRIMARY_SOURCE}（目录）；Gamer Guides；GameFAQs",
        "sourceUrl": ETHEL_REFERENCE_URL,
        "status": "complete",
        "markerId": "",
        "isTimed": False,
        "isExclusive": False,
        "exclusiveGroup": "",
        "exclusiveRoute": "",
        "manualNotes": "",
        "notes": notes,
        "updatedAt": UPDATED_AT,
    }


def validate(quests: list[dict[str, object]]) -> None:
    ids = [str(quest["id"]) for quest in quests]
    if len(quests) != sum(EXPECTED_COUNTS.values()):
        raise RuntimeError(f"generated {len(quests)} records; expected 246")
    if len(ids) != len(set(ids)):
        raise RuntimeError("generated duplicate quest IDs")
    if any(not quest[field] for quest in quests for field in (
        "name", "type", "chapter", "region", "giver", "reward",
        "prerequisites", "source", "sourceUrl", "notes",
    )):
        raise RuntimeError("one or more generated quests is missing a required field")
    type_counts = {
        name: sum(quest["type"] == name for quest in quests)
        for name in ("主线剧情", "英雄任务", "普通任务")
    }
    arc_counts = {
        name: sum(str(quest["chapter"]).startswith(name + " ·") for quest in quests)
        for name in ("本篇", "扩展票", "崭新的未来")
    }
    if type_counts != {"主线剧情": 12, "英雄任务": 42, "普通任务": 192}:
        raise RuntimeError(f"unexpected type counts: {type_counts}")
    if arc_counts != {"本篇": 198, "扩展票": 6, "崭新的未来": 42}:
        raise RuntimeError(f"unexpected content counts: {arc_counts}")
    if any(quest["isTimed"] or quest["isExclusive"] for quest in quests):
        raise RuntimeError("XC3 catalog must not contain timed or exclusive flags")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/xc3-quests.json")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--cache-dir", default="work/xc3-cache")
    args = parser.parse_args()

    global CACHE_DIRECTORY
    CACHE_DIRECTORY = Path(args.cache_dir)

    entries: list[dict[str, object]] = []
    for kind, (index_path, _) in INDEXES.items():
        entries.extend(directory_entries(kind, fetch(absolute_url(index_path))))

    records: list[dict[str, object]] = [ethel_growth_record()]
    print(f"Used cross-checked fallback for {BROKEN_PRIMARY_PAGE}")
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {
            executor.submit(fetch, absolute_url(str(entry["path"]))): entry
            for entry in entries
            if entry["path"] != BROKEN_PRIMARY_PAGE
        }
        for completed, future in enumerate(as_completed(futures), 1):
            entry = futures[future]
            try:
                records.append(parse_quest(entry, future.result()))
            except Exception as error:
                raise RuntimeError(f"failed to fetch or parse {entry['path']}") from error
            if completed % 25 == 0 or completed == len(futures):
                print(f"Fetched {completed}/{len(futures)} quest pages")

    records.sort(key=lambda quest: (str(quest["chapter"]), str(quest["type"]), str(quest["name"])))
    validate(records)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(records)} verified quests to {output}")


if __name__ == "__main__":
    main()
