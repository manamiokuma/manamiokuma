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
run("機械の下読みは、既定では止まっている", () => {
  eq(ev("conf.pen"), false, "既定で点いている");
  ev(`__b0 = {t: "　そうか…と彼は言った。", marks: [], edits: {}, note: "", done: false}`);
  eq(Object.keys(ev("readBlock(__b0, null)")).length, 0, "止まっているのに鉛筆が出た");
  ev("conf.pen = true");     /* ここから先の点検は点けた状態で */
});
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
let 票 = ev("talkText()");

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
  truthy(票.indexOf("いまは「誤字と表記」の通しです") >= 0, "いまどの観点で読んでいるかが伝わらない");
});
run("同じ区切りの覚え書きは一度だけ書く", () => {
  ev(`cur.blocks[0].fusen = [1, 3]`);
  const t = ev("talkText()");
  eq(t.split("この区切りの覚え書き：").length - 1, 1, "同じ覚え書きが何度も出ている");
  ev(`cur.blocks[0].fusen = [3]`);
});
run("相談票が正本のスキルを名指しする", () => {
  const t = ev("talkText()");
  truthy(t.indexOf("【先に開いてほしいスキル】") >= 0, "見出しがない");
  truthy(t.indexOf("・writing-style（文体の正本）") >= 0, "文体の正本が挙がっていない");
  truthy(t.indexOf("・r18-craft") >= 0, "R18の様式が挙がっていない（既定では入る）");
  truthy(t.indexOf("記憶ではなく上のスキルに従って") >= 0, "記憶で答えないよう頼んでいない");
});
run("世界を選ぶとその設定資料が挙がる", () => {
  ev(`cur.world = "lukaen-omega"`);
  const t = ev("talkText()");
  truthy(t.indexOf("lukaen-omega-reference") >= 0, "シリーズの正本がない");
  truthy(t.indexOf("genshin-reference") >= 0, "併用すべき原作軸の正本がない");
});
run("併用しない組み合わせは、開かないよう書き添える", () => {
  ev(`cur.world = "lukaen-idol"`);
  const t = ev("talkText()");
  truthy(t.indexOf("lukaen-idol-reference") >= 0, "シリーズの正本がない");
  truthy(t.indexOf("genshin-reference は開かないでください") >= 0, "併用しない旨がない");
  const head = t.slice(0, t.indexOf("【お願いすること】"));
  truthy(head.indexOf("・genshin-reference") < 0, "開かないはずの正本を挙げてしまっている");
});
run("R18のない作品では r18-craft を挙げない", () => {
  ev(`cur.world = "zensetsu"; cur.r18 = true`);
  const t = ev("talkText()");
  truthy(t.indexOf("zensetsu-reference") >= 0, "シリーズの正本がない");
  truthy(t.indexOf("・r18-craft") < 0, "全年齢の作品にR18の様式を挙げている");
  truthy(t.indexOf("r18-craft は開かないでください") >= 0, "開かない理由が書かれていない");
});
run("そのほかのスキルも書き添えられる", () => {
  ev(`cur.world = "none"; cur.r18 = false; cur.moreSkills = "fanfic-production、rework-design"`);
  const t = ev("talkText()");
  truthy(t.indexOf("・fanfic-production") >= 0 && t.indexOf("・rework-design") >= 0, "書き足したスキルが出ない");
  ev(`cur.moreSkills = ""; cur.world = "none"; cur.r18 = true`);
});
run("同じ段落に続けて貼った付箋は、ひとつづきの相談になる", () => {
  ev(`cur.blocks[0].fusen = [0, 1]; cur.blocks[0].wide = {on:false, memo:""}`);   /* 一段落目の二文 */
  const items = ev("talkItems()");
  eq(items.length, 1, "続きの範囲が一件にまとまらない");
  eq(items[0].a, 0); eq(items[0].z, 1);
  const t = ev("talkText()");
  const 本体 = t.slice(t.indexOf("──── [F1]"));
  truthy(t.indexOf("1〜2行目") >= 0, "範囲が書かれていない");
  truthy(t.indexOf("この範囲でひとつづき") >= 0, "ひとつづきだと伝わらない");
  eq(本体.split("▼ ").length - 1, 2, "範囲の行が全部は出ていない");
  truthy(本体.indexOf("▼ 　雨が降っていた。") >= 0 && 本体.indexOf("▼ 窓の外は白く煙っている。") >= 0, "範囲の中身が違う");
});
run("段落をまたぐと別々の相談になる", () => {
  ev(`cur.blocks[0].fusen = [1, 3]`);   /* 一段落目の末と、二段落目の頭 */
  const items = ev("talkItems()");
  eq(items.length, 2, "段落をまたいでまとめてしまう");
});
run("離れた付箋は別々の相談になる", () => {
  ev(`cur.blocks[0].fusen = [1, 5]`);
  const items = ev("talkItems()");
  eq(items.length, 2, "離れているのにまとめてしまう");
});
run("区切りまるごとの相談は、全文を添えて出す", () => {
  ev(`cur.blocks[0].fusen = []; cur.blocks[0].wide = {on:true, memo:"なんとなく変"}`);
  const items = ev("talkItems()");
  eq(items.length, 1, "まるごとが一件にならない");
  eq(items[0].a, -1, "まるごとの印がない");
  const t = ev("talkText()");
  truthy(t.indexOf("まるごと ────") >= 0, "まるごとだと分からない");
  truthy(t.indexOf("どこが悪いか行を特定できていません") >= 0, "特定できていないと伝わらない");
  truthy(t.indexOf("本文：") >= 0 && t.indexOf("　彼は窓辺に立った。") >= 0, "区切りの全文が入っていない");
  truthy(t.indexOf("手触り：なんとなく変") >= 0, "手触りが渡らない");
});
run("言葉にできていない前提で頼んでいる", () => {
  const t = ev("talkText()");
  truthy(t.indexOf("言葉にできていない") >= 0, "曖昧なままでよいと伝わらない");
  truthy(t.indexOf("勝手に決めつけず") >= 0, "決めつけないよう頼んでいない");
  truthy(t.indexOf("何が起きているのかを言い当てて") >= 0, "まず言い当ててほしいと頼んでいない");
});
run("まるごとの相談にも案が返ってくる", () => {
  ev("talkText()");
  const r = ev(`importAdvice(${JSON.stringify("[F1]\n見立て：場面の時間が飛んでいます。\n案：一文足して間を作る。")})`);
  eq(r.n, 1, "取り込めた件数");
  truthy(ev("cur.blocks[0].advice.all") !== undefined, "まるごとの置き場に入っていない");
  ev(`cur.blocks[0].advice = {}; cur.blocks[0].wide = {on:false, memo:""}; cur.blocks[0].fusen = [3]`);
});
run("手触りは行の付箋にも付けられる", () => {
  ev(`cur.blocks[0].ftags = {3: ["重い", "視点が動く"]}; cur.blocks[0].fmemo = {}`);
  truthy(ev("talkText()").indexOf("手触り：重い、視点が動く") >= 0, "行の手触りが渡らない");
  const rows = ev("noteRows()");
  truthy(rows.some(r => r.type === "fusen" && r.m === "重い、視点が動く"), "控えに手触りが載らない");
  truthy(ev("noteTextBody()").indexOf(" 手触り：") >= 0, "控えのテキストに手触りがない");
});
run("続きの範囲では、手触りを一度だけ聞く", () => {
  ev(`cur.blocks[0].fusen = [0, 1]; cur.blocks[0].ftags = {1: ["重い"]}; cur.blocks[0].fmemo = {}`);
  const t = ev("talkText()");
  eq(t.split("手触り：").length - 1, 1, "範囲の中で手触りが繰り返されている");
  truthy(t.indexOf("手触り：重い") >= 0, "範囲のどこに書いても拾えるべき");
  ev(`cur.blocks[0].fusen = [3]; cur.blocks[0].ftags = {}; cur.blocks[0].fmemo = {}`);
});
run("札とひとことは別々に持つ", () => {
  ev(`cur.blocks[0].ftags = {3: ["重い", "視点が動く"]}; cur.blocks[0].fmemo = {3: "台詞のあと、間が足りない"}`);
  const m = ev(`memoOf(cur.blocks[0], 3)`);
  eq(m.tags.join("／"), "重い／視点が動く", "札が取り出せない");
  eq(m.free, "台詞のあと、間が足りない", "ひとことの読点が失われている");
  eq(ev(`memoText(memoOf(cur.blocks[0], 3))`), "重い、視点が動く、台詞のあと、間が足りない");
});
run("ひとことに読点を打っても札と混ざらない", () => {
  ev(`cur.blocks[0].ftags = {}; cur.blocks[0].fmemo = {3: "重い、と思ったが違う"}`);
  const m = ev(`memoOf(cur.blocks[0], 3)`);
  eq(m.tags.length, 0, "ひとことの中の語を札と取り違えている");
  eq(m.free, "重い、と思ったが違う", "ひとことが削られている");
});
run("古い持ちかたからは、札とひとことに分けて引き継ぐ", () => {
  ev(`__old = {v:2, blocks:[{t:"あ。", done:false, note:"", marks:[], fusen:[3], edits:{}, advice:{},
       fmemo:{3:"重い、なんだか遠い"}, wide:{on:true, memo:"なんとなく変"}}], pass:1, kind:"typo", log:[], history:[]}`);
  ev(`migrate(__old)`);
  eq(ev(`__old.blocks[0].ftags[3].join("／")`), "重い", "札が引き継がれない");
  eq(ev(`__old.blocks[0].fmemo[3]`), "なんだか遠い", "ひとことが引き継がれない");
  eq(ev(`__old.blocks[0].wide.tags.join("／")`), "なんとなく変", "まるごとの札が引き継がれない");
  eq(ev(`__old.blocks[0].wide.memo`), "", "まるごとのひとことが残ってしまう");
});
run("返事を貼ると番号どおりに案が付く", () => {
  ev(`cur.blocks[0].ftags = {}; cur.blocks[0].fmemo = {}`);
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
  票 = ev("talkText()");
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

console.log("\n差分回収と、自分の直しから作る鉛筆");
const 型 = (a, b) => ev(`diffMoves(${JSON.stringify(a)}, ${JSON.stringify(b)})`).map(m => m.k + (m.a ? "「" + m.a + "」" : "") + (m.b ? "→「" + m.b + "」" : "")).join(" ");
run("削った語を切り出す", () => eq(型("　彼は静かに窓を閉めた。", "　窓を閉めた。"), "del「彼は静かに」"));
run("言い換えと語尾の直しを分ける", () => eq(型("　その事について、彼は何も言わなかったのだった。", "　そのことについて、彼は何も言わなかった。"), "sub「事」→「こと」 tail「のだった」"));
run("語尾の直しは、語尾の形のまま切り出す", () => eq(型("　もう戻れないと思った。", "　もう戻れないと思う。"), "tail「った」→「う」"));
run("読点の増減は本人の領分として分ける", () => eq(型("　手紙の端を、指でなぞった。", "　手紙の端を指でなぞった。"), "punct「、」"));
run("長い書き直しは規則にしない", () => {
  const m = ev(`diffMoves("　光が差し、鳥が鳴き、朝が来て、風が吹いて、それから彼は立ち上がった。", "　彼は立ち上がった。")`);
  truthy(m.some(x => x.k === "rewrite"), "十二字を超える直しが規則候補に混じる: " + JSON.stringify(m));
});
run("同じ直しを二回すると規則候補になり、一回なら参考に落ちる", () => {
  ev(`__h = {v:2, id:"h", title:"t", blocks: cutBlocks("　あ。", 2200), pass:1, kind:"typo", history:[], log:[
    {p:1,k:"typo",b:0,i:0,o:"　彼は静かに窓を閉めた。", n:"　窓を閉めた。", at:1},
    {p:1,k:"typo",b:0,i:1,o:"　彼は静かに扉を押した。", n:"　扉を押した。", at:2},
    {p:1,k:"typo",b:0,i:2,o:"　まるで夢のように静かだった。", n:"　静かだった。", at:3}
  ]}; migrate(__h); cur = __h; curId = "h"; index = []`);
  const h = ev("harvest()");
  eq(h.n.fix, 3);
  const cand = ev("harvestRows(harvest(), 2)");
  eq(cand.length, 1, "規則候補の数");
  eq(cand[0].k, "彼は静かに"); eq(cand[0].n, 2);
  truthy(ev("harvestText()").indexOf("削った　彼は静かに　2回") >= 0, "回収の書き出しに載らない");
});
run("規則候補から鉛筆ができて、残っている行に引かれる", () => {
  ev("buildMine()");
  eq(ev("mineCache.length"), 1, "鉛筆の本数");
  ev(`__b = {t:"　彼は静かに息を吐いた。\\n　風が吹いた。", done:false, note:"", marks:[], fusen:[], edits:{}, advice:{}, fmemo:{}, ftags:{}, wide:{on:false,memo:"",tags:[]}}`);
  const r = ev(`readBlock(__b, ["buntai"])`);        /* 通しの種類にかかわらず出る */
  truthy(r[0] && r[0].some(x => x.id.indexOf("mine:") === 0), "残っている行に鉛筆が引かれない: " + JSON.stringify(r));
  truthy(!r[2], "形のない行にまで引いている");
  truthy(r[0][0].msg.indexOf("よく削る") >= 0, "言葉が違う: " + r[0][0].msg);
});
run("語尾の鉛筆は、語尾にだけ引く", () => {
  ev(`cur.log = [
    {p:1,k:"typo",b:0,i:0,o:"　鳥が鳴いた。", n:"　鳥が鳴く。", at:1},
    {p:1,k:"typo",b:0,i:1,o:"　靴を履いた。", n:"　靴を履く。", at:2}
  ]; buildMine()`);
  eq(ev("mineCache.length"), 1);
  eq(ev("mineCache[0].kind"), "tail");
  ev(`__b2 = {t:"　塔は町の外れに立っていた。\\n　いたずらに時が過ぎる。", done:false, note:"", marks:[], fusen:[], edits:{}, advice:{}, fmemo:{}, ftags:{}, wide:{on:false,memo:"",tags:[]}}`);
  const r = ev(`readBlock(__b2, null)`);
  truthy(r[0] && r[0].some(x => x.id.indexOf("mine:") === 0), "語尾に引かれない");
  truthy(!(r[2] && r[2].some(x => x.id.indexOf("mine:") === 0)), "文頭の「いた」にまで引いている");
});
run("語尾を丸ごと削ったときも、鍵と鉛筆が壊れない", () => {
  ev(`cur.log = [
    {p:1,k:"typo",b:0,i:0,o:"　廊下は暗かったのだった。", n:"　廊下は暗かった。", at:1},
    {p:1,k:"typo",b:0,i:1,o:"　何も言わなかったのだった。", n:"　何も言わなかった。", at:2}
  ]; buildMine()`);
  const cand = ev("harvestRows(harvest(), 2)");
  eq(cand.length, 1); eq(cand[0].k, "のだった", "言い換え先がないのに → が付いている: " + cand[0].k);
  eq(ev("mineCache.length"), 1);
  truthy(ev("mineCache[0].name").indexOf("語尾をよく削る「のだった」") === 0, "言葉が違う: " + ev("mineCache[0].name"));
  truthy(ev("harvestText()").indexOf("undefined") < 0, "書き出しに undefined が混じる");
});
run("設定で止められる", () => {
  ev("conf.mine = false; buildMine()");
  eq(ev("mineCache.length"), 0);
  ev("conf.mine = true; buildMine(); cur = null; curId = null");
});

console.log("\n締め切りと見通し");
const 日 = n => { const d = new Date(); d.setDate(d.getDate() - n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const 先 = n => 日(-n);

run("読みはじめた日から数えるので、初日でも当てにできる", () => {
  ev(`daily = ${JSON.stringify({ [日(0)]: 2 })}`);
  eq(ev("pace()"), 2, "きょう2区切りなら一日2");
  ev(`daily = ${JSON.stringify({ [日(0)]: 4, [日(1)]: 4, [日(2)]: 4 })}`);
  eq(ev("pace()"), 4, "三日で12区切りなら一日4");
});
run("間をあけた日も数に入る", () => {
  ev(`daily = ${JSON.stringify({ [日(6)]: 10 })}`);
  const p = ev("pace()");
  truthy(p > 1.3 && p < 1.6, "七日で10区切りなら一日1.4前後。得た値 " + p);
});
run("実績がなければ日付を当てずっぽうで出さない", () => {
  ev("daily = {}");
  eq(ev("eta(17)"), null, "何もしていないのに見通しを出している");
});
run("締め切りまでの日数と、一日に要る区切り数", () => {
  ev(`daily = {}`);
  eq(ev(`daysTo(${JSON.stringify(先(5))})`), 5, "五日後を五日と数えない");
  eq(ev(`daysTo(${JSON.stringify(日(2))})`), -2, "過ぎた日を負で数えない");
  const w = { due: 先(4), blocks: Array.from({ length: 20 }, (x, i) => ({ done: i < 8 })) };
  const i = ev(`dueInfo(${JSON.stringify(w)})`);
  eq(i.rest, 12, "残りの区切り数");
  eq(i.days, 4);
  eq(i.need, 3, "12区切りを4日で割ると一日3");
});
run("締め切り当日と、過ぎたあと", () => {
  const 当日 = ev(`dueInfo(${JSON.stringify({ due: 日(0), blocks: [{ done: false }, { done: false }, { done: true }] })})`);
  eq(当日.days, 0); eq(当日.need, 2, "当日は残り全部が今日の分");
  const 超過 = ev(`dueInfo(${JSON.stringify({ due: 日(3), blocks: [{ done: false }, { done: false }] })})`);
  eq(超過.days, -3); eq(超過.need, 2, "過ぎていても残り全部");
});
run("読み終えた原稿と校了した原稿は、締め切りを急かさない", () => {
  eq(ev(`dueInfo(${JSON.stringify({ due: 先(3), blocks: [{ done: true }] })}).done`), true, "読み終えていると分からない");
  eq(ev(`dueInfo(${JSON.stringify({ due: 先(3), closed: true, blocks: [{ done: false }] })})`), null, "校了後も急かしている");
});
run("きょうの分は、締め切りのある原稿から逆算される", () => {
  ev(`conf.quota = 3; index = [{id:"a", title:"x", done:0, total:20, due:${JSON.stringify(先(4))}}]`);
  eq(ev("todayNeed()"), 5, "20区切りを4日で割ると一日5");
  ev(`index = [{id:"a", title:"x", done:0, total:20, due:null}]`);
  eq(ev("todayNeed()"), 3, "締め切りがなければ決めた数のまま");
  ev(`index = []; daily = {}`);
});

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
