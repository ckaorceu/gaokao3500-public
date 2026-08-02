from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 900, "height": 1100})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR:" + str(e)))

    # 首页
    pg.goto(BASE + "/index.html", wait_until="networkidle")
    pg.wait_for_selector("#modePicker .mode-chip")
    chips = pg.locator("#modePicker .mode-chip").all_inner_texts()
    print("HOME mode chips:", len(chips))
    assert len(chips) == 5, "expected 5 mode chips"

    # 选「看英选中」再开始 -> 进入 learn.html?mode=quizEn
    pg.locator('#modePicker .mode-chip[data-mode="quizEn"]').click()
    pg.locator("#startBtn").click()
    pg.wait_for_url("**/learn.html**")
    url = pg.url
    print("ENTRY url:", url)
    assert "mode=quizEn" in url, "mode not passed"

    # 学习页不应再有 mode-tabs
    assert pg.locator("#modeTabs").count() == 0, "modeTabs still present!"
    # 应显示模式标签
    ml = pg.text_content("#modeLabel")
    print("modeLabel:", ml)
    assert "看英选中" in ml, "mode label wrong"
    # 选择题选项应渲染
    pg.wait_for_selector("#quizOpts button")
    opts = pg.locator("#quizOpts button").count()
    print("quiz options:", opts)
    assert opts == 4

    # 回到首页，选「看词记义」开始，确认是 meaning 模式（显示「显示释义」按钮）
    pg.goto(BASE + "/index.html", wait_until="networkidle")
    pg.locator('#modePicker .mode-chip[data-mode="meaning"]').click()
    pg.locator("#startBtn").click()
    pg.wait_for_url("**/learn.html**")
    pg.wait_for_selector("#revealBtn")
    rb = pg.text_content("#revealBtn")
    print("meaning reveal btn:", rb)
    assert "显示释义" in rb

    b.close()

print("console_errors:", errs if errs else "NONE")
if errs:
    raise SystemExit(1)
print("HOME MODE PICKER PASS")
