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
await step("機械の下読みは既定で止まっている", async () => {
  must(await p.locator(".lnhold.pen").count() === 0, "既定で鉛筆が出ている");
  must(!(await p.locator("#r-nextpen").isVisible()), "鉛筆へのボタンが出ている");
  await p.click("#r-back");
  await p.click("#btn-conf2");
  must(!(await p.locator("#c-pen").evaluate(el => el.className.includes("on"))), "設定でも点いている");
  await p.click("#c-pen");                       /* ここから先の点検は点けた状態で */
  await p.click("#c-back");
  await p.click("#btn-go");
});
await step("鉛筆が引かれている", async () => {
  const n = await p.locator(".lnhold.pen").count();
  must(n > 0, "鉛筆が一つも出ていない");
  const msg = await p.locator(".pen-msg").first().textContent();
  must(msg.length > 0, "鉛筆の言葉が空");
});
await step("印が一つもないうちは控えを出さない", async () => {
  let 出た = false;
  const 見る = () => { 出た = true; };
  p.on("download", 見る);
  await p.click("#r-back");
  await p.waitForTimeout(500);
  must(!出た, "何も印がないのに控えを書き出した");
  p.off("download", 見る);
  await p.click("#btn-go");
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
await step("印がボタンらしく見える", async () => {
  const off = await p.locator(".ln-s").first().evaluate(el => getComputedStyle(el).borderStyle + " " + getComputedStyle(el).backgroundColor);
  must(off.startsWith("solid"), "枠がない: " + off);
  await p.locator(".ln-s").nth(0).click();
  await p.waitForTimeout(300);            /* 色が変わりきるのを待つ */
  const on = await p.locator(".ln-s").first().evaluate(el => getComputedStyle(el).backgroundColor);
  must(on === "rgb(198, 48, 27)", "押しても朱色にならない: " + on);
  await p.locator(".ln-s").nth(0).click();
  await p.waitForTimeout(300);
  must(await p.locator(".ln.mk").count() === 0, "もう一度押しても外れない");
});
await step("付箋を貼るとその場でひとこと足せる", async () => {
  const rows = await p.locator(".tags").count();
  must(rows === 1, "付箋の下にコメント欄が出ない（" + rows + "）");
  await p.locator(".tags .tag", { hasText: "重い" }).first().click();
  must(await p.locator(".tags .tag.on").count() === 1, "札が点かない");
  await p.locator(".tags .tagfree").first().fill("なんだか遠い");
  await p.locator(".tags .tagfree").first().blur();
});
await step("かな漢字変換の途中でEnterを横取りしない", async () => {
  const inp = p.locator(".tags .tagfree").first();
  await inp.click();
  const 変換中 = await inp.evaluate(el => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
    return document.activeElement === el;
  });
  must(変換中, "変換の確定でEnterを取られて、欄から出てしまう");
  const 確定後 = await inp.evaluate(el => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    return document.activeElement === el;
  });
  must(!確定後, "変換していないEnterでは入力を終えたい");
});
await step("ひとことに読点を打っても消えない", async () => {
  const inp = p.locator(".tags .tagfree").first();
  await inp.fill("台詞のあと、間が足りない");
  await inp.blur();
  await p.waitForTimeout(200);
  await p.click("#r-back");
  await p.click("#btn-go");
  const v = await p.locator(".tags .tagfree").first().inputValue();
  must(v === "台詞のあと、間が足りない", "読点が置き換わっている: " + v);
  must((await p.locator(".tags .tag.on").count()) === 1, "札が消えた");
  await p.locator(".tags .tagfree").first().fill("なんだか遠い");
  await p.locator(".tags .tagfree").first().blur();
});
await step("続けて貼っても、ひとこと欄は範囲にひとつ", async () => {
  await p.locator(".ln-f").nth(1).click();          /* 同じ段落の隣の文に貼って範囲にする */
  const n = await p.locator(".tags").count();
  must(n === 1, "範囲の中でひとこと欄が増えている（" + n + "）");
  must((await p.textContent("#r-len")).includes("付1"), "範囲がひとつの相談になっていない: " + (await p.textContent("#r-len")));
  must(await p.locator(".ln.fs").count() === 2, "二行に付いていない");
  await p.locator(".ln-f").nth(1).click();          /* 戻す */
  must(await p.locator(".tags").count() === 1, "はがしたあとにひとこと欄が消えた");
  must((await p.locator(".tags .tag.on").count()) === 1, "札が消えた");
});
await step("段落をまたぐと別々の相談になる", async () => {
  await p.locator(".ln-f").nth(3).click();          /* 段落をまたいだ先の文 */
  must(await p.locator(".tags").count() === 2, "段落をまたいでひとつにまとめてしまう");
  must((await p.textContent("#r-len")).includes("付2"), "別々の相談になっていない: " + (await p.textContent("#r-len")));
  await p.locator(".ln-f").nth(3).click();
});
await step("ひとことは読み込み直しても残る", async () => {
  await p.click("#r-back");
  await p.reload();
  await p.locator(".work").first().click();
  await p.click("#btn-go");
  must(await p.locator(".tags .tag.on").count() === 1, "札が残らない");
  must((await p.locator(".tags .tagfree").first().inputValue()) === "なんだか遠い", "ひとことが残らない");
});
await step("どこが変か分からないときは区切りごと相談できる", async () => {
  must(await p.locator("#r-wide").isVisible(), "まるごとのボタンがない");
  await p.click("#r-wide");
  must(await p.locator(".wide.on").count() === 1, "まるごとの付箋が付かない");
  must(await p.locator(".wide .tags").count() === 1, "まるごとにもひとこと欄が出ない");
  await p.locator(".wide .tag", { hasText: "なんとなく変" }).first().click();
  must((await p.textContent("#r-len")).includes("付2"), "相談の数が増えない: " + (await p.textContent("#r-len")));
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
await step("区切りごとにファイルが増えない", async () => {
  let 数 = 0;
  const 数える = () => { 数++; };
  p.on("download", 数える);
  await p.click("#r-done");                     /* 一区切り読み終える */
  await p.waitForTimeout(600);
  must(数 === 0, "区切りごとに書き出している（" + 数 + "回）");
  must(await vis("read"), "次の区切りに進まない");
  must((await p.textContent("#r-count")).startsWith("2 /"), "区切り番号が進まない");
  p.off("download", 数える);
});
await step("読む画面を離れるときに、まるごと一つを控える", async () => {
  const dl = p.waitForEvent("download");
  await p.click("#r-back");
  const d = await dl;
  must(d.suggestedFilename() === "人形の部屋_控え.docx", "名前が違う: " + d.suggestedFilename());
  await d.saveAs("tools/tmp-hikae-auto.docx");
  await p.waitForTimeout(300);
  const w = await p.textContent("#w-word");
  must(w.includes("最新です"), "控えの様子が出ない: " + w);
  must(w.includes("1区切りぶん"), "控えた量が合わない: " + w);
});
await step("同じ内容なら二度は出さない", async () => {
  let 出た = false;
  const 見る = () => { 出た = true; };
  p.on("download", 見る);
  await p.click("#btn-go");
  await p.click("#r-back");
  await p.waitForTimeout(600);
  must(!出た, "朱入れが増えていないのに書き出した");
  p.off("download", 見る);
});
await step("押したときだけにもできる", async () => {
  await p.click("#btn-conf2");
  await p.locator('#c-when .pick[data-w="manual"]').click();
  must(await p.locator('#c-when .pick.on[data-w="manual"]').count() === 1, "選べない");
  await p.click("#c-back");
  await p.click("#btn-go");
  let 出た = false;
  const 見る = () => { 出た = true; };
  p.on("download", 見る);
  await p.click("#r-done");
  await p.waitForTimeout(600);
  must(!出た, "押したときだけのはずが書き出された");
  p.off("download", 見る);
  const dl = p.waitForEvent("download");
  await p.click("#btn-word");                   /* 手で控える */
  must((await dl).suggestedFilename() === "人形の部屋_控え.docx", "手で控えられない");
  await p.click("#btn-conf2");
  await p.locator('#c-when .pick[data-w="leave"]').click();
  await p.click("#c-back");
});
await step("最後まで行くと作品画面に戻る", async () => {
  must(await vis("work"), "作品画面に戻らない");
  must(await p.locator("#w-sheet .cell.done").count() === 2, "マスが埋まらない");
});
await step("きょうの分が数えられている", async () => {
  await p.click("#btn-back");
  must(await vis("home"), "一覧に戻れない");
  const q = await p.textContent("#home-quota");
  must(q.includes("きょうの分"), "きょうの分が出ない: " + q);
  must((await p.locator("#home-quota i.on").count()) === 2, "読んだぶんの印が付かない");
});
await step("つづきからが一押しで開く", async () => {
  must(await p.locator("#btn-resume").count() === 0, "読み終えた原稿に「つづき」が出ている");
  await p.locator(".work").first().click();
  await p.locator("#w-sheet .cell").first().click();   /* 一区切り目の読了印を外して、続きが出る形にする */
  await p.click("#r-done");
  await p.click("#btn-back");
  must(await p.locator("#btn-resume").count() === 1, "つづきが出ない");
  await p.click("#btn-resume");
  must(await vis("read"), "一押しで読む画面に入らない");
  must((await p.textContent("#r-count")).startsWith("1 /"), "続きの区切りに入らない");
  await p.click("#r-back");
});
await step("見通しの日付が出る", async () => {
  const e = await p.textContent("#w-eta");
  must(e.includes("読み終わります") || e.includes("見当"), "見通しが出ない: " + e);
});
await step("校了の印を押せる", async () => {
  p.once("dialog", d => d.accept());
  await p.click("#btn-close");
  await p.waitForTimeout(300);
  must(await p.locator(".seal").count() === 1, "朱印が出ない");
  must((await p.textContent("#w-seal")).includes("校了"), "校了と出ない");
  must((await p.textContent("#w-log")).includes("回目"), "通した記録が出ない");
  await p.click("#btn-back");
  must((await p.textContent("#worklist")).includes("校了"), "一覧に校了が出ない");
  must(await p.locator("#btn-resume").count() === 0, "校了した原稿につづきが出ている");
  await p.locator(".work").first().click();
  p.once("dialog", d => d.accept());
  await p.click("#btn-close");
  must(await p.locator(".seal").count() === 0, "校了を取り消せない");
});
await step("締め切りを決めるとノルマが変わる", async () => {
  must(await vis("work"), "作品画面にいない");
  must(await p.locator("#w-dueset").count() === 1, "締め切りを決めるボタンがない");
  const 三日後 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await p.locator("#w-duein").evaluate((el, v) => {
    el.value = v; el.dispatchEvent(new Event("change", { bubbles: true }));
  }, 三日後);
  await p.waitForTimeout(200);
  const now = await p.textContent("#w-due");
  must(now.includes("あと3日"), "残り日数が出ない: " + now);
  must(/一日 \d+ 区切り/.test(now), "必要なペースが出ない: " + now);
  must((await p.textContent("#w-eta")) === "", "締め切りがあるのに見通しも出ている");
});
await step("一覧が締め切りの帯に変わる", async () => {
  await p.click("#btn-back");
  const bar = await p.textContent(".duebar");
  must(bar.includes("入稿まで あと3日"), "帯が出ない: " + bar);
  must(bar.includes("きょうは") || bar.includes("きょうの分は済みました"), "きょうの見込みが出ない: " + bar);
  must((await p.textContent("#worklist")).includes("入稿"), "一覧のカードに入稿日が出ない");
  must(await p.locator("#home-quota .quota").count() === 0, "きょうの分の行が二重に出ている");
  must(await p.locator("#btn-resume").count() === 0, "つづきの札が帯と重なっている");
  must(await p.locator(".duebar .dots i").count() > 0, "進み具合の点が帯にない");
  await p.click("#btn-duego");
  must(await vis("read"), "帯から続きに入れない");
  await p.click("#r-back");
  await p.click("#btn-back");
});
await step("締め切りを過ぎると言いかたが変わる", async () => {
  await p.locator(".work").first().click();
  const 二日前 = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  await p.locator("#w-duein").evaluate((el, v) => {
    el.value = v; el.dispatchEvent(new Event("change", { bubbles: true }));
  }, 二日前);
  await p.waitForTimeout(200);
  must((await p.textContent("#w-due")).includes("2日すぎています"), "超過が出ない");
  await p.click("#btn-back");
  must((await p.textContent(".duebar")).includes("すぎています"), "帯が変わらない");
  must(await p.locator(".duebar.late").count() === 1, "帯の色が変わらない");
});
await step("締め切りを外すと見通しに戻る", async () => {
  await p.locator(".work").first().click();
  await p.click("#w-duedel");
  await p.waitForTimeout(200);
  must(await p.locator("#w-dueset").count() === 1, "外れていない");
  must((await p.textContent("#w-eta")).length > 0, "見通しに戻らない");
  await p.click("#btn-back");
  must(await p.locator(".duebar").count() === 0, "帯が残っている");
  await p.locator(".work").first().click();
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
  must(items === 2, "付箋だけにならない（" + items + "件）");
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
await step("相談票を書き出せる", async () => {
  await p.click("#btn-talk");
  must(await vis("talk"), "相談の画面が開かない");
  must((await p.textContent("#t-lead")).includes("2件"), "相談の数が出ない: " + (await p.textContent("#t-lead")));
  const dl = p.waitForEvent("download");
  await p.click("#t-save");
  const d = await dl;
  const st = await d.createReadStream();
  let body = ""; for await (const c of st) body += c;
  must(body.includes("[F1]"), "番号がない");
  must(body.includes("・writing-style"), "文体の正本が挙がっていない");
  must(body.includes("まるごと ────"), "まるごとの相談が入っていない");
  must(body.includes("手触り：なんとなく変"), "まるごとの手触りが渡らない");
  must(body.includes("手触り：重い、なんだか遠い"), "行の手触りが渡らない: ");
  must(body.includes("言葉にできていない"), "曖昧なままでよいと伝えていない");
  must(body.includes("▼ 窓の外は白く煙って"), "相談する行がない");
  must(body.includes("前：　雨が降りつづいていた。"), "前の行が直したあとの本文になっていない");
  must(body.includes("案："), "返事の形が書かれていない");
});
await step("世界を選ぶと開いてもらうスキルが変わる", async () => {
  await p.selectOption("#t-world", "lukaen-idol");
  const t = await p.textContent("#t-skills");
  must(t.includes("lukaen-idol-reference"), "設定の正本が出ない: " + t);
  must(t.includes("開かないでください"), "併用しない旨が出ない");
  must(await p.locator("#t-r18").isVisible(), "R18の切り替えが出ない");
  await p.selectOption("#t-world", "zensetsu");
  must(!(await p.locator("#t-r18").isVisible()), "全年齢の世界でR18の切り替えが残っている");
  const list = (await p.textContent("#t-skills")).split("／")[0];   /* 注記のほうに名前が出るので、一覧だけを見る */
  must(!list.includes("r18-craft"), "全年齢なのにR18の様式が一覧に出る: " + list);
  must(list.includes("zensetsu-reference"), "シリーズの正本が一覧にない: " + list);
  await p.selectOption("#t-world", "none");
});
await step("見取りは読み込み直しても残る", async () => {
  await p.selectOption("#t-world", "lukaen-omega");
  await p.reload();
  await p.locator(".work").first().click();
  await p.click("#btn-talk");
  must((await p.inputValue("#t-world")) === "lukaen-omega", "世界が残らない");
  must((await p.textContent("#t-skills")).includes("genshin-reference"), "併用する正本が残らない");
  await p.selectOption("#t-world", "none");
});
await step("Claudeの返事を貼ると案が付く", async () => {
  await p.fill("#t-in", [
    "二件みていきます。",
    "",
    "[F1]",
    "見立て：この区切りは時間が飛んでいて、読者が置いていかれます。",
    "案：朝が来る前にひと呼吸おく。",
    "",
    "[F2]",
    "見立て：情景が長く、視点が動きすぎています。",
    "案：窓の外は白く煙っていた。",
    "案：窓の外は、白く煙っている。",
    "",
    "他にもあれば言ってください。"
  ].join("\n"));
  await p.click("#t-import");
  must(await vis("work"), "作品画面に戻らない");
});
await step("案が届いたところに印が出る", async () => {
  await p.click("#btn-go");
  must(await p.locator(".lnhold .adv-msg").count() === 1, "行の案の印が出ない");
  must(await p.locator(".wide .adv-msg").count() === 1, "まるごとの案の印が出ない");
  must((await p.textContent(".lnhold .adv-msg")).includes("2件"), "案の数が出ない: " + (await p.textContent(".lnhold .adv-msg")));
});
await step("まるごとの案は読める形で開く", async () => {
  await p.click(".wide .adv-msg");
  must(await p.locator("#veil").isVisible(), "開かない");
  must((await p.textContent(".advrest")).includes("時間が飛んでいて"), "中身が違う");
  await p.click("#sh-close");
});
await step("案を押すと直しの欄に入る", async () => {
  await p.click(".lnhold .adv-msg");
  must(await p.locator("#veil").isVisible(), "シートが開かない");
  const cands = await p.locator(".cand").count();
  must(cands === 2, "押せる候補が" + cands + "件");
  await p.locator(".cand").first().click();
  const v = await p.inputValue("#sh-t");
  must(v === "窓の外は白く煙っていた。", "欄に入らない: " + v);
  await p.click("#sh-save");
  const t = await p.locator(".ln-t").nth(2).textContent();
  must(t === "窓の外は白く煙っていた。", "案が本文に入らない: " + t);
  await p.click("#r-back");
});
await step("同じ直しを二回すると、次から先回りの鉛筆が引かれる", async () => {
  await p.click("#btn-go");                                   /* 全部読み終えているので一区切り目から */
  for (const [n, to] of [[9, "鳥が鳴く。"], [10, "彼は靴を履く。"]]) {
    await p.locator(".ln-t").nth(n).click();
    await p.fill("#sh-t", to);
    await p.click("#sh-save");
    await p.waitForTimeout(150);
  }
  await p.click("#r-back");
  await p.locator("#w-sheet .cell").nth(1).click();          /* 二区切り目：「立っていた」「知っていた」で終わる */
  const msgs = await p.locator(".pen-msg").allTextContents();
  must(msgs.some(m => m.includes("語尾をよく直す")), "先回りの鉛筆が引かれない: " + msgs.join(" | "));
  await p.click("#r-back");
});
await step("傾向表の頭に、自分の直しの傾向が出る", async () => {
  await p.click("#btn-report");
  const t = await p.textContent("#rp-body");
  must(t.includes("直しの傾向"), "直しの傾向が出ない");
  must(t.includes("いた → く"), "規則候補が出ない: " + t.slice(0, 200));
  must(t.includes("本の鉛筆"), "鉛筆の本数が出ない");
  await p.click("#rp-back");
});
await step("直しの回収と、差分回収に渡す二本を書き出せる", async () => {
  await p.click("#btn-out");
  const dl = p.waitForEvent("download");
  await p.click("#o-harvest");
  const d = await dl;
  must(d.suggestedFilename().includes("直しの回収"), "名前が違う: " + d.suggestedFilename());
  const st = await d.createReadStream();
  let body = ""; for await (const c of st) body += c;
  must(body.includes("【規則候補】") && body.includes("いた → く　2回"), "回収の中身が違う");
  const names = [];
  const 拾う = dd => names.push(dd.suggestedFilename());
  p.on("download", 拾う);
  await p.click("#o-pair");
  await p.waitForTimeout(1200);
  p.off("download", 拾う);
  must(names.includes("人形の部屋_もと.txt") && names.includes("人形の部屋_直し.txt"), "二本そろわない: " + names.join(","));
  await p.click("#o-back");
});
await step("控えの付箋に案あり印が付く", async () => {
  await p.click("#btn-notes");
  await p.locator('#n-filter button[data-f="fusen"]').click();
  const t = await p.textContent(".noteitem em");
  must(t.includes("案あり"), "案あり印がない: " + t);
  await p.locator('#n-filter button[data-f="all"]').click();
  await p.click("#n-back");
});
await step("傾向表が出る", async () => {
  await p.click("#btn-report");
  must(await vis("report"), "傾向表が開かない");
  const t = await p.textContent("#rp-body");
  must(t.includes("誤字と表記") && t.includes("文体とリズム"), "分類が出ない");
  must(t.includes("いま残っているもの") && t.includes("付箋"), "残りの付箋が出ない");
  must(!t.includes("前の通しと比べて"), "まだ通し終えていないのに比べが出ている");
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
await step("通しを終えると、前回と比べられる", async () => {
  await p.click("#btn-report");
  const t = await p.textContent("#rp-body");
  must(t.includes("前の通しと比べて"), "前の通しとの比べが出ない");
  must(/鉛筆は\d+。いまは\d+/.test(t), "鉛筆の数が並ばない: " + t.slice(t.indexOf("前の通し"), t.indexOf("前の通し") + 90));
  await p.click("#rp-back");
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
