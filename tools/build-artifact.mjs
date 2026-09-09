/* 朱入れ 公開用の一枚を組む
   claude.ai の枠は <!DOCTYPE> <html> <head> <body> を自分で付けるので、それらを外した版を作る。
   使いかた:  node tools/build-artifact.mjs 出力先.html                                   */
import fs from "node:fs";
import zlib from "node:zlib";
const src = fs.readFileSync(new URL("../shuire.html", import.meta.url), "utf8");
/* もとの一枚を圧縮して埋めておく。「この道具について」の「この一枚をファイルとして保存」がこれをほどく */
const packed = zlib.deflateRawSync(Buffer.from(src, "utf8"), { level: 9 }).toString("base64");
const out = src
  .replace(/^\s*<!DOCTYPE html>\s*/i, "")
  .replace(/^\s*<html[^>]*>\s*/i, "")
  .replace(/<\/html>\s*$/i, "")
  .replace(/<head>\s*/i, "").replace(/<\/head>\s*/i, "")
  .replace(/<body>\s*/i, "").replace(/<\/body>\s*/i, "")
  .replace(/<meta[^>]*>\s*/gi, "")
  .replace(/<link rel="(manifest|apple-touch-icon)"[^>]*>\s*/gi, "")   /* 枠の中では別ファイルを取りに行けない */
  .replace(/<script>\s*"use strict";/, '<script type="text/plain" id="self-src">' + packed + '</script>\n<script>\n"use strict";');
const dest = process.argv[2] || "shuire-artifact.html";
fs.writeFileSync(dest, out);
console.log(dest + "　" + out.length.toLocaleString() + "字");
