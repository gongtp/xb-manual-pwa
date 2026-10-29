#!/usr/bin/env python3
"""Rebuild the Simplified Chinese XC2 character directory from game-data pages.

Scope: the original Nintendo Switch game, its free updates / Expansion Pass,
and the nine playable Torna party members. Switch 2 Edition additions and
randomly generated Common Blades are intentionally outside this directory.
Biographies are original short summaries; structured facts and artwork are
attributed to their source page. This script never opens the progress database.

Use --offline to rebuild from the cached source pages and --skip-images to
leave the currently downloaded artwork alone. The Python standard library is
the only dependency.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "work" / "xc2-characters-sources"
OUTPUT = ROOT / "data" / "xc2-characters.json"
IMAGES = ROOT / "public" / "images" / "xc2"
API = "https://xenoblade2.cn/api.php"
UPDATED = "2026-10-03"
DRIVERS = ["莱克斯", "尼娅", "虎", "梅勒芙", "齐格", "凡达姆", "真"]
TORNA_DRIVERS = ["劳拉", "阿德尔", "尤格"]
TORNA_BLADES = ["真", "霞", "光", "米诺奇", "迦具土", "绵津见"]
ENGLISH_DRIVERS = {"莱克斯": "Rex", "尼娅": "Nia", "虎": "Tora", "梅勒芙": "Morag", "齐格": "Zeke", "凡达姆": "Vandham", "真": "Jin"}
DRIVER_ACQUISITION = {"莱克斯": "序章主线剧情", "尼娅": "第1章主线剧情", "虎": "第2章主线剧情", "梅勒芙": "第4章主线剧情", "齐格": "第5章主线剧情", "凡达姆": "第3章临时加入", "真": "第8章临时可操作，身份为异刃"}
DESCRIPTIONS = {
    "莱克斯": "以打捞为生的少年，与焰结伴踏上寻找乐园的旅途。",
    "尼娅": "与白虎同行的御刃者，在队伍中善于运用回复力量。",
    "虎": "喜爱机械的诺彭少年，借助亲手制造的人造异刃花参与战斗。",
    "梅勒芙": "斯佩比亚帝国的特别执政官，与迦具土共同守护国家。",
    "齐格": "来自洛修利亚的王子，与搭档彩歌一起旅行。",
    "凡达姆": "英维迪亚佣兵团的首领，是莱克斯第3章的临时队友。",
    "真": "秘密结社伊拉的成员；本篇第8章可以短暂操作这位异刃。",
    "异刃:焰": "温柔而坚定的天之圣杯，与莱克斯共同寻找乐园。",
    "异刃:光": "天之圣杯的另一面，以光属性力量和暴击相关技能支援战斗。",
    "异刃:觉醒圣杯": "焰与光解放力量后的战斗形态，与原有两份档案共享角色身份。",
    "异刃:白虎": "尼娅的忠实搭档，以双环刃和水属性力量协助队伍。",
    "异刃:花JS": "虎制造的人造异刃花的初始形态，可通过花的定制调整性能。",
    "异刃:花JK": "花的强化形态，可通过花的定制改变属性、类别与能力修正。",
    "异刃:花JD": "花进一步强化后的形态，使用花之佩剑并保留定制能力。",
    "异刃:朱雀": "使用双镰刀的风属性异刃，在剧情中与凡达姆和莱克斯并肩作战。",
    "异刃:迦具土": "斯佩比亚的皇家异刃，与梅勒芙搭档使用火属性军刀。",
    "异刃:彩歌": "齐格的雷属性搭档，使用大剑并具有三个辅助核心插槽。",
    "异刃:尼娅": "尼娅在主线中展现的异刃身份，以水属性回复能力支援莱克斯。",
    "异刃:绵津见": "冷静的皇家护卫，获得其核心水晶后可与梅勒芙调谐。",
    "异刃:红莲": "热衷于伸张正义的冰属性异刃，以战锤守护同伴。",
    "异刃:力男": "使用长枪的地属性攻击型异刃，具备怪力与集中力等场景技能。",
    "异刃:婆娑罗": "使用刀的暗属性防御型异刃，可通过核心水晶调谐加入。",
    "异刃:鸣": "使用长枪的暗属性异刃，可通过核心水晶调谐加入队伍。",
    "异刃:玛瑙": "使用战斧的地属性异刃，具备矿物学与观察眼等场景技能。",
    "异刃:雄黄": "持战斧作战的水属性异刃，拥有观察眼与糕点师等场景技能。",
    "异刃:韦驮天": "使用弹击球的风属性回复型异刃，拥有独特的食物相关能力。",
    "异刃:宫比罗": "自称王者的火属性异刃，可通过专属任务唤醒进一步的力量。",
    "异刃:宫比罗(觉醒)": "完成王的威光后强化的宫比罗，属于同一异刃的觉醒形态。",
    "异刃:重音": "以战锤作战的暗属性防御型异刃，可通过核心水晶调谐加入。",
    "异刃:水分": "与星织有深厚联系的水属性异刃，通过任务获得专属核心水晶。",
    "异刃:星织": "与水分相伴的冰属性剑士，通过异刃的记忆获得专属核心水晶。",
    "异刃:时叶": "使用长枪的冰属性异刃，通过独有的异刃任务认识伙伴。",
    "异刃:石榴": "使用钩爪拳套的雷属性回复型异刃，可通过核心水晶调谐加入。",
    "异刃:蓟": "持以太巨炮的暗属性异刃，专属技能与对伙伴的关注有关。",
    "异刃:七冰": "带着伙伴熊参与战斗的冰属性异刃，也拥有歌唱相关的专属能力。",
    "异刃:纽兹": "使用刀的火属性防御型异刃，具有较高的最大HP修正。",
    "异刃:宇迦": "使用钩爪拳套的地属性回复型异刃，拥有鱼类学等场景技能。",
    "异刃:凛音": "喜爱金钱与茶会的水属性异刃，通过购买传承的核心水晶加入。",
    "异刃:结": "以弹击球支援同伴的雷属性异刃，拥有饭团行家的专属能力。",
    "异刃:式": "求知欲旺盛的风属性异刃，古代文明知识是其重要场景能力。",
    "异刃:雷鼓": "手持战锤的雷属性异刃，在冒险中逐渐掌握自己的力量。",
    "异刃:八重切": "使用战斧的风属性异刃，拥有三个辅助核心插槽。",
    "异刃:伊吹": "使用战锤的风属性异刃，以防御类别和敏捷修正支援队伍。",
    "异刃:萤": "使用弹击球的地属性回复型异刃，可通过核心水晶调谐加入。",
    "异刃:KOS-MOS Re:": "使用以太巨炮的光属性异刃，具备三个辅助核心插槽。",
    "异刃:天威": "使用以太巨炮的雷属性异刃，以力量修正和攻击类别参与战斗。",
    "异刃:月": "使用弹击球的冰属性回复型异刃，可通过核心水晶调谐加入。",
    "异刃:T-elos Re:": "通关主线后进入调谐池的暗属性异刃，属于原版免费更新内容。",
    "异刃:花巴斯塔": "通过扩展票任务加入的人造异刃，可与虎以外的御刃者搭档。",
    "异刃:修尔克": "来自异界的光属性异刃，在挑战之地加入并使用莫纳德。",
    "异刃:菲奥伦": "来自异界的风属性回复型异刃，在挑战之地与修尔克一同加入。",
    "异刃:神八": "通过扩展票获得的光属性异刃，使用打刀并拥有三个辅助核心插槽。",
    "异刃:火花": "通过扩展票获得的火属性异刃，以弹击球和回复类别支援队伍。",
    "异刃:艾尔玛": "来自异界的暗属性异刃，通过挑战之地的专属战斗加入。",
    "异刃:义经": "伊拉的雷属性成员，在二周目中可通过核心水晶调谐加入。",
    "异刃:弁庆": "伊拉的地属性成员，在二周目中以长刀参与攻击。",
    "异刃:佐田彦": "伊拉的暗属性成员，在二周目第9章后通过对话加入队伍。",
    "异刃:神威": "伊拉的雷属性异刃，在二周目中使用小太刀作战。",
    "异刃:罗候": "伊拉的火属性异刃，在二周目中以大炮参与战斗。",
    "异刃:大锤": "伊拉的地属性防御型异刃，在二周目中使用手甲作战。",
    "异刃:斩铁": "伊拉的风属性防御型异刃，在二周目中使用旋棍作战。",
    "异刃:灭": "伊拉成员与天之圣杯之一；本篇不能将他作为队伍异刃获得。",
    "黄金之国伊拉:劳拉": "与真和霞组成小队的御刃者，在圣杯大战时期展开旅程。",
    "黄金之国伊拉:阿德尔": "伊拉的王子，与光和米诺奇组成小队应对圣杯大战。",
    "黄金之国伊拉:尤格": "斯佩比亚的年轻皇帝，与迦具土和绵津见组成防御见长的小队。",
    "黄金之国伊拉:真": "劳拉小队的冰属性异刃，以太刀和快速斩击参与战斗。",
    "黄金之国伊拉:霞": "劳拉小队的风属性异刃，以锡杖和回复能力协助同伴。",
    "黄金之国伊拉:光": "阿德尔小队的天之圣杯，在黄金之国以独立的战斗系统作战。",
    "黄金之国伊拉:米诺奇": "阿德尔小队的暗属性成员，以枪刀参与攻击与支援。",
    "黄金之国伊拉:迦具土": "尤格小队的火属性异刃，以军刀守护斯佩比亚的皇帝。",
    "黄金之国伊拉:绵津见": "尤格小队的水属性异刃，与迦具土一同执行皇室护卫职责。",
}


def read_url(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "xeno-archive/1.0 (Simplified Chinese character catalog)"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                return response.read()
        except Exception:
            if attempt == 3:
                raise
            time.sleep(1 + attempt)
    raise RuntimeError("unreachable")


def api_get(params: dict) -> dict:
    return json.loads(read_url(API + "?" + urllib.parse.urlencode({"format": "json", **params})))


def fetch_raw(titles: list[str]) -> dict[str, str]:
    result = {}
    for start in range(0, len(titles), 40):
        payload = api_get({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "titles": "|".join(titles[start:start + 40])})
        for page in payload["query"]["pages"].values():
            revisions = page.get("revisions") or []
            if not revisions:
                raise ValueError(f"Source page missing: {page['title']}")
            result[page["title"]] = revisions[0]["slots"]["main"]["*"]
    return result


def clean(value: str) -> str:
    value = re.sub(r"\[\[([^\]]+)\]\]", lambda m: m[1].split("|")[-1].split("::")[-1], value)
    value = re.sub(r"<br\s*/?>|</br>", "；", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    value = value.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def template_fields(text: str) -> dict[str, str]:
    # Only the opening infobox; later ability templates have unrelated keys.
    opening = text.split("}}", 1)[0] if text.lstrip().startswith("{{BladeInfo") else ""
    return {m[1].strip(): clean(m[2]) for m in re.finditer(r"^\|([^=\n]+)=([^\n]*)", opening, re.M)}


def section(text: str, heading: str) -> str:
    match = re.search(r"^(={2,4})\s*" + re.escape(heading) + r"\s*\1\s*$", text, re.M)
    if not match:
        return ""
    tail = text[match.end():]
    end = re.search(r"^={2," + str(len(match[1])) + r"}[^=].*?={2," + str(len(match[1])) + r"}\s*$", tail, re.M)
    return tail[:end.start()] if end else tail


def wiki_rows(text: str) -> list[list[str]]:
    rows = []
    for block in re.split(r"\n\|-\s*\n", text):
        row = []
        for line in block.splitlines():
            if not line.startswith(("|", "!")) or line.startswith(("{|", "|}", "|+")):
                continue
            for cell in re.split(r"\|\||!!", line[1:]):
                if re.match(r"\s*(class|style|colspan|rowspan)\s*=", cell):
                    cell = cell.split("|", 1)[-1]
                row.append(clean(cell))
        if row:
            rows.append(row)
    return rows


class RenderedRows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows: list[list[str]] = []
        self.row: list[str] | None = None
        self.cell: list[str] | None = None
        self.heading = ""
        self.heading_text: list[str] | None = None
        self.heading_rows: list[tuple[str, list[str]]] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("h2", "h3", "h4"):
            self.heading_text = []
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.cell = []
        elif tag == "br" and self.cell is not None:
            self.cell.append("；")

    def handle_data(self, data):
        if self.heading_text is not None:
            self.heading_text.append(data)
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("h2", "h3", "h4") and self.heading_text is not None:
            self.heading = re.sub(r"\s*\[编辑\]\s*$", "", clean("".join(self.heading_text)))
            self.heading_text = None
        elif tag in ("td", "th") and self.cell is not None:
            if self.row is not None:
                self.row.append(clean("".join(self.cell)))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.heading_rows.append((self.heading, self.row))
            self.row = None


def torna_affinity_skills(text: str) -> tuple[list[dict], list[str]]:
    """Torna rings list stage unlock, 3 specials, 3 passives, then fields."""
    headings = [clean(m[1]) for m in re.finditer(r"^===\s*([^=\n]+?)\s*===\s*$", text, re.M)]
    if not headings:
        return [], []
    if headings[0] != "阶段解锁" or len(headings) < 9:
        raise ValueError("Torna affinity structure changed; review before extracting")
    passive = []
    for heading in headings[4:7]:
        rows = [r for r in wiki_rows(section(text, heading)) if len(r) >= 2 and r[0].isdigit()]
        if not rows:
            raise ValueError(f"No skill values found: {heading}")
        first, last = rows[0], rows[-1]
        effect = f"Lv{first[0]}：{first[1]}"
        if last != first:
            effect += f"；Lv{last[0]}：{last[1]}"
        passive.append({"name": heading, "effect": effect})
    return passive, headings[7:]


def page_url(title: str) -> str:
    return "https://xenoblade2.cn/" + urllib.parse.quote(title, safe=":()")


def record_id(kind: str, arc: str, english: str, title: str) -> str:
    slug = re.sub(r"[^A-Z0-9]+", "-", english.upper()).strip("-")
    if not slug:
        slug = hashlib.sha256(title.encode()).hexdigest()[:10].upper()
    if title == "异刃:宫比罗(觉醒)":
        slug += "-AWAKENED"
    if title == "异刃:花JD":
        slug = "POPPI-QT-PI"
    prefix = "XC2-TORNA" if arc == "torna" else "XC2"
    return f"{prefix}-{'DRIVER' if kind == 'driver' else 'BLADE'}-{slug}"


def build_records(raw: dict[str, str], parsed_drivers: dict[str, str], quest_relations: dict | None = None) -> tuple[list[dict], dict[str, str]]:
    catalog = []
    image_files = {}
    entries = [(name, "driver", "baseGame", "临时可控角色" if name in ("凡达姆", "真") else "主角队伍") for name in DRIVERS]
    listing = raw["异刃"].split("== 「Nintendo Switch 2 Edition」")[0]
    groups = [("史诗异刃", "baseGame", "史诗异刃"), ("稀有异刃", "baseGame", "稀有异刃"), ("「Expansion Pass 异刃」", "expansionPass", "扩展票异刃")]
    for heading, arc, group in groups:
        entries.extend((title, "blade", arc, group) for title in re.findall(r"\[\[(异刃:[^|\]]+)", section(listing, heading)))
    entries.extend((title, "blade", "baseGame", "剧情角色" if title == "异刃:灭" else "二周目异刃") for title in re.findall(r"\[\[(异刃:[^|\]]+)", raw["伊拉异刃"]))
    entries.extend(("黄金之国伊拉:" + name, "driver", "torna", "黄金之国伊拉") for name in TORNA_DRIVERS)
    entries.extend(("黄金之国伊拉:" + name, "blade", "torna", "黄金之国伊拉") for name in TORNA_BLADES)
    seen = set()
    quests = json.loads((ROOT / "data" / "xc2-quests.json").read_text(encoding="utf-8"))
    quest_url_ids = {urllib.parse.unquote(q["sourceUrl"]).rstrip("/"): q["id"] for q in quests}
    for title, kind, arc, group in entries:
        if title in seen:
            raise ValueError(f"Duplicate source: {title}")
        seen.add(title)
        text = raw[title]
        fields = template_fields(text)
        rows = wiki_rows(text.split("==", 1)[0])
        first_rows = {row[0]: row[1:] for row in rows if len(row) >= 2}
        if title in parsed_drivers:
            parser = RenderedRows()
            parser.feed(parsed_drivers[title])
            for row in parser.rows:
                if row and row[0] in ("喜欢的分类", "喜欢的道具"):
                    first_rows[row[0]] = row[1:]
        def value(key: str) -> str:
            return fields.get(key) or (first_rows.get(key) or [""])[0]
        name = title.split(":", 1)[-1] if ":" in title and title not in DRIVERS else title
        if title.startswith("异刃:KOS-MOS") or title.startswith("异刃:T-elos"):
            name = title[len("异刃:"):]
        english = value("英文名") or value("英") or ENGLISH_DRIVERS.get(title, "")
        if title == "异刃:觉醒圣杯":
            english = "Pneuma"
        if title == "异刃:灭":
            english = "Malos"
        rid = record_id(kind, arc, english, title)
        file = value("立绘")
        if not file:
            match = re.search(r"(?:\[\[(?:文件|File):([^|\]]+)|(fim_dr_\d+_\d+\.png))", text, re.I)
            if match:
                file = match[1] or match[2]
        if file:
            image_files[rid] = file[0].upper() + file[1:]
        category = [fields[key] for key in ("喜欢的类别1", "喜欢的类别2") if fields.get(key)] or first_rows.get("喜欢的分类") or re.split("[、；]", value("喜欢的类别"))
        favorites = [fields[key] for key in ("喜欢的物品1", "喜欢的物品2") if fields.get(key)] or first_rows.get("喜欢的道具") or re.split("[、；]", value("喜欢的物品"))
        battle = [{"name": row[0], "effect": row[1]} for row in wiki_rows(section(text, "战斗技能")) if len(row) >= 2 and row[0] not in ("名称", "")]
        if kind == "driver":
            # Keep the active character's distinct skills rather than repeating
            # hundreds of weapon-dependent Driver Arts at every level.
            battle = [{"name": row[0], "effect": row[-1]} for row in wiki_rows(section(text, "天赋武技")) if len(row) >= 3 and row[0] != "名称"]
            if title in parsed_drivers:
                # The source renders Driver affinities dynamically. Retain
                # named combat abilities instead of falsely showing no skills.
                battle = []
                for chart in ("表象牵绊", "内心牵绊"):
                    rows = [row for heading, row in parser.heading_rows if heading == chart and len(row) == 3 and row[0] != "名称"]
                    # CN tables are row-major: three rings, five positions each.
                    # Verified against BTL_Skill_Dr_Table01..06 Round/RowNum/ColumnNum:
                    # https://xenoblade.github.io/xb2/bdat/common/BTL_Skill_Dr_Table01.html
                    if rows and len(rows) != 15:
                        raise ValueError(f"Unexpected affinity layout: {title} / {chart}")
                    for index, row in enumerate(rows):
                        battle.append({"name": row[0], "effect": row[1], "affinity": {
                            "chart": chart, "ring": index // 5 + 1, "position": index % 5 + 1,
                        }})
        scenes = [row[0] for row in wiki_rows(section(text, "场景技能")) if len(row) >= 2 and row[0] not in ("名称", "")]
        if arc == "torna" and kind == "blade":
            battle, scenes = torna_affinity_skills(raw.get(title + "/牵绊圆环", ""))
        acquisition = DRIVER_ACQUISITION.get(title, "") if arc == "baseGame" and kind == "driver" else value("加入方法")
        if arc == "torna":
            acquisition = "黄金之国伊拉主线队伍成员" if title != "黄金之国伊拉:劳拉" else "黄金之国伊拉初始队伍成员"
        if title == "异刃:灭":
            acquisition = "剧情登场；不可获得"
        acq_type = "torna" if arc == "torna" else "story" if kind == "driver" else "newGamePlus" if group == "二周目异刃" else "challenge" if name in ("修尔克", "菲奥伦", "艾尔玛") else "resonance" if acquisition.startswith("异刃调谐") else "quest" if "任务:" in text.split("|立绘", 1)[0] or name == "花JD" else "story" if "主线" in acquisition else "resonance" if "调谐" in acquisition or "同调" in acquisition else "special"
        is_form = title in ("异刃:觉醒圣杯", "异刃:宫比罗(觉醒)")
        collectible = not is_form and title not in ("凡达姆", "真", "异刃:灭")
        aux_value = value("辅助核心插槽数")
        aux = int(aux_value) if aux_value.isdigit() else None
        quest_ids = []
        # Exact source links, including explicit acquisition / affinity quest
        # names. Never infer from short names such as 光 or 月 appearing in prose.
        for link in re.findall(r"\[\[(任务:[^|\]]+)", text):
            qid = quest_url_ids.get(urllib.parse.unquote(page_url(link)))
            if qid and qid not in quest_ids:
                quest_ids.append(qid)
        catalog.append({"id": rid, "kind": kind, "name": name, "englishName": english, "arc": arc, "group": group, "element": value("属性"), "role": value("战斗类别") or ("御刃者" if kind == "driver" and title != "真" else "临时操作 · 异刃" if title == "真" else ""), "weapon": value("武器"), "acquisition": acquisition, "acquisitionType": acq_type, "description": DESCRIPTIONS.get(title, ""), "fieldSkills": scenes, "battleSkills": battle, "favoriteCategories": [v for v in category if v], "favoriteItems": [v for v in favorites if v], "auxCores": aux, "statModifier": value("御刃者能力修正"), "partners": [], "image": "", "imageSource": "", "sourceUrl": page_url(title), "updatedAt": UPDATED, "spoiler": is_form or title in ("异刃:尼娅", "真", "异刃:灭") or group == "二周目异刃", "playable": title != "异刃:灭", "collectible": collectible, "isForm": is_form, "questIds": quest_ids})
    apply_verified_overrides(catalog)
    if quest_relations is not None:
        add_blade_task_relations(catalog, quests, quest_relations)
    return catalog, image_files


def add_blade_task_relations(records: list[dict], quests: list[dict], relation_payload: dict) -> None:
    """Use the explicit 对应异刃 relationship, never prose/name substrings."""
    blade_quests = [q for q in quests if q["type"] == "异刃任务"]
    blade_quest_ids = {q["id"] for q in blade_quests}
    def normal_url(url):
        return urllib.parse.unquote(url).replace("_", " ").rstrip("/")
    by_quest_url = {normal_url(q["sourceUrl"]): q["id"] for q in blade_quests}
    by_character_url = {normal_url(r["sourceUrl"]): r for r in records}
    for record in records:
        # Individual character pages occasionally link the wrong quest (for
        # example Sheba once linked Kora's quest); the relation table wins.
        record["questIds"] = [qid for qid in record["questIds"] if qid not in blade_quest_ids]
    covered = set()
    for relation in relation_payload["query"]["results"].values():
        qid = by_quest_url.get(normal_url(relation["fullurl"]))
        if not qid:
            continue  # Includes Switch 2 additions outside the original scope.
        for character in relation["printouts"].get("对应异刃", []):
            record = by_character_url.get(normal_url(character["fullurl"]))
            if record:
                record["questIds"].append(qid)
                covered.add(qid)
    if covered != blade_quest_ids:
        raise ValueError(f"Blade quest coverage mismatch: {sorted(blade_quest_ids - covered)}")
    dagas = by_character_url[normal_url(page_url("异刃:宫比罗"))]
    awakened = by_character_url[normal_url(page_url("异刃:宫比罗(觉醒)"))]
    awakened["questIds"] = list(dict.fromkeys(awakened["questIds"] + dagas["questIds"]))
    for record in records:
        record["questIds"] = list(dict.fromkeys(record["questIds"]))


def apply_verified_overrides(catalog: list[dict]) -> None:
    by_title = {urllib.parse.unquote(r["sourceUrl"]).split("xenoblade2.cn/", 1)[-1]: r for r in catalog}
    def override(title, **values):
        by_title[title].update(values)
    override("异刃:觉醒圣杯", acquisition="第7章主线解锁；战斗中焰或光牵绊MAX且队伍槽MAX时，按 R + X 启动觉醒", acquisitionType="story", auxCores=None)
    override("异刃:T-elos Re:", acquisition="原版免费更新：通关主线后，通过核心水晶调谐获得（不要求进入二周目）", acquisitionType="resonance")
    override("异刃:佐田彦", acquisition="二周目第9章后，在莫尔斯之地的世界树区域与佐田彦对话加入，并与对话者绑定", acquisitionType="newGamePlus")
    override("异刃:修尔克", acquisition="扩展票挑战之地加入；完成挑战‘恐龙战线’后可带回本篇", acquisitionType="challenge")
    override("异刃:菲奥伦", acquisition="扩展票挑战之地加入；完成挑战‘恐龙战线’后可带回本篇", acquisitionType="challenge")
    override("异刃:艾尔玛", acquisition="完成扩展票挑战‘异界的战士’后加入；完成‘艾尔玛再临’后可带回本篇", acquisitionType="challenge")
    override("异刃:花巴斯塔", acquisition="下载扩展票稀有异刃第1弹，第5章后在虎的家完成‘全新的力量’；可与虎以外的御刃者搭档", acquisitionType="quest")
    # The infobox omits the pickup locations documented in the update notes:
    # https://xenoblade2.cn/Ver.1.5.2 and /Ver.1.5.1 respectively.
    override("异刃:神八", acquisition="领取扩展票稀有异刃第3弹，在阿伐利缇亚商会·格尔特蒙特返航港向NPC领取核心水晶，再进行调谐", acquisitionType="special")
    override("异刃:火花", acquisition="领取扩展票稀有异刃第2弹，在阿伐利缇亚商会·树荫休息处向NPC领取核心水晶，再进行调谐", acquisitionType="special")
    override("异刃:宫比罗(觉醒)", acquisition="完成异刃任务‘王的威光’后，宫比罗进入觉醒形态", acquisitionType="quest")
    # The detail page has a typo. The category table and original game BDAT
    # CHR_Bl #1048 agree: HpMaxRev=20, StrengthRev=0.
    override("异刃:大锤", statModifier="最大HP20%")
    torna_roles = {"真": "攻击", "霞": "回复", "光": "攻击", "米诺奇": "攻击", "迦具土": "防御", "绵津见": "防御"}
    for name, role in torna_roles.items():
        override("黄金之国伊拉:" + name, role=role)
    for title in DRIVERS:
        override(title, weapon="双镰刀" if title == "凡达姆" else "刀" if title == "真" else "随装备异刃变化")
    for name in TORNA_DRIVERS:
        override("黄金之国伊拉:" + name, weapon="与小队异刃互换武器")
    for record in catalog:
        record["acquisition"] = re.sub(r"[，,]\s*；", "；", record["acquisition"])
    for title in ("异刃:花JS", "异刃:花JK", "异刃:花JD"):
        r = by_title[title]
        r["acquisition"] += "；显示加入时的属性与类别，可在花的定制中更改"
        r["auxCores"] = None
    pairs = {
        "莱克斯": ["异刃:焰", "异刃:光", "异刃:朱雀", "异刃:尼娅"], "尼娅": ["异刃:白虎"], "虎": ["异刃:花JS", "异刃:花JK", "异刃:花JD"], "梅勒芙": ["异刃:迦具土", "异刃:绵津见"], "齐格": ["异刃:彩歌"], "凡达姆": ["异刃:朱雀"],
        "黄金之国伊拉:劳拉": ["黄金之国伊拉:真", "黄金之国伊拉:霞"], "黄金之国伊拉:阿德尔": ["黄金之国伊拉:光", "黄金之国伊拉:米诺奇"], "黄金之国伊拉:尤格": ["黄金之国伊拉:迦具土", "黄金之国伊拉:绵津见"],
    }
    for driver, blades in pairs.items():
        by_title[driver]["partners"] = [by_title[b]["id"] for b in blades]
        for blade in blades:
            if by_title[driver]["id"] not in by_title[blade]["partners"]:
                by_title[blade]["partners"].append(by_title[driver]["id"])
    for title in ("异刃:觉醒圣杯", "异刃:宫比罗(觉醒)"):
        original = "莱克斯" if title == "异刃:觉醒圣杯" else "异刃:宫比罗"
        by_title[title]["partners"] = [by_title[original]["id"]]


def download_images(records: list[dict], files: dict[str, str], offline: bool, skip: bool) -> None:
    IMAGES.mkdir(parents=True, exist_ok=True)
    manifest_file = IMAGES / "sources.json"
    manifest = json.loads(manifest_file.read_text(encoding="utf-8")) if manifest_file.exists() else {}
    if not offline and not skip:
        unique = list(dict.fromkeys(files.values()))
        info = {}
        for start in range(0, len(unique), 40):
            payload = api_get({"action": "query", "prop": "imageinfo", "iiprop": "url|size", "iiurlwidth": "640", "titles": "|".join("文件:" + name for name in unique[start:start + 40])})
            for page in payload["query"]["pages"].values():
                if page.get("imageinfo"):
                    ii = page["imageinfo"][0]
                    info[page["title"].split(":", 1)[1].replace("_", " ")] = ii
        def download(pair):
            rid, name = pair
            image_info = info.get(name.replace("_", " "))
            if not image_info:
                raise ValueError(f"Artwork missing: {name}")
            url = image_info.get("thumburl") or image_info["url"]
            target = IMAGES / (rid.lower() + ".png")
            if not target.exists():
                target.write_bytes(read_url(url))
            return rid, {"file": "/images/xc2/" + target.name, "sourceFile": name, "sourceUrl": image_info["descriptionurl"], "downloadUrl": url, "originalUrl": image_info["url"], "width": image_info.get("thumbwidth", image_info["width"]), "height": image_info.get("thumbheight", image_info["height"]), "attribution": "Character artwork from Xenoblade Chronicles 2 / Torna. Nintendo / MONOLITHSOFT. Hosted by 乐园数据管理室."}
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for rid, entry in pool.map(download, files.items()):
                manifest[rid] = entry
        manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for record in records:
        asset = manifest.get(record["id"])
        if asset and (ROOT / "public" / asset["file"].lstrip("/")).exists():
            record["image"] = asset["file"]
            record["imageSource"] = asset["sourceUrl"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--skip-images", action="store_true")
    parser.add_argument("--download-images", action="store_true", help="Refresh artwork even when using cached page content")
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    raw_file = CACHE / "raw.json"
    if args.offline:
        raw = json.loads(raw_file.read_text(encoding="utf-8"))
    else:
        raw = fetch_raw(["异刃", "伊拉异刃", *DRIVERS, *["黄金之国伊拉:" + name for name in TORNA_DRIVERS + TORNA_BLADES]])
        listing = raw["异刃"].split("== 「Nintendo Switch 2 Edition」")[0] + raw["伊拉异刃"]
        titles = list(dict.fromkeys(re.findall(r"\[\[(异刃:[^|\]]+)", listing)))
        raw.update(fetch_raw(titles))
        raw.update(fetch_raw(["黄金之国伊拉:" + name + "/牵绊圆环" for name in TORNA_BLADES]))
        raw_file.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    relations_file = CACHE / "blade-quest-relations.json"
    if not args.offline:
        relations_file.write_text(json.dumps(api_get({"action": "ask", "query": "[[任务:+]][[任务分类::异刃任务]]|?对应异刃|limit=200"}), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    quest_relations = json.loads(relations_file.read_text(encoding="utf-8"))
    parsed = {}
    def fetch_driver(name):
        cache_file = CACHE / ("driver-" + hashlib.sha256(name.encode()).hexdigest()[:12] + ".html")
        if not args.offline:
            content = api_get({"action": "parse", "page": name, "prop": "text"})["parse"]["text"]["*"]
            cache_file.write_text(content, encoding="utf-8")
        return name, cache_file.read_text(encoding="utf-8") if cache_file.exists() else ""
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        parsed.update(pool.map(fetch_driver, DRIVERS))
    records, images = build_records(raw, parsed, quest_relations)
    download_images(records, images, args.offline and not args.download_images, args.skip_images)
    ids = {r["id"] for r in records}
    if len(ids) != len(records) or len(records) != 71:
        raise ValueError(f"Catalog coverage changed unexpectedly: {len(records)} records / {len(ids)} IDs; inspect upstream list before publishing")
    for record in records:
        if not record["description"] or any(p not in ids for p in record["partners"]):
            raise ValueError(f"Incomplete verified record: {record['name']}")
    OUTPUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(records), "drivers": sum(r["kind"] == "driver" for r in records), "blades": sum(r["kind"] == "blade" for r in records), "collectible": sum(r["collectible"] for r in records), "images": sum(bool(r["image"]) for r in records), "scope": "Nintendo Switch original + free updates + Expansion Pass + Torna; excludes Switch 2 Edition additions"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
