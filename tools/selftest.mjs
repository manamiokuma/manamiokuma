/* 朱入れ 自己点検
   shuire.html の <script> を偽のDOMの上で走らせ、
   分割・復元・下読み・docxの読み書きを確かめる。
   使いかた:  node tools/selftest.mjs                             */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const html = fs.readFileSync(new URL("../shuire.html", import.meta.url), "utf8");
const src = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));

/* ---- 偽のDOM ---- */
const els = new Map();
const mkEl = () => ({
  innerHTML: "", textContent: "", value: "", className: "", dataset: {}, style: {},
  classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  querySelectorAll(){ return []; }, querySelector(){ return null; },
  addEventListener(){}, focus(){}, setSelectionRange(){}, getBoundingClientRect(){ return { top: 0 }; },
  appendChild(){}, remove(){}, click(){}
});
const store = new Map();
const ctx = {
  console, TextEncoder, TextDecoder, Blob, Response, URL, Date, Math, JSON,
  setTimeout, clearTimeout, navigator: { clipboard: { writeText: async () => {} } },
  document: {
    getElementById(id){ if(!els.has(id)) els.set(id, mkEl()); return els.get(id); },
    createElement(){ return mkEl(); },
    body: mkEl(),
    addEventListener(){}
  },
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k)
  }
};
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.window.scrollTo = () => {};
ctx.window.scrollY = 0;
ctx.window.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: "shuire.html" });

/* ---- 点検の道具 ---- */
let ok = 0, ng = 0;
const run = (name, fn) => {
  try { fn(); console.log("  ✓ " + name); ok++; }
  catch (e) { console.log("  ✗ " + name + "\n      " + e.message); ng++; }
};
const eq = (a, b, m) => { if (a !== b) throw new Error((m || "") + "\n      得た値: " + JSON.stringify(a) + "\n      望む値: " + JSON.stringify(b)); };
const truthy = (a, m) => { if (!a) throw new Error(m || "偽でした"); };
const ev = expr => vm.runInContext(expr, ctx);

const 本文 = [
  "　第一章　人形の部屋",
  "",
  "　雨が降っていた。窓の外は白く煙って、遠くの塔の輪郭さえ溶けている。",
  "　彼は何も言わなかった。",
  "",
  "「行くのか」",
  "「行く」",
  "",
  "　第二章　朝",
  "",
  "　朝が来た。光が来た。鳥が鳴いた。"
].join("\n");

console.log("\n分割と復元");
run("章の頭で必ず切れる", () => {
  const bs = ev(`cutBlocks(${JSON.stringify(本文)}, 2200)`);
  eq(bs.length, 2, "章が二つなので二区切りのはず");
  truthy(bs[1].t.indexOf("第二章") >= 0, "二区切り目が第二章から始まっていない");
});
run("字数でも切れる", () => {
  const long = "あ".repeat(300) + "。\n" + "い".repeat(300) + "。";
  const bs = ev(`cutBlocks(${JSON.stringify(long)}, 200)`);
  truthy(bs.length >= 3, "字数で割れていない（" + bs.length + "区切り）");
});
run("区切って復元すると元の本文に戻る", () => {
  ev(`__w = {blocks: cutBlocks(${JSON.stringify(本文)}, 2200)}`);
  eq(ev("workText(__w)"), 本文.replace(/^\n+|\n+$/g, ""), "復元が一致しない");
});
run("空行が消えない", () => {
  const t = "あ。\n\n\nい。";
  ev(`__w2 = {blocks: cutBlocks(${JSON.stringify(t)}, 2200)}`);
  eq(ev("workText(__w2)"), t);
});
run("直した行が本文に反映される", () => {
  ev(`__w3 = {blocks: cutBlocks("あああ。いいい。", 2200)}; __w3.blocks[0].edits = {1: "ううう。"}`);
  eq(ev("workText(__w3)"), "あああ。ううう。");
});
run("直しても他の行の番号がずれない", () => {
  ev(`__w4 = {blocks: cutBlocks("一。二。三。", 2200)}; __w4.blocks[0].edits = {0: "壱。改行も\\n入る。"}`);
  eq(ev("lines(__w4.blocks[0].t).length"), 3, "原文の行数は不変であるべき");
  eq(ev("workText(__w4)"), "壱。改行も\n入る。二。三。");
});

console.log("\n下読み（鉛筆）");
const 引く = (text, rule) => {
  ev(`__b = {t: ${JSON.stringify(text)}, marks: [], edits: {}, note: "", done: false}`);
  const res = ev("readBlock(__b, null)");
  const hit = [];
  for (const k in res) res[k].forEach(x => hit.push(x.id));
  if (rule && hit.indexOf(rule) < 0) throw new Error("「" + rule + "」を拾えなかった。拾ったのは " + JSON.stringify(hit));
  return hit;
};
run("三点リーダの奇数", () => 引く("　そうか…と彼は言った。", "leader"));
run("！のあとの空き", () => 引く("　待て！彼は走った。", "bang"));
run("かっこの不対応", () => 引く("　彼は「行く、と言った。", "bracket"));
run("句点で割れた会話文を誤って叱らない", () => {
  const hit = 引く("「ええ。夕方までは続くそうです」");
  truthy(hit.indexOf("bracket") < 0, "対応しているかっこに鉛筆が出た");
});
run("行頭の字下げ", () => 引く("雨が降っていた。", "indent"));
run("半角の記号", () => 引く("　そうか?と彼は聞いた。", "halfmark"));
run("長い一文", () => 引く("　" + "あ".repeat(95) + "。", "long"));
run("読点の多さ", () => 引く("　あ、い、う、え、お、か、き。", "touten"));
run("文末の重なり", () => 引く("　朝が来た。光が差した。鳥が鳴いた。歩き出した。", "tail"));
run("同じ語のくり返し", () => 引く("　夕暮れの光が夕暮れの色を濃くした。", "repeat"));
run("会話文は字下げで叱られない", () => {
  const hit = 引く("「行くのか」");
  truthy(hit.indexOf("indent") < 0, "会話文に字下げの鉛筆が出た");
});
run("整った文には鉛筆が出ない", () => {
  const hit = 引く("　雨が降っていた。窓の外は白く煙っている。");
  eq(hit.length, 0, "余計に拾った: " + JSON.stringify(hit));
});
run("表記のゆれは少ないほうに出る", () => {
  const t = "　その事を思った。そのことを思った。そのことを言った。そのことを見た。";
  ev(`__y = {blocks: cutBlocks(${JSON.stringify(t)}, 2200)}; yure = buildYure(__y)`);
  const res = ev("readBlock(__y.blocks[0], null)");
  const hits = [];
  for (const k in res) res[k].forEach(x => { if (x.id === "yure") hits.push(+k); });
  eq(hits.length, 1, "ゆれは少数派の一行だけに出るべき");
  eq(hits[0], 0, "漢字（少数派）の行に出るべき");
  ev("yure = null");
});
run("設定で消した項目は出ない", () => {
  ev(`conf.rules.indent = false`);
  const hit = 引く("雨が降っていた。");
  truthy(hit.indexOf("indent") < 0, "消したのに出た");
  ev(`conf.rules.indent = true`);
});
run("通しの種類で絞られる", () => {
  ev(`__b2 = {t: "雨が降っていた。" + "あ".repeat(95) + "。", marks: [], edits: {}, note: "", done: false}`);
  const typo = ev(`(()=>{const r=readBlock(__b2, ["hyoki"]); const o=[]; for(const k in r) r[k].forEach(x=>o.push(x.id)); return o;})()`);
  truthy(typo.indexOf("indent") >= 0, "誤字の通しで字下げが出ていない");
  truthy(typo.indexOf("long") < 0, "誤字の通しに文体の鉛筆が混じった");
});

console.log("\nClaudeへの相談");
const 相談本文 = [
  "　雨が降っていた。窓の外は白く煙っている。",
  "　その事について、彼は何も言わなかった。",
  "　彼は窓辺に立った。手紙の端をなぞった。"
].join("\n");
ev(`__t = {v:2, id:"x", title:"人形の部屋", blocks: cutBlocks(${JSON.stringify(相談本文)}, 2200), pass:1, kind:"typo", log:[], history:[]}`);
ev(`migrate(__t); cur = __t; curId = "x"; index = []; yure = null`);
ev(`cur.blocks[0].fusen = [3]; cur.blocks[0].note = "ここの語尾が重い"`);   /* 二段落目の一文 */
const 票 = ev("talkText()");

run("相談票に番号と印が入る", () => {
  truthy(票.indexOf("[F1]") >= 0, "番号がない");
  truthy(票.indexOf("▼ 　その事について、彼は何も言わなかった。") >= 0, "相談する行がない");
  truthy(票.indexOf("1区切り目 4行目") >= 0, "場所が書かれていない");
});
run("前後の文が文脈として付く", () => {
  truthy(票.indexOf("前：　雨が降っていた。") >= 0, "前の文がない");
  truthy(票.indexOf("後：　彼は窓辺に立った。") >= 0, "後の文がない");
});
run("覚え書きと、返事の形の指定が入る", () => {
  truthy(票.indexOf("この区切りの覚え書き：ここの語尾が重い") >= 0, "覚え書きが渡らない");
  truthy(票.indexOf("案：") >= 0 && 票.indexOf("見立て：") >= 0, "返事の形が書かれていない");
});
run("返事を貼ると番号どおりに案が付く", () => {
  const 返事 = [
    "承知しました。三件みていきます。",
    "",
    "[F1]",
    "見立て：「その事について」が説明的で、直前の情景から視点が離れています。",
    "案：　彼は何も言わなかった。",
    "案：　そのことに、彼は何も言わなかった。",
    "",
    "他に気になる点があれば言ってください。"
  ].join("\n");
  const r = ev(`importAdvice(${JSON.stringify(返事)})`);
  eq(r.n, 1, "取り込めた件数");
  const a = ev("cur.blocks[0].advice[3]");
  truthy(a && a.indexOf("見立て：") >= 0, "案が付いていない");
  const cands = ev("advCands(cur.blocks[0].advice[3])");
  eq(cands.length, 2, "押せる候補の数");
  eq(cands[0], "　彼は何も言わなかった。", "行頭の字下げが落ちている");
});
run("番号が見つからない返事は取り込まない", () => {
  eq(ev(`importAdvice("ここはこう直すとよいと思います。").n`), 0, "何でも取り込んでしまう");
});
const 短い返事 = 印 => 印 + "\n案：　彼は黙っていた。";
run("全角の［Ｆ１］でも読める", () => {
  ev(`cur.blocks[0].advice = {}`);
  eq(ev(`importAdvice(${JSON.stringify(短い返事("［Ｆ１］"))}).n`), 1, "全角が読めない");
});
run("付箋を増やしても、書き出した時の番号のまま配られる", () => {
  ev(`cur.blocks[0].advice = {}; cur.blocks[0].fusen = [0, 3]`);   /* 書き出しのあとに一つ増やした */
  const r = ev(`importAdvice(${JSON.stringify(短い返事("[F1]"))})`);
  eq(r.n, 1, "取り込めた件数");
  truthy(ev("cur.blocks[0].advice[3]") !== undefined, "書き出した時の1番（4行目）に付くべき");
  truthy(ev("cur.blocks[0].advice[0]") === undefined, "あとから増えた付箋に付いてしまった");
});
run("控えと書き出しに案が載る", () => {
  const rows = ev("noteRows()");
  const f = rows.filter(r => r.type === "fusen");
  truthy(f.length >= 1, "付箋の行がない");
  truthy(f.some(r => r.a && r.a.length), "案が控えに渡っていない");
  truthy(ev("noteTextBody()").indexOf(" 案：") >= 0, "控えのテキストに案がない");
});
ev(`cur = null; curId = null`);

console.log("\nWordの読み書き");
run("書き出したdocxを自分で読み戻せる", () => {
  const bytes = ev(`buildDocx([para([{t:"人形の部屋",b:true,sz:30}],true), para([{t:"　雨が降っていた。"}]), para([{t:"直す前",st:true,color:"808080"}])])`);
  const buf = Buffer.from(bytes);
  fs.writeFileSync(path.join(process.cwd(), "tools/tmp-out.docx"), buf);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  ctx.__ab = ab;
  const xml = ev("readDocx(__ab)");
  return xml.then ? xml : null;
});
const xml = await ev("readDocx(__ab)");
run("読み戻した本文が合っている", () => {
  const text = ev(`xmlToText(${JSON.stringify(xml)})`);
  eq(text, "人形の部屋\n　雨が降っていた。\n直す前");
});

try { fs.unlinkSync(path.join(process.cwd(), "tools/tmp-out.docx")); } catch (e) {}
console.log("\n" + (ng ? "✗ " + ng + "件だめ、" : "") + ok + "件よし\n");
process.exit(ng ? 1 : 0);
