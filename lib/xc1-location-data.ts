import seed from "../data/xc1-locations.json";
import type { XC1Atlas } from "./xc1-location";

export const xc1Atlas = seed as XC1Atlas;

export const xc1RegionGuides: Record<string, { description: string; caution?: string }> = {
  "XC1-REGION-02": { description: "从湖畔殖民地出发。穿过商业区与居住区，沿岸寻找山丘、炮塔与隐蔽的水池。" },
  "XC1-REGION-03": { description: "连接殖民地与巨神脚的洞窟。蜿蜒的通道之外，还藏着古老遗迹与两处秘境。", caution: "部分深层区域在本篇后期开放。尚未抵达的地点可以先收藏，后续再回来探索。" },
  "XC1-REGION-04": { description: "广阔草原、瀑布与岩壁层层相接。先发现地标，再以它们为据点探索高地和隐秘山谷。" },
  "XC1-REGION-05": { description: "在重建中的殖民地寻找新的生活。周边道路与复兴总部连接着来往旅人的足迹。" },
  "XC1-REGION-06": { description: "升降机与地下坑道交织的采矿设施。留意垂直高度，也别错过地下湖。", caution: "中央枢纽内的部分区域会随剧情无法再进入；推进本地区主线前建议完成探索。" },
  "XC1-REGION-07": { description: "磷光点亮的湿地与古代遗迹。石像、营地和方尖碑是穿越沼泽的参照。" },
  "XC1-REGION-08": { description: "巨树与吊桥覆盖的原始森林。沿瀑布与林道深入，寻找四处秘境。" },
  "XC1-REGION-09": { description: "建在巨树内部的诺彭村落。各层甲板上下相叠，寻找居民时请同时留意所在高度。" },
  "XC1-REGION-11": { description: "沉睡在古老机关之后的海恩塔遗迹。大厅、回廊与试炼区域构成层叠的路线。" },
  "XC1-REGION-12": { description: "浮岛与海岸环绕的辽阔水域。利用各处地标逐步探索灯塔、工厂和遥远海岸。" },
  "XC1-REGION-13": { description: "水道与高塔构成的皇都。喷泉、宫殿和居住街区之间留有许多旅人的故事。", caution: "后期皇都居民与区域状态会发生变化；有期限的居民任务请提前处理。" },
  "XC1-REGION-14": { description: "初次登上监狱岛的探索记录。与后期再访使用不同的地图，分别记录探索进度。" },
  "XC1-REGION-15": { description: "本篇后期再访的监狱岛。向内部深入，探索回廊、大厅与高处的遗迹。" },
  "XC1-REGION-16": { description: "雪岭、冰洞与古代建筑相连。高处的秘境与山脚道路有明显高度差。" },
  "XC1-REGION-17": { description: "沿巨剑铺开的战线。堡垒、补给点与机械起降场串起前进的道路。", caution: "本地区会随主线推进无法重访。前往后续区域前，建议完成地点与任务收集。" },
  "XC1-REGION-18": { description: "巨大的机械要塞内部。管线与整备室分布于不同高度，探索时留意升降路线。", caution: "本地区会随主线推进无法重访。建议在继续推进前检查探索清单。" },
  "XC1-REGION-19": { description: "坠落于海面的机械巨臂。隐居村、海岸与指尖之间，藏着不同的生活与风景。" },
  "XC1-REGION-21": { description: "沿机神内部逐层上行。电源区域与隔离墙连接着高处的隐居地。", caution: "本地区会随主线推进无法重访。进入后续剧情前，检查秘境与未探索地点。" },
  "XC1-REGION-23": { description: "机神界的古老帝都。居住区、石柱与神殿诉说着往日文明。", caution: "本地区会随主线推进无法重访。秘密会议处还涉及区域任务，建议提前完成。" },
  "XC1-REGION-24": { description: "运输通路与大型生产设施构成的工厂。地标之间常需借助升降机或平台移动。", caution: "本地区会随主线推进无法重访。前往机神界中枢前，检查仍需完成的探索。" },
  "XC1-REGION-25": { description: "巨神体内的通道。初访与后期探索的可达范围不同，未开放地点可以留待再访。" },
  "XC1-REGION-26": { description: "本篇最终阶段的特殊区域。按剧情顺序前进，记录旅程终点的足迹。", caution: "最终阶段的剧情区域，请在进入前保留可继续自由探索的存档。" },
  "XC1-REGION-27": { description: "机神内部旅程的关键节点。此处以剧情推进为主。" },
  "XC1-REGION-28": { description: "本篇废品号内部的独立场景，与巨神肩上的同名地标分别记录。" },
  "XC1-REGION-29": { description: "在云海之上开启新的旅程。高地、古代都市与悬空的遗迹，等待再次踏足。" },
  "XC1-REGION-30": { description: "《相连的未来》中的皇都。这里与本篇的同名地区分别保存探索记录。" },
};
