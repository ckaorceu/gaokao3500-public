from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 900, "height": 1000})
    pg.goto(BASE + "/learn.html?w=ability", wait_until="networkidle")
    pg.wait_for_selector("#flashcard .w")
    pg.click('#modeTabs button[data-mode="quizEn"]')
    pg.wait_for_selector("#quizOpts button")

    # 找正确项并点击，确认变绿
    correct = pg.locator('#quizOpts button[data-correct="1"]')
    correct.click()
    bg = correct.evaluate("el=>getComputedStyle(el).backgroundColor")
    print("correct btn bg (should be green-ish):", bg)
    assert bg not in ("rgba(0, 0, 0, 0)", "transparent"), "correct not highlighted"

    # 重新进入，找错误项点，确认变红 + 正确项变绿
    pg.goto(BASE + "/learn.html?w=ability&mode=quizEn", wait_until="networkidle")
    pg.wait_for_selector("#quizOpts button")
    wrong = pg.locator('#quizOpts button[data-correct="0"]').first
    wrong.click()
    wbg = wrong.evaluate("el=>getComputedStyle(el).backgroundColor")
    cbg = pg.locator('#quizOpts button[data-correct="1"]').evaluate("el=>getComputedStyle(el).backgroundColor")
    print("wrong btn bg (red-ish):", wbg)
    print("correct btn bg after wrong (green-ish):", cbg)
    assert wbg != "rgba(0, 0, 0, 0)", "wrong not red"

    # 选项宽度应占满（>= 600px in 900 viewport）
    w = correct.evaluate("el=>el.getBoundingClientRect().width")
    print("option width:", round(w))
    assert w > 600, "option too narrow"

    b.close()
print("STYLE PASS")
