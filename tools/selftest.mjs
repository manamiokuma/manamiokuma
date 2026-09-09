/* 朱入れ 自己点検
   shuire.html の <script> を偽のDOMの上で走らせ、
   分割・復元・下読み・docxの読み書きを確かめる。
   使いかた:  node tools/selftest.mjs                             */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const html = fs.readFileSync(new URL("../shuire.html", import.meta.url), "utf8");
const src = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));   /* 最後の <script> が本体（前に起動の見張りがある） */

/* ---- 偽のDOM（端末ひとつぶん） ---- */
const mkEl = () => ({
  innerHTML: "", textContent: "", value: "", className: "", dataset: {}, style: {},
  classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  querySelectorAll(){ return []; }, querySelector(){ return null; },
  addEventListener(){}, focus(){}, setSelectionRange(){}, getBoundingClientRect(){ return { top: 0 }; },
  appendChild(){}, remove(){}, click(){}
});
function makeCtx(opt){
  opt = opt || {};
  const els = new Map();
  const store = new Map();
  const c = {
    console, TextEncoder, TextDecoder, Blob, Response, URL, Date, Math, JSON,
    setTimeout, clearTimeout, navigator: { clipboard: { writeText: async () => {} } },
    document: {
      getElementById(id){ if(!els.has(id)) els.set(id, mkEl()); return els.get(id); },
      createElement(){ return mkEl(); },
      body: mkEl(),
      addEventListener(){}
    },
    localStorage: opt.noStore ? {
      getItem(){ throw new Error("SecurityError"); }, setItem(){ throw new Error("SecurityError"); }, removeItem(){ throw new Error("SecurityError"); }
    } : {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: k => store.delete(k)
    },
    atob: s => Buffer.from(s, "base64").toString("latin1")
  };
  c.window = c; c.globalThis = c;
  c.window.scrollTo = () => {}; c.window.scrollY = 0; c.window.addEventListener = () => {};
  vm.createContext(c);
  vm.runInContext(src, c, { filename: "shuire.html" });
  c.__store = store; c.__els = els;
  return c;
}
const ctx = makeCtx();

/* ---- 偽の保管庫（claude.ai の db のふるまいを机の上で真似る。二つの端末で共有する） ---- */
function fakeDb(){
  const docs = new Map(), subs = [];
  const parent = p => p.slice(0, p.lastIndexOf("/"));
  const copy = o => JSON.parse(JSON.stringify(o));
  const snap = p => ({ id: p.slice(p.lastIndexOf("/") + 1), exists: docs.has(p), data: () => docs.has(p) ? copy(docs.get(p)) : undefined });
  const inCol = col => [...docs.keys()].filter(p => parent(p) === col).sort().map(snap);
  const qs = (col, changes) => ({ docs: inCol(col), size: inCol(col).length, empty: !inCol(col).length, docChanges: () => changes });
  const notify = (p, type) => subs.slice().forEach(l => {
    if (l.kind === "doc" && l.path === p) l.fn(snap(p));
    else if (l.kind === "col" && l.path === parent(p)) l.fn(qs(l.path, [{ type, doc: snap(p) }]));
  });
  const unsub = l => () => { const i = subs.indexOf(l); if (i >= 0) subs.splice(i, 1); };
  const doc = p => ({
    async get(){ return snap(p); },
    async set(d){ const type = docs.has(p) ? "modified" : "added"; docs.set(p, copy(d)); notify(p, type); },
    async update(d){ docs.set(p, Object.assign(docs.get(p) || {}, copy(d))); notify(p, "modified"); },
    async delete(){ if(!docs.has(p)) return; docs.delete(p); notify(p, "removed"); },
    onSnapshot(fn){ const l = { kind: "doc", path: p, fn }; subs.push(l); setTimeout(() => { if (subs.includes(l)) fn(snap(p)); }, 0); return unsub(l); }
  });
  const collection = p => ({
    limit(){ return this; }, where(){ return this; }, orderBy(){ return this; },
    async get(){ return qs(p, []); },
    onSnapshot(fn){ const l = { kind: "col", path: p, fn }; subs.push(l); setTimeout(() => { if (subs.includes(l)) fn(qs(p, inCol(p).map(d => ({ type: "added", doc: d })))); }, 0); return unsub(l); }
  });
  return { doc, collection, __docs: docs };
}
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

/* ---- 点検の道具 ---- */
let ok = 0, ng = 0;
const run = async (name, fn) => {
  try { const r = fn(); if (r && r.then) await r; console.log("  ✓ " + name); ok++; }
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
await run("章の頭で必ず切れる", () => {
  const bs = ev(`cutBlocks(${JSON.stringify(本文)}, 2200)`);
  eq(bs.length, 2, "章が二つなので二区切りのはず");
  truthy(bs[1].t.indexOf("第二章") >= 0, "二区切り目が第二章から始まっていない");
});
await run("字数でも切れる", () => {
  const long = "あ".repeat(300) + "。\n" + "い".repeat(300) + "。";
  const bs = ev(`cutBlocks(${JSON.stringify(long)}, 200)`);
  truthy(bs.length >= 3, "字数で割れていない（" + bs.length + "区切り）");
});
await run("区切って復元すると元の本文に戻る", () => {
  ev(`__w = {blocks: cutBlocks(${JSON.stringify(本文)}, 2200)}`);
  eq(ev("workText(__w)"), 本文.replace(/^\n+|\n+$/g, ""), "復元が一致しない");
});
await run("空行が消えない", () => {
  const t = "あ。\n\n\nい。";
  ev(`__w2 = {blocks: cutBlocks(${JSON.stringify(t)}, 2200)}`);
  eq(ev("workText(__w2)"), t);
});
await run("直した行が本文に反映される", () => {
  ev(`__w3 = {blocks: cutBlocks("あああ。いいい。", 2200)}; __w3.blocks[0].edits = {1: "ううう。"}`);
  eq(ev("workText(__w3)"), "あああ。ううう。");
});
await run("直しても他の行の番号がずれない", () => {
  ev(`__w4 = {blocks: cutBlocks("一。二。三。", 2200)}; __w4.blocks[0].edits = {0: "壱。改行も\\n入る。"}`);
  eq(ev("lines(__w4.blocks[0].t).length"), 3, "原文の行数は不変であるべき");
  eq(ev("workText(__w4)"), "壱。改行も\n入る。二。三。");
});

console.log("\n段落ずつの本文");
await run("段落は改行で分かれ、空行は空きになる。文の番号は一文ずつと同じ", () => {
  ev(`__pb = {t: "　朝が来た。光が来た。\\n　鳥が鳴いた。\\n\\n　夜が来た。", marks:[1], fusen:[], edits:{}, advice:{}, fmemo:{}, ftags:{}, wide:{on:false,memo:"",tags:[]}, note:"", done:false}; cur={blocks:[__pb], log:[]}; pos=0;`);
  const html = ev("renderPara(__pb, lines(__pb.t), {})");
  eq((html.match(/<p class="pt">/g) || []).length, 3, "段落の数");
  eq((html.match(/class="lngap"/g) || []).length, 1, "空行の数");
  eq((html.match(/class="sen[^"]*" data-k="(\d+)"/g) || []).length, 4, "文の数");
  truthy(html.includes('class="sen mk" data-k="1"'), "朱の文に印がない");
  const ls = ev("lines(__pb.t)");
  eq(ls[1], "光が来た。", "文の番号が一文ずつとずれている");
});

console.log("\n下読み（鉛筆）");
await run("機械の下読みは、既定では止まっている", () => {
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
await run("三点リーダの奇数", () => 引く("　そうか…と彼は言った。", "leader"));
await run("！のあとの空き", () => 引く("　待て！彼は走った。", "bang"));
await run("かっこの不対応", () => 引く("　彼は「行く、と言った。", "bracket"));
await run("句点で割れた会話文を誤って叱らない", () => {
  const hit = 引く("「ええ。夕方までは続くそうです」");
  truthy(hit.indexOf("bracket") < 0, "対応しているかっこに鉛筆が出た");
});
await run("行頭の字下げ", () => 引く("雨が降っていた。", "indent"));
await run("半角の記号", () => 引く("　そうか?と彼は聞いた。", "halfmark"));
await run("長い一文", () => 引く("　" + "あ".repeat(95) + "。", "long"));
await run("読点の多さ", () => 引く("　あ、い、う、え、お、か、き。", "touten"));
await run("文末の重なり", () => 引く("　朝が来た。光が差した。鳥が鳴いた。歩き出した。", "tail"));
await run("同じ語のくり返し", () => 引く("　夕暮れの光が夕暮れの色を濃くした。", "repeat"));
await run("会話文は字下げで叱られない", () => {
  const hit = 引く("「行くのか」");
  truthy(hit.indexOf("indent") < 0, "会話文に字下げの鉛筆が出た");
});
await run("整った文には鉛筆が出ない", () => {
  const hit = 引く("　雨が降っていた。窓の外は白く煙っている。");
  eq(hit.length, 0, "余計に拾った: " + JSON.stringify(hit));
});
await run("表記のゆれは少ないほうに出る", () => {
  const t = "　その事を思った。そのことを思った。そのことを言った。そのことを見た。";
  ev(`__y = {blocks: cutBlocks(${JSON.stringify(t)}, 2200)}; yure = buildYure(__y)`);
  const res = ev("readBlock(__y.blocks[0], null)");
  const hits = [];
  for (const k in res) res[k].forEach(x => { if (x.id === "yure") hits.push(+k); });
  eq(hits.length, 1, "ゆれは少数派の一行だけに出るべき");
  eq(hits[0], 0, "漢字（少数派）の行に出るべき");
  ev("yure = null");
});
await run("設定で消した項目は出ない", () => {
  ev(`conf.rules.indent = false`);
  const hit = 引く("雨が降っていた。");
  truthy(hit.indexOf("indent") < 0, "消したのに出た");
  ev(`conf.rules.indent = true`);
});
await run("通しの種類で絞られる", () => {
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

await run("相談票に番号と印が入る", () => {
  truthy(票.indexOf("[F1]") >= 0, "番号がない");
  truthy(票.indexOf("▼ 　その事について、彼は何も言わなかった。") >= 0, "相談する行がない");
  truthy(票.indexOf("1区切り目 4行目") >= 0, "場所が書かれていない");
});
await run("前後の文が文脈として付く", () => {
  truthy(票.indexOf("前：　雨が降っていた。") >= 0, "前の文がない");
  truthy(票.indexOf("後：　彼は窓辺に立った。") >= 0, "後の文がない");
});
await run("覚え書きと、返事の形の指定が入る", () => {
  truthy(票.indexOf("この区切りの覚え書き：ここの語尾が重い") >= 0, "覚え書きが渡らない");
  truthy(票.indexOf("案：") >= 0 && 票.indexOf("見立て：") >= 0, "返事の形が書かれていない");
  truthy(票.indexOf("いまは「誤字と表記」の通しです") >= 0, "いまどの観点で読んでいるかが伝わらない");
});
await run("同じ区切りの覚え書きは一度だけ書く", () => {
  ev(`cur.blocks[0].fusen = [1, 3]`);
  const t = ev("talkText()");
  eq(t.split("この区切りの覚え書き：").length - 1, 1, "同じ覚え書きが何度も出ている");
  ev(`cur.blocks[0].fusen = [3]`);
});
await run("相談票が正本のスキルを名指しする", () => {
  const t = ev("talkText()");
  truthy(t.indexOf("【先に開いてほしいスキル】") >= 0, "見出しがない");
  truthy(t.indexOf("・writing-style（文体の正本）") >= 0, "文体の正本が挙がっていない");
  truthy(t.indexOf("・r18-craft") >= 0, "R18の様式が挙がっていない（既定では入る）");
  truthy(t.indexOf("記憶ではなく上のスキルに従って") >= 0, "記憶で答えないよう頼んでいない");
});
await run("世界を選ぶとその設定資料が挙がる", () => {
  ev(`cur.world = "lukaen-omega"`);
  const t = ev("talkText()");
  truthy(t.indexOf("lukaen-omega-reference") >= 0, "シリーズの正本がない");
  truthy(t.indexOf("genshin-reference") >= 0, "併用すべき原作軸の正本がない");
});
await run("併用しない組み合わせは、開かないよう書き添える", () => {
  ev(`cur.world = "lukaen-idol"`);
  const t = ev("talkText()");
  truthy(t.indexOf("lukaen-idol-reference") >= 0, "シリーズの正本がない");
  truthy(t.indexOf("genshin-reference は開かないでください") >= 0, "併用しない旨がない");
  const head = t.slice(0, t.indexOf("【お願いすること】"));
  truthy(head.indexOf("・genshin-reference") < 0, "開かないはずの正本を挙げてしまっている");
});
await run("R18のない作品では r18-craft を挙げない", () => {
  ev(`cur.world = "zensetsu"; cur.r18 = true`);
  const t = ev("talkText()");
  truthy(t.indexOf("zensetsu-reference") >= 0, "シリーズの正本がない");
  truthy(t.indexOf("・r18-craft") < 0, "全年齢の作品にR18の様式を挙げている");
  truthy(t.indexOf("r18-craft は開かないでください") >= 0, "開かない理由が書かれていない");
});
await run("そのほかのスキルも書き添えられる", () => {
  ev(`cur.world = "none"; cur.r18 = false; cur.moreSkills = "fanfic-production、rework-design"`);
  const t = ev("talkText()");
  truthy(t.indexOf("・fanfic-production") >= 0 && t.indexOf("・rework-design") >= 0, "書き足したスキルが出ない");
  ev(`cur.moreSkills = ""; cur.world = "none"; cur.r18 = true`);
});
await run("同じ段落に続けて貼った付箋は、ひとつづきの相談になる", () => {
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
await run("段落をまたぐと別々の相談になる", () => {
  ev(`cur.blocks[0].fusen = [1, 3]`);   /* 一段落目の末と、二段落目の頭 */
  const items = ev("talkItems()");
  eq(items.length, 2, "段落をまたいでまとめてしまう");
});
await run("離れた付箋は別々の相談になる", () => {
  ev(`cur.blocks[0].fusen = [1, 5]`);
  const items = ev("talkItems()");
  eq(items.length, 2, "離れているのにまとめてしまう");
});
await run("区切りまるごとの相談は、全文を添えて出す", () => {
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
await run("言葉にできていない前提で頼んでいる", () => {
  const t = ev("talkText()");
  truthy(t.indexOf("言葉にできていない") >= 0, "曖昧なままでよいと伝わらない");
  truthy(t.indexOf("勝手に決めつけず") >= 0, "決めつけないよう頼んでいない");
  truthy(t.indexOf("何が起きているのかを言い当てて") >= 0, "まず言い当ててほしいと頼んでいない");
});
await run("まるごとの相談にも案が返ってくる", () => {
  ev("talkText()");
  const r = ev(`importAdvice(${JSON.stringify("[F1]\n見立て：場面の時間が飛んでいます。\n案：一文足して間を作る。")})`);
  eq(r.n, 1, "取り込めた件数");
  truthy(ev("cur.blocks[0].advice.all") !== undefined, "まるごとの置き場に入っていない");
  ev(`cur.blocks[0].advice = {}; cur.blocks[0].wide = {on:false, memo:""}; cur.blocks[0].fusen = [3]`);
});
await run("手触りは行の付箋にも付けられる", () => {
  ev(`cur.blocks[0].ftags = {3: ["重い", "視点が動く"]}; cur.blocks[0].fmemo = {}`);
  truthy(ev("talkText()").indexOf("手触り：重い、視点が動く") >= 0, "行の手触りが渡らない");
  const rows = ev("noteRows()");
  truthy(rows.some(r => r.type === "fusen" && r.m === "重い、視点が動く"), "控えに手触りが載らない");
  truthy(ev("noteTextBody()").indexOf(" 手触り：") >= 0, "控えのテキストに手触りがない");
});
await run("続きの範囲では、手触りを一度だけ聞く", () => {
  ev(`cur.blocks[0].fusen = [0, 1]; cur.blocks[0].ftags = {1: ["重い"]}; cur.blocks[0].fmemo = {}`);
  const t = ev("talkText()");
  eq(t.split("手触り：").length - 1, 1, "範囲の中で手触りが繰り返されている");
  truthy(t.indexOf("手触り：重い") >= 0, "範囲のどこに書いても拾えるべき");
  ev(`cur.blocks[0].fusen = [3]; cur.blocks[0].ftags = {}; cur.blocks[0].fmemo = {}`);
});
await run("札とひとことは別々に持つ", () => {
  ev(`cur.blocks[0].ftags = {3: ["重い", "視点が動く"]}; cur.blocks[0].fmemo = {3: "台詞のあと、間が足りない"}`);
  const m = ev(`memoOf(cur.blocks[0], 3)`);
  eq(m.tags.join("／"), "重い／視点が動く", "札が取り出せない");
  eq(m.free, "台詞のあと、間が足りない", "ひとことの読点が失われている");
  eq(ev(`memoText(memoOf(cur.blocks[0], 3))`), "重い、視点が動く、台詞のあと、間が足りない");
});
await run("ひとことに読点を打っても札と混ざらない", () => {
  ev(`cur.blocks[0].ftags = {}; cur.blocks[0].fmemo = {3: "重い、と思ったが違う"}`);
  const m = ev(`memoOf(cur.blocks[0], 3)`);
  eq(m.tags.length, 0, "ひとことの中の語を札と取り違えている");
  eq(m.free, "重い、と思ったが違う", "ひとことが削られている");
});
await run("古い持ちかたからは、札とひとことに分けて引き継ぐ", () => {
  ev(`__old = {v:2, blocks:[{t:"あ。", done:false, note:"", marks:[], fusen:[3], edits:{}, advice:{},
       fmemo:{3:"重い、なんだか遠い"}, wide:{on:true, memo:"なんとなく変"}}], pass:1, kind:"typo", log:[], history:[]}`);
  ev(`migrate(__old)`);
  eq(ev(`__old.blocks[0].ftags[3].join("／")`), "重い", "札が引き継がれない");
  eq(ev(`__old.blocks[0].fmemo[3]`), "なんだか遠い", "ひとことが引き継がれない");
  eq(ev(`__old.blocks[0].wide.tags.join("／")`), "なんとなく変", "まるごとの札が引き継がれない");
  eq(ev(`__old.blocks[0].wide.memo`), "", "まるごとのひとことが残ってしまう");
});
await run("返事を貼ると番号どおりに案が付く", () => {
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
await run("番号が見つからない返事は取り込まない", () => {
  eq(ev(`importAdvice("ここはこう直すとよいと思います。").n`), 0, "何でも取り込んでしまう");
});
const 短い返事 = 印 => 印 + "\n案：　彼は黙っていた。";
await run("全角の［Ｆ１］でも読める", () => {
  ev(`cur.blocks[0].advice = {}`);
  eq(ev(`importAdvice(${JSON.stringify(短い返事("［Ｆ１］"))}).n`), 1, "全角が読めない");
});
await run("付箋を増やしても、書き出した時の番号のまま配られる", () => {
  ev(`cur.blocks[0].advice = {}; cur.blocks[0].fusen = [0, 3]`);   /* 書き出しのあとに一つ増やした */
  const r = ev(`importAdvice(${JSON.stringify(短い返事("[F1]"))})`);
  eq(r.n, 1, "取り込めた件数");
  truthy(ev("cur.blocks[0].advice[3]") !== undefined, "書き出した時の1番（4行目）に付くべき");
  truthy(ev("cur.blocks[0].advice[0]") === undefined, "あとから増えた付箋に付いてしまった");
});
await run("控えと書き出しに案が載る", () => {
  const rows = ev("noteRows()");
  const f = rows.filter(r => r.type === "fusen");
  truthy(f.length >= 1, "付箋の行がない");
  truthy(f.some(r => r.a && r.a.length), "案が控えに渡っていない");
  truthy(ev("noteTextBody()").indexOf(" 案：") >= 0, "控えのテキストに案がない");
});
ev(`cur = null; curId = null`);

console.log("\n差分回収と、自分の直しから作る鉛筆");
const 型 = (a, b) => ev(`diffMoves(${JSON.stringify(a)}, ${JSON.stringify(b)})`).map(m => m.k + (m.a ? "「" + m.a + "」" : "") + (m.b ? "→「" + m.b + "」" : "")).join(" ");
await run("削った語を切り出す", () => eq(型("　彼は静かに窓を閉めた。", "　窓を閉めた。"), "del「彼は静かに」"));
await run("言い換えと語尾の直しを分ける", () => eq(型("　その事について、彼は何も言わなかったのだった。", "　そのことについて、彼は何も言わなかった。"), "sub「事」→「こと」 tail「のだった」"));
await run("語尾の直しは、語尾の形のまま切り出す", () => eq(型("　もう戻れないと思った。", "　もう戻れないと思う。"), "tail「った」→「う」"));
await run("読点の増減は本人の領分として分ける", () => eq(型("　手紙の端を、指でなぞった。", "　手紙の端を指でなぞった。"), "punct「、」"));
await run("長い書き直しは規則にしない", () => {
  const m = ev(`diffMoves("　光が差し、鳥が鳴き、朝が来て、風が吹いて、それから彼は立ち上がった。", "　彼は立ち上がった。")`);
  truthy(m.some(x => x.k === "rewrite"), "十二字を超える直しが規則候補に混じる: " + JSON.stringify(m));
});
await run("同じ直しを二回すると規則候補になり、一回なら参考に落ちる", () => {
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
await run("規則候補から鉛筆ができて、残っている行に引かれる", () => {
  ev("buildMine()");
  eq(ev("mineCache.length"), 1, "鉛筆の本数");
  ev(`__b = {t:"　彼は静かに息を吐いた。\\n　風が吹いた。", done:false, note:"", marks:[], fusen:[], edits:{}, advice:{}, fmemo:{}, ftags:{}, wide:{on:false,memo:"",tags:[]}}`);
  const r = ev(`readBlock(__b, ["buntai"])`);        /* 通しの種類にかかわらず出る */
  truthy(r[0] && r[0].some(x => x.id.indexOf("mine:") === 0), "残っている行に鉛筆が引かれない: " + JSON.stringify(r));
  truthy(!r[2], "形のない行にまで引いている");
  truthy(r[0][0].msg.indexOf("よく削る") >= 0, "言葉が違う: " + r[0][0].msg);
});
await run("語尾の鉛筆は、語尾にだけ引く", () => {
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
await run("語尾を丸ごと削ったときも、鍵と鉛筆が壊れない", () => {
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
await run("設定で止められる", () => {
  ev("conf.mine = false; buildMine()");
  eq(ev("mineCache.length"), 0);
  ev("conf.mine = true; buildMine(); cur = null; curId = null");
});

console.log("\n過去の直しの持ち越し");
const 対 = (a, b) => ev(`alignPairs(sentencesOf(${JSON.stringify(a)}), sentencesOf(${JSON.stringify(b)}))`);
await run("二つの版を文で突き合わせて、変わった文の対だけを取り出す", () => {
  const pairs = 対("　彼は静かに窓を閉めた。\n　雨はまだ降っていた。\n「行くのか」\n　その事について、彼は何も言わなかったのだった。\n　塔は町の外れに立っていた。",
                  "　窓を閉めた。\n　雨はまだ降っていた。\n「行くのか」\n　そのことについて、彼は何も言わなかった。\n　塔は町の外れに立っていた。");
  eq(pairs.length, 2, "変わった文の数: " + JSON.stringify(pairs));
  eq(pairs[0].o, "彼は静かに窓を閉めた。"); eq(pairs[0].n, "窓を閉めた。");
  eq(pairs[1].o, "その事について、彼は何も言わなかったのだった。");
});
await run("文が増えたり消えたりしても組み違えない", () => {
  const pairs = 対("一つ目。\n二つ目。\n三つ目。\n四つ目。", "一つ目。\n三つ目。\n四つ目に足した。\n五つ目。");
  truthy(pairs.some(x => x.o === "二つ目。" && x.n === ""), "消えた文を拾えない: " + JSON.stringify(pairs));
  truthy(pairs.some(x => x.o === "四つ目。" && x.n === "四つ目に足した。"), "似た文を組めない: " + JSON.stringify(pairs));
  truthy(pairs.some(x => x.o === "" && x.n === "五つ目。"), "増えた文を拾えない");
});
await run("持ち越した直しから、新しい原稿に先回りの鉛筆が引かれる", () => {
  ev("memory = []; cur = null; curId = null");
  const n = ev(`importPairs(${JSON.stringify("　彼は静かに窓を閉めた。\n　彼は静かに扉を押した。")}, ${JSON.stringify("　窓を閉めた。\n　扉を押した。")}, "旧作")`);
  eq(n, 2, "持ち越した数");
  ev(`__n = {v:2, id:"n", title:"新作", blocks: cutBlocks("　彼は静かに息を吐いた。それから歩き出した。", 2200), pass:1, kind:"typo", log:[], history:[]}; migrate(__n); cur = __n; curId = "n"; index = []; buildMine()`);
  eq(ev("mineCache.length"), 1, "持ち越しから鉛筆ができない");
  const r = ev("readBlock(cur.blocks[0], null)");
  truthy(r[0] && r[0].some(x => x.id.indexOf("mine:") === 0), "新しい原稿の一行目に引かれない: " + JSON.stringify(r));
  truthy(!r[1], "形のない行にまで引いている");
});
await run("同じ作品を入れ直すと置き換わり、外すと消える", () => {
  ev(`importPairs(${JSON.stringify("あ。\nい。")}, ${JSON.stringify("あ。\nう。")}, "旧作")`);
  eq(ev("memory.length"), 1, "入れ直しで二重になっている");
  ev(`memory = memory.filter(x => x.w !== "旧作"); buildMine()`);
  eq(ev("mineCache.length"), 0, "外しても鉛筆が残る");
  ev("memory = []; cur = null; curId = null");
});

console.log("\n差分メモの読み込み");
await run("矢印・削除・回数を読む", () => {
  const r = ev(`parseMemo(${JSON.stringify("- 静かに を削除　×4\n・事 → こと　3件\n「のだった」→「だった」\nまるで夢のように（削除）\n彼女の目 -> 目（2）")})`);
  eq(r.pairs.length, 5, "読めた行の数: " + JSON.stringify(r));
  eq(r.pairs[0].o, "静かに"); eq(r.pairs[0].n, ""); eq(r.pairs[0].c, 4, "×4 を回数として読めない");
  eq(r.pairs[1].o, "事"); eq(r.pairs[1].n, "こと"); eq(r.pairs[1].c, 3, "3件 を回数として読めない");
  eq(r.pairs[2].o, "のだった"); eq(r.pairs[2].n, "だった", "かっこを剥がせない");
  eq(r.pairs[3].n, "", "（削除）を削除として読めない");
  eq(r.pairs[4].c, 2, "（2）を回数として読めない");
});
await run("読めない行は飛ばして、飛ばしたことを伝える", () => {
  const r = ev(`parseMemo(${JSON.stringify("# 見出し\nただの説明文\n事 → こと")})`);
  eq(r.pairs.length, 1); eq(r.skipped.length, 1, "説明文を飛ばしたことが分からない");
});
await run("メモの対は突き合わせずに、書いてあるとおりに数える", () => {
  ev("memory = []; cur = null; curId = null");
  ev(`importMemo(${JSON.stringify("静かに を削除　×3\nのだった → だった　×2\n事 → こと")}, "旧作の控え")`);
  const cand = ev("harvestRows(harvest(memory), 2)");
  const keys = cand.map(x => x.k + ":" + x.n).join(" ");
  truthy(keys.indexOf("静かに:3") >= 0, "削除の回数が違う: " + keys);
  truthy(keys.indexOf("のだった → だった:2") >= 0, "言い換えが「の」に縮んでいる（突き合わせてしまっている）: " + keys);
  truthy(keys.indexOf("事 → こと") < 0, "一回きりが規則候補に混じる");
});
await run("メモから先回りの鉛筆ができる", () => {
  ev(`__m = {v:2, id:"m", title:"新作", blocks: cutBlocks("　彼は静かに息を吐いた。それが答えなのだった。", 2200), pass:1, kind:"typo", log:[], history:[]}; migrate(__m); cur = __m; curId = "m"; index = []; buildMine()`);
  eq(ev("mineCache.length"), 2, "鉛筆の本数");
  const r = ev("readBlock(cur.blocks[0], null)");
  truthy(r[0] && r[0].some(x => x.msg.indexOf("よく削る「静かに」") === 0), "削除の鉛筆が引かれない: " + JSON.stringify(r));
  truthy(r[1] && r[1].some(x => x.msg.indexOf("よく直す「のだった」→「だった」") === 0), "言い換えの鉛筆が引かれない: " + JSON.stringify(r));
  ev("memory = []; cur = null; curId = null");
});

console.log("\nあらかじめ直す／執筆に持っていく");
await run("規則候補に出自（どの作品で何回）が付く", () => {
  ev("memory = []; cur = null; curId = null");
  ev(`importMemo(${JSON.stringify("静かに を削除　×2")}, "旧作A")`);
  ev(`__c = {v:2, id:"c", title:"新作", blocks: cutBlocks("　彼は静かに息を吐いた。彼は静かに扉を押した。それから歩き出した。", 2200), pass:1, kind:"typo", history:[],
       log:[{p:1,k:"typo",b:0,i:0,o:"　彼は静かに窓を閉めた。",n:"　彼は窓を閉めた。",at:1}]}; migrate(__c); cur = __c; curId = "c"; index = []; buildMine()`);
  const cand = ev("harvestRows(harvest(allEdits()), 2)");
  eq(cand.length, 1); eq(cand[0].n, 3, "この作品1＋旧作A2");
  eq(cand[0].src["旧作A"], 2); eq(cand[0].src["新作"], 1, "出自が作品ごとに分かれない: " + JSON.stringify(cand[0].src));
});
await run("「当てる」は該当する行だけを数え、語尾と一字は当てない", () => {
  const r = ev("ruleHits(harvestRows(harvest(allEdits()), 2)[0])");
  eq(r.hits.length, 2, "静かに を含む行の数");
  eq(ev(`ruleHits({c:"tail", k:"いた → く", n:2})`), null, "語尾を当てようとしている");
  eq(ev(`ruleHits({c:"del", k:"事", n:5})`), null, "一字を当てようとしている");
});
await await run("当てると行が直り、控えに残り、癖としては数えない", async () => {
  ev("ask = async () => true");            /* 小窓は「はい」と答えたことにする */
  eq(await ev("applyRule(harvestRows(harvest(allEdits()), 2)[0])"), 2, "当てた行の数");
  eq(ev("workText(cur)"), "　彼は息を吐いた。彼は扉を押した。それから歩き出した。");
  eq(ev("Object.keys(cur.blocks[0].edits).length"), 2, "直しとして残っていない");
  truthy(ev("cur.log.filter(l => l.auto).length === 2"), "機械が当てた印がない");
  eq(ev("harvestRows(harvest(allEdits()), 2)[0].n"), 3, "当てた分まで癖として数えている");
  eq(ev("ruleHits(harvestRows(harvest(allEdits()), 2)[0]).hits.length"), 0, "当てたあとも本文に残っている");
});
await run("執筆に持っていく一枚に、出自と避けることが並ぶ", () => {
  const t = ev("carryText()");
  truthy(t.indexOf("執筆時に避けること") >= 0, "見出しがない");
  truthy(t.indexOf("出自：朱入れ") >= 0 && t.indexOf("旧作A") >= 0, "出自がない: " + t);
  truthy(t.indexOf("「静かに」を書かない　3回（") >= 0, "避けることが書かれていない: " + t);
  ev("memory = []; cur = null; curId = null");
});

console.log("\n種類でみた傾向");
const 種 = (k, a, b) => ev(`moveKind({k:${JSON.stringify(k)}, a:${JSON.stringify(a)}, b:${JSON.stringify(b||"")}})`);
await run("削った語を種類に分ける", () => {
  eq(種("del", "静かに"), "adv"); eq(種("del", "そっと"), "adv"); eq(種("del", "小さく"), "adv"); eq(種("del", "穏やかに"), "adv");
  eq(種("del", "彼は"), "subj"); eq(種("del", "彼女の"), "subj");
  eq(種("del", "そして"), "conj"); eq(種("del", "まるで夢のように"), "simile"); eq(種("del", "と思った"), "mind");
  eq(種("del", "のだった"), "tailform"); eq(種("del", "が"), "particle"); eq(種("del", "手紙の端を"), "phrase");
  eq(種("del", "窓に"), "phrase", "名詞＋に を副詞と取り違える");
});
await run("言い換えと語尾を種類に分ける", () => {
  eq(種("sub", "事", "こと"), "open"); eq(種("sub", "もの", "物"), "close"); eq(種("sub", "煙って", "煙り"), "swap");
  eq(種("tail", "のだった", ""), "tailform"); eq(種("tail", "った", "う"), "tail");
  eq(種("punct", "、", ""), "punctdel"); eq(種("punct", "", "、"), "punctadd");
});
await run("ばらばらの直しでも、種類で束ねると傾向になる", () => {
  ev("memory = []; cur = null; curId = null");
  ev(`importMemo(${JSON.stringify("静かに を削除\nそっと を削除\n小さく を削除\n彼は を削除")}, "旧作B")`);
  const h = ev("harvest(allEdits())");
  eq(ev("harvestRows(harvest(allEdits()), 2).length"), 0, "同じ文字列はないので規則候補は立たない");
  const tr = ev("trendRows(harvest(allEdits()))");
  eq(tr[0].id, "adv"); eq(tr[0].n, 3, "副詞を削る 3回");
  eq(tr[0].ex.map(e => e.k).sort().join("／"), ["静かに","そっと","小さく"].sort().join("／"), "例が三つそろわない");
});
await run("傾向が三回以上なら、一回きりの語にも鉛筆が引かれる", () => {
  ev(`__t2 = {v:2, id:"t2", title:"新作", blocks: cutBlocks("　彼はそっと扉を押した。彼は何も言わなかった。", 2200), pass:1, kind:"typo", log:[], history:[]}; migrate(__t2); cur = __t2; curId = "t2"; index = []; buildMine()`);
  const names = ev("mineCache.map(x => x.name)");
  truthy(names.some(x => x.indexOf("副詞を削る傾向「そっと」") === 0), "傾向の鉛筆がない: " + JSON.stringify(names));
  truthy(!names.some(x => x.indexOf("彼は") >= 0), "一回きりの主語（傾向は1回）にまで鉛筆を作っている");
  const r = ev("readBlock(cur.blocks[0], null)");
  truthy(r[0] && r[0].some(x => x.msg.indexOf("副詞を削る傾向「そっと」") === 0), "本文に引かれない: " + JSON.stringify(r));
  truthy(!r[1], "関係ない行に引いている");
});
await run("執筆に持っていく一枚と回収の書き出しに、傾向が載る", () => {
  const c = ev("carryText()");
  truthy(c.indexOf("傾向（三回以上）") >= 0 && /副詞を削る　3回（[^）]*静かに[^）]*）/.test(c) && /そっと/.test(c) && /小さく/.test(c), "傾向が載らない: " + c);
  truthy(ev("harvestText()").indexOf("【種類でみた傾向】") >= 0, "回収に傾向がない");
  ev("memory = []; cur = null; curId = null");
});

console.log("\n締め切りと見通し");
const 日 = n => { const d = new Date(); d.setDate(d.getDate() - n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const 先 = n => 日(-n);

await run("読みはじめた日から数えるので、初日でも当てにできる", () => {
  ev(`daily = ${JSON.stringify({ [日(0)]: 2 })}`);
  eq(ev("pace()"), 2, "きょう2区切りなら一日2");
  ev(`daily = ${JSON.stringify({ [日(0)]: 4, [日(1)]: 4, [日(2)]: 4 })}`);
  eq(ev("pace()"), 4, "三日で12区切りなら一日4");
});
await run("間をあけた日も数に入る", () => {
  ev(`daily = ${JSON.stringify({ [日(6)]: 10 })}`);
  const p = ev("pace()");
  truthy(p > 1.3 && p < 1.6, "七日で10区切りなら一日1.4前後。得た値 " + p);
});
await run("実績がなければ日付を当てずっぽうで出さない", () => {
  ev("daily = {}");
  eq(ev("eta(17)"), null, "何もしていないのに見通しを出している");
});
await run("締め切りまでの日数と、一日に要る区切り数", () => {
  ev(`daily = {}`);
  eq(ev(`daysTo(${JSON.stringify(先(5))})`), 5, "五日後を五日と数えない");
  eq(ev(`daysTo(${JSON.stringify(日(2))})`), -2, "過ぎた日を負で数えない");
  const w = { due: 先(4), blocks: Array.from({ length: 20 }, (x, i) => ({ done: i < 8 })) };
  const i = ev(`dueInfo(${JSON.stringify(w)})`);
  eq(i.rest, 12, "残りの区切り数");
  eq(i.days, 4);
  eq(i.need, 3, "12区切りを4日で割ると一日3");
});
await run("締め切り当日と、過ぎたあと", () => {
  const 当日 = ev(`dueInfo(${JSON.stringify({ due: 日(0), blocks: [{ done: false }, { done: false }, { done: true }] })})`);
  eq(当日.days, 0); eq(当日.need, 2, "当日は残り全部が今日の分");
  const 超過 = ev(`dueInfo(${JSON.stringify({ due: 日(3), blocks: [{ done: false }, { done: false }] })})`);
  eq(超過.days, -3); eq(超過.need, 2, "過ぎていても残り全部");
});
await run("読み終えた原稿と校了した原稿は、締め切りを急かさない", () => {
  eq(ev(`dueInfo(${JSON.stringify({ due: 先(3), blocks: [{ done: true }] })}).done`), true, "読み終えていると分からない");
  eq(ev(`dueInfo(${JSON.stringify({ due: 先(3), closed: true, blocks: [{ done: false }] })})`), null, "校了後も急かしている");
});
await run("きょうの分は、締め切りのある原稿から逆算される", () => {
  ev(`conf.quota = 3; index = [{id:"a", title:"x", done:0, total:20, due:${JSON.stringify(先(4))}}]`);
  eq(ev("todayNeed()"), 5, "20区切りを4日で割ると一日5");
  ev(`index = [{id:"a", title:"x", done:0, total:20, due:null}]`);
  eq(ev("todayNeed()"), 3, "締め切りがなければ決めた数のまま");
  ev(`index = []; daily = {}`);
});

console.log("\niPhone と PC で揃える（偽の保管庫）");
const 庫 = fakeDb();
const A = makeCtx(), B = makeCtx();
const evA = e => vm.runInContext(e, A), evB = e => vm.runInContext(e, B);
const 原稿 = "　第一章　朝\n\n　朝が来た。光が来た。\n\n　第二章　夜\n\n　夜が来た。星が出た。";
await run("Aで作った原稿が保管庫に置かれる", async () => {
  evA(`cur={v:2,id:"w1",title:"朝と夜",created:1,size:2200,blocks:cutBlocks(${JSON.stringify(原稿)},2200),pass:1,kind:"typo",log:[],history:[],world:"none",r18:true,moreSkills:""}; curId="w1";
       index=[{id:"w1",title:"朝と夜",done:0,total:cur.blocks.length,pass:1,kind:"typo"}]; jset(K_INDEX,index); jset("shuire:work:w1",cur);`);
  A.__db = 庫; const ok = await evA("startSync(__db)");
  truthy(ok, "揃えられなかった: " + evA("syncState"));
  truthy(庫.__docs.has("works/w1"), "表紙が置かれていない");
  eq(庫.__docs.get("works/w1").nb, 2, "区切りの数");
  truthy(庫.__docs.has("works/w1/blocks/0") && 庫.__docs.has("works/w1/blocks/1"), "区切りが置かれていない");
});
await run("Bで点けると、その原稿が降りてくる", async () => {
  B.__db = 庫; const ok = await evB("startSync(__db)");
  truthy(ok, "揃えられなかった: " + evB("syncState"));
  eq(evB('index.length'), 1, "一覧に載っていない");
  eq(evB('index[0].title'), "朝と夜");
  eq(evB('workText(jget("shuire:work:w1"))'), evA("workText(cur)"), "本文が一致しない");
});
await tick();
await run("Aで朱を入れると、Bにも届く", async () => {
  evA(`cur.blocks[0].edits[2]="　朝が来た。光が差した。"; cur.blocks[0].marks=[2]; cur.log.push({p:1,k:2,b:0,i:2,o:"　朝が来た。光が来た。",n:"　朝が来た。光が差した。",at:Date.now()}); flushWork();`);
  await evA("syncFlush()"); await tick();
  eq(evB('jget("shuire:work:w1").blocks[0].edits[2]'), "　朝が来た。光が差した。", "直しが届いていない");
  eq(evB('jget("shuire:work:w1").log.length'), 1, "履歴が届いていない");
});
await run("Bで別の区切りを直すと、Aの直しを消さずに合わさる", async () => {
  evB(`cur=jget("shuire:work:w1"); curId="w1"; cur.blocks[1].edits[2]="　夜が来た。星が瞬いた。"; cur.log.push({p:1,k:2,b:1,i:2,o:"　夜が来た。星が出た。",n:"　夜が来た。星が瞬いた。",at:Date.now()+1}); flushWork();`);
  await evB("syncFlush()"); await tick();
  eq(evA('cur.blocks[1].edits[2]'), "　夜が来た。星が瞬いた。", "Bの直しがAに届いていない");
  eq(evA('cur.blocks[0].edits[2]'), "　朝が来た。光が差した。", "Aの直しが消えた");
  eq(evA('cur.log.length'), 2, "履歴が足し合わさっていない");
  eq(evB('cur.log.length'), 2, "Bの履歴");
});
await run("同じ区切りを両方で直したら、あとで直したほうが残る", async () => {
  evA(`cur.blocks[0].edits[2]="　朝が来た。古いほう。"; flushWork();`);
  await tick(5);                                   /* Bのほうが確かにあとで直す */
  evB(`cur.blocks[0].edits[2]="　朝が来た。新しいほう。"; flushWork();`);
  await evA("syncFlush()"); await tick(); await evB("syncFlush()"); await tick();
  eq(evA('cur.blocks[0].edits[2]'), "　朝が来た。新しいほう。", "Aに新しいほうが残っていない");
  eq(evB('cur.blocks[0].edits[2]'), "　朝が来た。新しいほう。", "Bが古いほうに戻された");
});
await run("持ち越しは足し合わさり、きょうの数は多いほうが残る", async () => {
  evA(`memory=[{o:"だった",n:"であった",w:"w1",at:1}]; saveMemory(); daily[ymd()]=3; jset(K_DAILY,daily);`);
  evB(`memory=[{o:"のだ",n:"だ",w:"w1",at:2}]; saveMemory(); daily[ymd()]=5; jset(K_DAILY,daily);`);
  await evA("syncFlush()"); await tick(); await evB("syncFlush()"); await tick(); await evA("syncFlush()"); await tick();
  eq(evA("memory.length"), 2, "Aの持ち越し"); eq(evB("memory.length"), 2, "Bの持ち越し");
  eq(evA("daily[ymd()]"), 5, "Aのきょうの数"); eq(evB("daily[ymd()]"), 5, "Bのきょうの数");
});
await run("設定は新しいほうが勝つが、揃える切り替え自体は運ばない", async () => {
  evB(`conf.quota=7; conf.sync=true; saveConf();`);
  await evB("syncFlush()"); await tick();
  eq(evA("conf.quota"), 7, "きょうの分の設定が届いていない");
  truthy(!evA("conf.sync"), "揃える切り替えまで運んでしまった");
});
await run("Aで原稿を消すと、Bからも消える", async () => {
  evA(`jdel("shuire:work:w1"); index=index.filter(x=>x.id!=="w1"); jset(K_INDEX,index); cur=null; curId=null;`);
  await evA('syncDeleteWork("w1",2)'); await tick();
  eq(evB('jget("shuire:work:w1")'), null, "Bに原稿が残っている");
  eq(evB("index.length"), 0, "Bの一覧に残っている");
  truthy(!庫.__docs.has("works/w1/blocks/0"), "区切りが保管庫に残っている");
});
await run("切ると、それ以降は届かない", async () => {
  evB("stopSync()");
  evA(`cur={v:2,id:"w2",title:"別",created:1,size:2200,blocks:cutBlocks("　あ。い。う。え。お。",2200),pass:1,kind:"typo",log:[],history:[]}; curId="w2"; index.unshift({id:"w2",title:"別"}); jset(K_INDEX,index); jset("shuire:work:w2",cur);`);
  await evA("syncFlush()"); await tick();
  truthy(庫.__docs.has("works/w2"), "Aからは置かれるはず");
  eq(evB('jget("shuire:work:w2")'), null, "切ったのに届いた");
});
await run("持ち出しファイルは、新しいほうだけ取り込む", () => {
  const b = evA("bundle()");
  eq(b.kind, "shuire"); eq(b.works.length, 1);
  const r = evB(`importBundle(${JSON.stringify(b)})`);
  eq(r.added, 1, "新しく入るはず"); eq(evB('jget("shuire:work:w2").title'), "別");
  const r2 = evB(`importBundle(${JSON.stringify(b)})`);
  eq(r2.kept, 1, "同じものは、そのまま");
  let threw = false; try { evB('importBundle({kind:"x"})'); } catch (e) { threw = true; }
  truthy(threw, "違うファイルを黙って受け入れた");
});
evA("stopSync()");
const 庫2 = 庫;

console.log("\n保存を許されていないブラウザ");
await run("保存できなくても、原稿は入って読める（開いている間は記憶にある）", () => {
  const N = makeCtx({ noStore: true });
  const evN = e => vm.runInContext(e, N);
  eq(evN("storeOk"), false, "保存できないと分かっていない");
  N.document.getElementById("a-title").value = "試し"; N.document.getElementById("a-body").value = "　雨が降っていた。窓の外は白く煙って、遠くの塔の輪郭さえ溶けている。彼は何も言わなかった。朝が来た。光が来た。"; N.document.getElementById("a-block").value = "2200";
  evN('document.getElementById("a-save").onclick()');
  truthy(evN("cur && cur.title==='試し'"), "原稿が立ち上がらない");
  eq(evN("index.length"), 1, "一覧に載らない");
  eq(evN('jget("shuire:work:"+curId).title'), "試し", "記憶から読み戻せない");
  evN("renderHome()");
  truthy(N.document.getElementById("home-warn").innerHTML.includes("保存を許していません"), "断りが出ない");
  truthy(N.document.getElementById("home-warn").innerHTML.includes("持ち出す"), "枠の外では、持ち出しを勧めるはず");
});
await run("保存できないうえに保管庫がある枠の中なら、保管庫を勧める／既に原稿があれば黙って揃える", async () => {
  const N = makeCtx({ noStore: true });
  const evN = e => vm.runInContext(e, N);
  N.claude = { use: async name => name === "db" ? 庫2 : null };
  evN("renderHome()");
  truthy(N.document.getElementById("home-warn").innerHTML.includes("warn-sync"), "保管庫のボタンが出ない");
  await evN("resumeFromStore()");
  truthy(evN("syncOn"), "保管庫の原稿があるのに揃えない");
  eq(evN("index.length"), 1, "保管庫の原稿が降りてこない");
  eq(evN("index[0].title"), "別");
});
await run("公開用の一枚から、もとの shuire.html を取り出せる", async () => {
  const zlib = await import("node:zlib");
  const html = fs.readFileSync(new URL("../shuire.html", import.meta.url), "utf8");
  ctx.__els.get("self-src").textContent = zlib.deflateRawSync(Buffer.from(html, "utf8"), { level: 9 }).toString("base64");
  eq(ev("selfSource()"), html, "取り出した一枚が違う");
  ctx.__els.get("self-src").textContent = "";
  eq(ev("selfSource()"), null, "埋まっていない版で null にならない");
});

console.log("\nWordの読み書き");
await run("ブラウザの助けなしでも deflate をほどける（iPhone の古い Safari の控え）", async () => {
  const zlib = await import("node:zlib");
  const 文 = ("　雨が降っていた。窓の外は白く煙って、遠くの塔の輪郭さえ溶けている。".repeat(40) + "\n") + "x".repeat(3000) + Buffer.from(Array.from({length: 2000}, (_, i) => (i * 7919) % 251)).toString("latin1");
  for (const level of [0, 1, 6, 9]) {
    const plain = Buffer.from(文, "utf8");
    const packed = zlib.deflateRawSync(plain, { level });
    ctx.__packed = new Uint8Array(packed);
    const got = Buffer.from(ev("inflateRaw(__packed)"));
    eq(got.equals(plain), true, "level " + level + " でほどいた中身が違う（" + got.length + " / " + plain.length + "）");
  }
  ctx.__stored = new Uint8Array(zlib.deflateRawSync(Buffer.from("abc"), { level: 0 }));
  eq(Buffer.from(ev("inflateRaw(__stored)")).toString(), "abc", "無圧縮ブロック");
  let threw = false; try { ev("inflateRaw(new Uint8Array([7,255,255,255]))"); } catch (e) { threw = true; }
  truthy(threw, "壊れたデータで黙って返した");
});
await run("圧縮された docx（Word が書くもの）も、手書きの deflate で本文が読める", async () => {
  const zlib = await import("node:zlib");
  const xml = '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>控え</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">　雨が降っていた。</w:t></w:r></w:p></w:body></w:document>';
  const name = Buffer.from("word/document.xml"), plain = Buffer.from(xml, "utf8"), packed = zlib.deflateRawSync(plain, { level: 9 });
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }, u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0), u32(0), u32(packed.length), u32(plain.length), u16(name.length), u16(0), name, packed]);
  const cen = Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0), u32(0), u32(packed.length), u32(plain.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(0), name]);
  const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(1), u16(1), u32(cen.length), u32(local.length), u16(0)]);
  const zip = Buffer.concat([local, cen, eocd]);
  ctx.__zip = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);
  eq(ev("typeof DecompressionStream"), "undefined", "この机にはブラウザの助けがない前提");
  const text = ev("readDocx(__zip).then(xmlToText)");
  eq(await text, "控え\n　雨が降っていた。");
});
await run("書き出したdocxを自分で読み戻せる", () => {
  const bytes = ev(`buildDocx([para([{t:"人形の部屋",b:true,sz:30}],true), para([{t:"　雨が降っていた。"}]), para([{t:"直す前",st:true,color:"808080"}])])`);
  const buf = Buffer.from(bytes);
  fs.writeFileSync(path.join(process.cwd(), "tools/tmp-out.docx"), buf);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  ctx.__ab = ab;
  const xml = ev("readDocx(__ab)");
  return xml.then ? xml : null;
});
const xml = await ev("readDocx(__ab)");
await run("読み戻した本文が合っている", () => {
  const text = ev(`xmlToText(${JSON.stringify(xml)})`);
  eq(text, "人形の部屋\n　雨が降っていた。\n直す前");
});

try { fs.unlinkSync(path.join(process.cwd(), "tools/tmp-out.docx")); } catch (e) {}
console.log("\n" + (ng ? "✗ " + ng + "件だめ、" : "") + ok + "件よし\n");
process.exit(ng ? 1 : 0);
