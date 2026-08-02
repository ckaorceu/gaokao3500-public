from playwright.sync_api import sync_playwright
import time, json

BASE = "http://127.0.0.1:8765"
errs = []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page()
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR:" + str(e)))

    # --- 首页：模式卡片显示独立进度 meta ---
    pg.goto(BASE + "/index.html", wait_until="networkidle")
    pg.wait_for_selector("#modePicker .mode-chip")
    meta = pg.locator("#modePicker .mode-chip").first.inner_text()
    assert "已学" in meta and "待复习" in meta, "mode meta missing"
    drill = pg.locator("#drillChips .drill-chip").all_inner_texts()
    assert drill == ["全部", "只练未掌握"], "drill chips wrong: " + str(drill)
    print("HOME ok: meta shown, drill chips ok")

    def learn_and_rate(mode, word, rating_val):
        pg.goto(f"{BASE}/learn.html?mode={mode}&w={word}", wait_until="networkidle")
        pg.wait_for_selector("#flashcard .w", state="attached")
        pg.wait_for_timeout(150)
        if mode == "meaning":
            pg.click("#revealBtn", force=True)
        elif mode in ("word", "spelling"):
            pg.fill("#typeInput", word)
            pg.click("text=核对", force=True)
        elif mode in ("quizEn", "quizCn"):
            pg.locator('#quizOpts button[data-correct="1"]').click(force=True)
        pg.wait_for_timeout(100)
        pg.evaluate(f"rate({rating_val})")
        pg.wait_for_timeout(150)
        sr = pg.evaluate(f"JSON.parse(localStorage.getItem('gaokao3500.sr.v1') || '{{}}')")
        return sr

    now = time.time() * 1000
    sr = learn_and_rate("meaning", "abandon", 5)
    m = sr["meaning"]["abandon"]
    print("meaning/abandon L%d due in %d d" % (m["l"], round((m["due"]-now)/86400000)))
    assert m["l"] == 5
    assert abs((m["due"]-now) - 7*86400000) < 86400000

    sr = learn_and_rate("word", "abandon", 1)
    w = sr["word"]["abandon"]
    print("word/abandon L%d due in %d d" % (w["l"], round((w["due"]-now)/86400000)))
    assert w["l"] == 1
    assert abs((w["due"]-now) - 1*86400000) < 86400000
    # 独立性：meaning 仍 L5
    assert sr["meaning"]["abandon"]["l"] == 5, "modes not independent!"

    # --- 首页进度应反映 ---
    pg.goto(BASE + "/index.html", wait_until="networkidle")
    pg.wait_for_selector("#modePicker .mode-chip")
    metas = [m.replace("\n", " ") for m in pg.locator("#modePicker .mode-chip").all_inner_texts()]
    for m in metas:
        if "看词记义" in m: print("meaning meta:", m)
        if "看义记词" in m: print("word meta:", m)
    assert any("看词记义" in m and "已学 1/" in m for m in metas)

    b.close()

print("console_errors:", errs if errs else "NONE")
if errs:
    raise SystemExit(1)
print("SR PER-MODE + SCHEDULE PASS")
