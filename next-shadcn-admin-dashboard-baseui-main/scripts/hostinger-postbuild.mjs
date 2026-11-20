/**
 * Hostinger Git Monorepo Post-Build Synchronizer
 *
 * Only runs on Linux inside Hostinger's build environment (no-op on Windows/macOS local dev).
 * Ensures that whether Hostinger's post-build publisher looks for `.next/standalone`
 * inside `root_directory` (`next-shadcn-admin-dashboard-baseui-main/.next`) OR at the
 * cloned repository root (`../.next`), the standalone output and public assets are present.
 */

import fs from "node:fs";
import path from "node:path";

function main() {
  if (process.platform !== "linux") {
    return;
  }

  const cwd = process.cwd();
  const parentDir = path.resolve(cwd, "..");
  const dotNext = path.join(cwd, ".next");
  const standaloneDir = path.join(dotNext, "standalone");

  console.log(`[hostinger-postbuild] cwd=${cwd}`);
  try {
    console.log(`[hostinger-postbuild] cwd entries=${fs.readdirSync(cwd).join(", ")}`);
    console.log(`[hostinger-postbuild] parent entries=${fs.readdirSync(parentDir).join(", ")}`);
    if (fs.existsSync(dotNext)) {
      console.log(`[hostinger-postbuild] .next entries=${fs.readdirSync(dotNext).join(", ")}`);
    }
    if (fs.existsSync(standaloneDir)) {
      console.log(`[hostinger-postbuild] .next/standalone entries=${fs.readdirSync(standaloneDir).join(", ")}`);
    }
  } catch (err) {
    console.warn("[hostinger-postbuild] diagnostic listing warning:", err);
  }

  // 1. Clean up any temporary *.next.config.mjs files left by Hostinger's wrapper before packaging
  try {
    for (const entry of fs.readdirSync(cwd)) {
      if (/^[0-9a-f]{10,}\.next\.config\.mjs$/i.test(entry)) {
        fs.rmSync(path.join(cwd, entry), { force: true });
        console.log(`[hostinger-postbuild] removed temp config ${entry}`);
      }
    }
  } catch {
    // Non-fatal
  }

  // 2. If Next.js nested standalone output under .next/standalone/next-shadcn-admin-dashboard-baseui-main/, hoist it
  const nestedStandalone = path.join(standaloneDir, "next-shadcn-admin-dashboard-baseui-main");
  if (
    fs.existsSync(nestedStandalone) &&
    fs.existsSync(path.join(nestedStandalone, "server.js")) &&
    !fs.existsSync(path.join(standaloneDir, "server.js"))
  ) {
    for (const item of fs.readdirSync(nestedStandalone)) {
      const src = path.join(nestedStandalone, item);
      const dest = path.join(standaloneDir, item);
      if (!fs.existsSync(dest)) {
        fs.cpSync(src, dest, { recursive: true, force: true });
      }
    }
    console.log("[hostinger-postbuild] hoisted nested standalone server.js to .next/standalone/server.js");
  }

  // 3. Mirror .next and public to parent repository root in case Hostinger publisher checks repo root
  if (path.basename(cwd) === "next-shadcn-admin-dashboard-baseui-main" && fs.existsSync(dotNext)) {
    try {
      const parentDotNext = path.join(parentDir, ".next");
      fs.rmSync(parentDotNext, { recursive: true, force: true });
      fs.cpSync(dotNext, parentDotNext, { recursive: true, force: true });

      const pubDir = path.join(cwd, "public");
      const parentPubDir = path.join(parentDir, "public");
      if (fs.existsSync(pubDir)) {
        fs.rmSync(parentPubDir, { recursive: true, force: true });
        fs.cpSync(pubDir, parentPubDir, { recursive: true, force: true });
      }
      console.log("[hostinger-postbuild] mirrored .next and public to parent repository root");
    } catch (err) {
      console.warn("[hostinger-postbuild] mirror warning:", err);
    }
  }
}

main();
