/* 朱入れ 画面の通し点検（playwright が入っているときだけ動く）
   使いかた:  node tools/uitest.mjs
   ブラウザの場所を変えるとき:  PW_CHROMIUM=/path/to/chromium node tools/uitest.mjs   */
import { chromium } from "playwright";
import path from "node:path";
const file = "file://" + path.resolve("shuire.html");
const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
p.on("pageerror", e => errs.push("pageerror: " + e.message));
p.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
await p.goto(file);

const 本文 = `　第一章　雨の匂い

　雨が降っていた。窓の外は白く煙って、遠くの塔の輪郭さえ溶けている。
　その事について、彼は何も言わなかった。
「まだ降っているのか」
「ええ。夕方までは続くそうです」
　朝が来た。光が差した。鳥が鳴いた。
彼は靴を履いた。

　第二章　塔

　塔は町の外れに立っていた。そのことを彼は知っていた。`;

const step = async (name, fn) => { try { await fn(); console.log("  ✓ " + name); } catch (e) { console.log("  ✗ " + name + " — " + e.message); process.exitCode = 1; } };
const vis = async id => await p.locator("#v-" + id).isVisible();
const must = (c, m) => { if (!c) throw new Error(m); };

console.log("\n通しで動かす");
await step("一覧が出る", async () => must(await vis("home"), "一覧が見えない"));
await step("原稿を入れる", async () => {
  await p.click("#btn-add");
  await p.fill("#a-title", "人形の部屋");
  await p.fill("#a-body", 本文);
  await p.click("#a-save");
  must(await vis("work"), "作品画面に来ない");
  must((await p.textContent("#w-title")) === "人形の部屋", "題名が違う");
});
await step("章の頭でマスが分かれる", async () => {
  const n = await p.locator("#w-sheet .cell").count();
  must(n === 2, "マスが" + n + "枚（2枚のはず）");
  must(await p.locator("#w-sheet .cell.head").count() === 2, "章の頭の印が付いていない");
});
await step("通しの札が出る", async () => {
  const t = await p.textContent("#w-pass");
  must(t.includes("1回目") && t.includes("誤字と表記"), "札の中身: " + t);
});
await step("読む画面に入る", async () => {
  await p.click("#btn-go");
  must(await vis("read"), "読む画面に来ない");
  must((await p.locator(".ln").count()) > 3, "行が並んでいない");
});
await step("鉛筆が引かれている", async () => {
  const n = await p.locator(".lnhold.pen").count();
  must(n > 0, "鉛筆が一つも出ていない");
  const msg = await p.locator(".pen-msg").first().textContent();
  must(msg.length > 0, "鉛筆の言葉が空");
});
await step("朱を置く／はずす", async () => {
  await p.locator(".ln-s").nth(1).click();
  must(await p.locator(".ln.mk").count() === 1, "朱が付かない");
  must((await p.textContent("#r-len")).includes("朱1"), "朱の数が出ない");
  await p.locator(".ln-s").nth(1).click();
  must(await p.locator(".ln.mk").count() === 0, "朱がはずれない");
});
await step("付箋をボタン一つで貼る／はがす", async () => {
  must((await p.locator(".ln-f").first().textContent()) === "付", "どちらのボタンか字で分からない");
  must((await p.locator(".ln-s").first().textContent()) === "朱", "どちらのボタンか字で分からない");
  await p.locator(".ln-f").nth(2).click();
  must(await p.locator(".ln.fs").count() === 1, "付箋が付かない");
  must((await p.textContent("#r-len")).includes("付1"), "付箋の数が出ない");
  await p.locator(".ln-f").nth(2).click();
  must(await p.locator(".ln.fs").count() === 0, "付箋がはがれない");
  await p.locator(".ln-f").nth(2).click();
});
await step("朱と付箋は別々に付く", async () => {
  await p.locator(".ln-s").nth(3).click();
  must(await p.locator(".ln.fs").count() === 1, "付箋が消えた");
  must(await p.locator(".ln.mk").count() === 1, "朱が付かない");
  await p.locator(".ln-s").nth(3).click();
});
await step("行をその場で直す", async () => {
  await p.locator(".ln-t").nth(1).click();
  must(await p.locator("#veil").isVisible(), "シートが開かない");
  await p.fill("#sh-t", "　雨が降りつづいていた。");
  await p.click("#sh-save");
  must(!(await p.locator("#veil").isVisible()), "シートが閉じない");
  const t = await p.locator(".ln-t").nth(1).textContent();
  must(t === "　雨が降りつづいていた。", "直しが反映されない: " + t);
  must(await p.locator(".ln.fx").count() === 1, "直した印が付かない");
});
await step("直しをもとに戻せる", async () => {
  await p.locator(".ln-t").nth(1).click();
  await p.click("#sh-undo");
  must(await p.locator(".ln.fx").count() === 0, "戻らない");
  await p.locator(".ln-t").nth(1).click();
  await p.fill("#sh-t", "　雨が降りつづいていた。");
  await p.click("#sh-save");
});
await step("覚え書きが残る", async () => {
  await p.fill("#r-memo", "三章の呼称ゆれ");
  await p.locator("#r-memo").blur();
});
await step("読み終えると次の区切りへ", async () => {
  await p.click("#r-done");
  must(await vis("read"), "次の区切りに進まない");
  must((await p.textContent("#r-count")).startsWith("2 /"), "区切り番号が進まない");
});
await step("最後まで行くと作品画面に戻る", async () => {
  await p.click("#r-done");
  must(await vis("work"), "作品画面に戻らない");
  must(await p.locator("#w-sheet .cell.done").count() === 2, "マスが埋まらない");
});
await step("控えに直しと付箋と覚え書きが並ぶ", async () => {
  await p.click("#btn-notes");
  must(await vis("notes"), "控えが開かない");
  const t = await p.textContent("#n-list");
  must(t.includes("雨が降りつづいていた"), "直しが載っていない");
  must(t.includes("三章の呼称ゆれ"), "覚え書きが載っていない");
  must(t.includes("付箋"), "付箋が載っていない");
});
await step("付箋だけに絞れる", async () => {
  await p.locator('#n-filter button[data-f="fusen"]').click();
  const items = await p.locator(".noteitem").count();
  must(items === 1, "付箋だけにならない（" + items + "件）");
  must((await p.textContent(".noteitem em")).includes("付箋"), "付箋以外が混じっている");
});
await step("控えから元の区切りへ戻れる", async () => {
  await p.locator(".noteitem").first().click();
  must(await vis("read"), "読む画面に戻らない");
  must(await p.locator(".ln.fs").count() === 1, "付箋が残っていない");
  await p.click("#r-back");
  await p.click("#btn-notes");
  await p.locator('#n-filter button[data-f="all"]').click();
  await p.click("#n-back");
});
await step("傾向表が出る", async () => {
  await p.click("#btn-report");
  must(await vis("report"), "傾向表が開かない");
  const t = await p.textContent("#rp-body");
  must(t.includes("誤字と表記") && t.includes("文体とリズム"), "分類が出ない");
  must(t.includes("いま残っているもの") && t.includes("付箋"), "残りの付箋が出ない");
  must(t.includes("1回目"), "通しごとの数が出ない");
  await p.click("#rp-back");
});
await step("次の通しへ移ると見かたが変わる", async () => {
  await p.click("#btn-newpass");
  must(await vis("pass"), "通しの選択が開かない");
  await p.locator('.pick[data-k="style"]').click();
  await p.click("#p-start");
  const t = await p.textContent("#w-pass");
  must(t.includes("2回目") && t.includes("文体"), "札が変わらない: " + t);
  must(await p.locator("#w-sheet .cell.done").count() === 0, "マスが白紙に戻らない");
  must(await p.locator("#w-sheet .cell.fusen").count() === 1, "通しをまたいで付箋が残っていない");
});
await step("通しを変えると鉛筆の種類も変わる", async () => {
  await p.click("#btn-go");
  const msgs = await p.locator(".pen-msg").allTextContents();
  must(!msgs.join("").includes("字下げ"), "文体の通しに表記の鉛筆が残っている");
  await p.click("#r-back");
});
await step("設定で鉛筆を消せる", async () => {
  await p.click("#btn-conf2");
  must(await vis("conf"), "設定が開かない");
  await p.click("#c-none");
  await p.click("#c-back");
  await p.click("#btn-go");
  must(await p.locator(".lnhold.pen").count() === 0, "消したのに鉛筆が残る");
  await p.click("#r-back");
  await p.click("#btn-conf2");
  await p.click("#c-all");
  await p.click("#c-back");
});
await step("書き出しの画面が開く", async () => {
  await p.click("#btn-out");
  must(await vis("out"), "書き出しが開かない");
});
await step("テキストが書き出せる", async () => {
  const dl = p.waitForEvent("download");
  await p.click("#o-txt");
  const d = await dl;
  must(d.suggestedFilename().endsWith(".txt"), "拡張子が違う: " + d.suggestedFilename());
  const s = await d.createReadStream();
  let body = ""; for await (const c of s) body += c;
  must(body.includes("雨が降りつづいていた"), "直しが本文に入っていない");
  must(body.includes("第二章"), "後ろの章が落ちている");
  must(!body.includes("付"), "入稿用のテキストに印が混じっている");
});
await step("Wordが書き出せる", async () => {
  const dl = p.waitForEvent("download");
  await p.click("#o-docx");
  const d = await dl;
  await d.saveAs("tools/tmp-honbun.docx");
  must(d.suggestedFilename().endsWith(".docx"), "拡張子が違う");
});
await step("控えのWordが書き出せる", async () => {
  const dl = p.waitForEvent("download");
  await p.click("#o-note-docx");
  const d = await dl;
  await d.saveAs("tools/tmp-hikae.docx");
});
await step("控えのテキストに付箋が入る", async () => {
  const dl = p.waitForEvent("download");
  await p.click("#o-note-txt");
  const d = await dl;
  const st = await d.createReadStream();
  let body = ""; for await (const c of st) body += c;
  must(body.includes("付  "), "付箋の行がない");
  must(body.includes("どう直すか："), "書き込む場所がない");
});
await step("読み込み直しても残っている", async () => {
  await p.click("#o-back");
  await p.reload();
  must(await vis("home"), "一覧に戻らない");
  const t = await p.textContent("#worklist");
  must(t.includes("人形の部屋"), "作品が消えた");
  must(t.includes("2回目"), "通しの回数が残っていない: " + t);
  await p.locator(".work").first().click();
  must((await p.textContent("#w-stat")).includes("直した"), "統計が出ない");
  await p.click("#btn-go");
  must((await p.locator(".ln-t").nth(1).textContent()) === "　雨が降りつづいていた。", "直しが残っていない");
  must(await p.locator(".ln.fs").count() === 1, "付箋が残っていない");
});
await step("区切りを割り直しても直しは残る", async () => {
  await p.click("#r-back");
  let asked = 0;
  const onDialog = d => d.accept(asked++ === 0 ? "900" : "");
  p.on("dialog", onDialog);
  await p.click("#btn-resize");
  await p.waitForTimeout(300);
  await p.click("#btn-out");
  const dl = p.waitForEvent("download");
  await p.click("#o-txt");
  const d = await dl;
  const st = await d.createReadStream();
  let body = ""; for await (const c of st) body += c;
  must(body.includes("雨が降りつづいていた"), "割り直しで直しが消えた");
  p.off("dialog", onDialog);
});
await step("画面の絵を撮る", async () => {
  await p.click("#o-back");
  await p.screenshot({ path: "tools/tmp-work.png" });
  await p.click("#btn-go");
  await p.screenshot({ path: "tools/tmp-read.png" });
});

console.log(errs.length ? "\n画面のエラー:\n" + errs.join("\n") : "\n画面のエラーなし");
await b.close();
if (errs.length) process.exitCode = 1;
