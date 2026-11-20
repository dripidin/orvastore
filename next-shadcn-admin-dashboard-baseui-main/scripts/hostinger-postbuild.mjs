import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function main() {
  if (process.platform !== "linux") {
    return;
  }

  const cwd = process.cwd();
  console.log(`[hostinger-diag] cwd=${cwd}`);
  try {
    console.log("[hostinger-diag] df -h:\n" + execSync("df -h").toString());
    console.log("[hostinger-diag] df -i:\n" + execSync("df -i").toString());
    console.log("[hostinger-diag] quota:\n" + execSync("quota -s 2>&1 || true").toString());
  } catch (e) {
    console.log("[hostinger-diag] df err:", e?.message);
  }

  for (const dir of [
    "/home/u520776094",
    "/home/u520776094/domains/orva-store.com",
    "/home/u520776094/domains/orva-store.com/hbuilds",
    "/home/u520776094/domains/orva-store.com/hbuilds/source",
  ]) {
    try {
      if (fs.existsSync(dir)) {
        console.log(`[hostinger-diag] ls ${dir}:`, fs.readdirSync(dir).join(", "));
      }
    } catch (e) {
      console.log(`[hostinger-diag] ls ${dir} err:`, e?.message);
    }
  }

  try {
    console.log("[hostinger-diag] next.config.mjs wrapper:\n" + fs.readFileSync(path.join(cwd, "next.config.mjs"), "utf8"));
  } catch (e) {
    console.log("[hostinger-diag] read next.config.mjs err:", e?.message);
  }
}

main();
