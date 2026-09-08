/* 朱入れ 公開用の一枚を組む
   claude.ai の枠は <!DOCTYPE> <html> <head> <body> を自分で付けるので、それらを外した版を作る。
   使いかた:  node tools/build-artifact.mjs 出力先.html                                   */
import fs from "node:fs";
const src = fs.readFileSync(new URL("../shuire.html", import.meta.url), "utf8");
const out = src
  .replace(/^\s*<!DOCTYPE html>\s*/i, "")
  .replace(/^\s*<html[^>]*>\s*/i, "")
  .replace(/<\/html>\s*$/i, "")
  .replace(/<head>\s*/i, "").replace(/<\/head>\s*/i, "")
  .replace(/<body>\s*/i, "").replace(/<\/body>\s*/i, "")
  .replace(/<meta[^>]*>\s*/gi, "");
const dest = process.argv[2] || "shuire-artifact.html";
fs.writeFileSync(dest, out);
console.log(dest + "　" + out.length.toLocaleString() + "字");
