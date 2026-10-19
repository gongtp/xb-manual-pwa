export type XC1StoryNode = {
  chapter: number;
  label: string;
};

// Xenoblade Chronicles: Definitive Edition 的 flg_s 剧情标记。
// 原始依据：https://xenobladedata.github.io/xb1de/bdat/MNU_scenario.html
export const xc1StoryNodes: Readonly<Record<number, XC1StoryNode>> = {
  15: { chapter: 1, label: "9号殖民地自由行动（前往灰烬洞窟前）" },
  36: { chapter: 3, label: "9号殖民地遇袭后（修尔克与莱恩启程前）" },
  52: { chapter: 3, label: "再访灰烬洞窟（预见莱恩遇袭后）" },
  70: { chapter: 4, label: "巨神脚难民营（预见朱朱遇袭后）" },
  111: { chapter: 6, label: "磷光之地扎托尔（前往姊妹像）" },
  116: { chapter: 7, label: "穿过巨神胎内，初到玛格纳原始森林" },
  129: { chapter: 7, label: "救出梅莉亚后（前往边境村）" },
  130: { chapter: 7, label: "初到边境村" },
  137: { chapter: 7, label: "力奇加入队伍后" },
  138: { chapter: 7, label: "讨伐特雷西亚（寻找以太结晶）" },
  148: { chapter: 8, label: "初到艾尔特海" },
  158: { chapter: 8, label: "初到皇都阿卡莫托（白翼宫受监视、与同伴交谈阶段）" },
  160: { chapter: 8, label: "皇都解除禁足（寻找运输机维修员）" },
  170: { chapter: 8, label: "预见梅莉亚在海恩塔墓地遇险后" },
  185: { chapter: 9, label: "海恩塔墓地试炼结束（返回皇都觐见皇帝后）" },
  226: { chapter: 10, label: "监狱岛事件后（离开皇都追踪银色机神兵）" },
  227: { chapter: 10, label: "离开皇都，准备前往瓦拉克雪山" },
  229: { chapter: 10, label: "抵达瓦拉克雪山" },
  293: { chapter: 12, label: "隐居村见过米格尔后" },
  299: { chapter: 13, label: "进入机神界领域后" },
  304: { chapter: 13, label: "从坠落巨臂出发，开始攀登机神界" },
  342: { chapter: 15, label: "机神开始行动（与米格尔交谈、前往机神界中枢）" },
  357: { chapter: 17, label: "机神界中枢事件结束后" },
  366: { chapter: 17, label: "机神界中枢事件后（修尔克进入记忆空间）" },
  368: { chapter: 17, label: "返回6号殖民地后" },
  376: { chapter: 17, label: "6号殖民地防卫战中（修尔克苏醒后）" },
  380: { chapter: 17, label: "6号殖民地防卫战结束（最终决战前）" },
};

export function getXC1StoryNode(progress: number | string) {
  const value = typeof progress === "number"
    ? progress
    : Number(progress.match(/\d+/)?.[0]);
  return Number.isFinite(value) ? xc1StoryNodes[value] ?? null : null;
}

export function formatXC1StoryProgress(value: string) {
  return value.replace(/主线进度\s*(\d+)/g, (original, rawProgress: string) => {
    const node = getXC1StoryNode(rawProgress);
    return node ? `第${node.chapter}章 · ${node.label}` : original;
  });
}
