import { existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

if (existsSync("build/icon.icns")) process.exit(0);

if (process.platform !== "darwin") {
  throw new Error("build/icon.icns is generated with macOS sips/iconutil. Run dist:mac on macOS.");
}

const source = existsSync("build/icon-source.png") ? "build/icon-source.png" : "build/icon.png";
const iconset = "build/icon.iconset";
const sizes = [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"],
];

mkdirSync(iconset, { recursive: true });

for (const [size, fileName] of sizes) {
  execFileSync("sips", ["-z", String(size), String(size), source, "--out", `${iconset}/${fileName}`], {
    stdio: "inherit",
  });
}

execFileSync("iconutil", ["-c", "icns", iconset, "-o", "build/icon.icns"], { stdio: "inherit" });
