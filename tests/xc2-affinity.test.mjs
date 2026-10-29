import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const characters = JSON.parse(await readFile(new URL("../data/xc2-characters.json", import.meta.url), "utf8"));

test("driver affinity charts keep two distinct charts with three rings and five positions", () => {
  const drivers = characters.filter((character) => character.battleSkills.some((skill) => skill.affinity));
  assert.equal(drivers.length, 6);
  for (const driver of drivers) {
    assert.equal(driver.kind, "driver");
    assert.equal(driver.arc, "baseGame");
    for (const chart of ["表象牵绊", "内心牵绊"]) {
      for (const ring of [1, 2, 3]) {
        const positions = driver.battleSkills.filter((skill) => skill.affinity.chart === chart && skill.affinity.ring === ring).map((skill) => skill.affinity.position);
        assert.deepEqual(positions, [1, 2, 3, 4, 5], `${driver.name} ${chart} ${ring}`);
      }
    }
  }
  assert.ok(characters.filter((character) => character.kind === "blade" || character.arc === "torna").every((character) => character.battleSkills.every((skill) => !skill.affinity)));
});

test("Rex nodes match the game table's RowNum and ColumnNum, not raw table ID order", () => {
  const rex = characters.find((character) => character.kind === "driver" && character.name === "莱克斯");
  for (const [name, chart, ring, position] of [
    ["速攻1", "表象牵绊", 1, 3],
    ["武技连锁", "表象牵绊", 2, 2],
    ["速攻3", "表象牵绊", 3, 1],
    ["声援团团员", "内心牵绊", 1, 3],
    ["爷爷的守护", "内心牵绊", 3, 5],
  ]) assert.deepEqual(rex.battleSkills.find((skill) => skill.name === name).affinity, { chart, ring, position });
});
