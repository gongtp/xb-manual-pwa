import { getSqlite } from ".";
import { ensureXc1NpcDatabase } from "./xc1-npcs";
import { ensureQuestLabelDatabase } from "./quest-labels";
import { ensureGameNotesDatabase } from "./game-notes";
import { listXC1LocationProgress } from "./xc1-locations";
import { listXC2LocationProgress } from "./xc2-locations";
import { listXC3LocationProgress } from "./xc3-locations";
import { listXC2CharacterProgress } from "./xc2-characters";

export async function ensureAllTables() {
  await ensureXc1NpcDatabase();
  await ensureQuestLabelDatabase();
  await ensureGameNotesDatabase();
  await listXC1LocationProgress();
  await listXC2LocationProgress();
  await listXC3LocationProgress();
  await listXC2CharacterProgress();
}

export async function exportBackup() {
  await ensureAllTables();
  return getSqlite().exportBackup();
}
