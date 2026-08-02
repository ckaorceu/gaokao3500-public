from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 900, "height": 1000})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR:" + str(e)))

    # 看英选中
    pg.goto(BASE + "/learn.html?mode=quizEn&w=abandon", wait_until="networkidle")
    pg.wait_for_selector("#flashcard .w")
    pg.wait_for_selector("#quizOpts button")
    word = pg.text_content("#flashcard .w")
    opts = pg.locator("#quizOpts button").all_inner_texts()
    assert len(opts) == 4, "quizEn options != 4: " + str(len(opts))
    print("QUIZ-EN word=%s opts=%d" % (ascii(word), len(opts)))

    # 点第一个按钮（可能是对或错），看结果区出现反馈 + 评级显示
    pg.locator("#quizOpts button").first.click()
    res = pg.text_content("#checkResult")
    assert res and ("正确" in res or "答案" in res), "quizEn no feedback: " + res
    rate_visible = pg.eval_on_selector("#rateWrap", "el=>el.style.display")
    print("  after click res=%s rateWrap=%s" % (ascii(res), rate_visible))
    # 选项被禁用
    disabled = pg.evaluate("()=>[...document.querySelectorAll('#quizOpts button')].every(b=>b.disabled)")
    print("  all options disabled:", disabled)

    # 看中选英
    pg.goto(BASE + "/learn.html?mode=quizCn&w=abandon", wait_until="networkidle")
    pg.wait_for_selector("#quizOpts button")
    meaning = pg.text_content("#flashcard .mn")
    opts2 = pg.locator("#quizOpts button").all_inner_texts()
    assert len(opts2) == 4, "quizCn options != 4"
    print("QUIZ-CN meaning shown opts=%d" % len(opts2))

    # 快捷键数字键选择（点第 2 个之前先测按 '2'）
    pg.keyboard.press("2")
    res2 = pg.text_content("#checkResult")
    assert res2 and ("正确" in res2 or "答案" in res2), "quizCn key2 no feedback: " + res2
    print("  key '2' ->", ascii(res2))

    # 全部模式切换无报错（模式已移到首页选择）
    # 确认学习页不再有 tab 组
    assert pg.locator("#modeTabs").count() == 0, "modeTabs still present"
    print("TABS: removed (mode chosen on home page)")

    b.close()

print("console_errors:", errs if errs else "NONE")
if errs:
    raise SystemExit(1)
print("ALL QUIZ MODES PASS")
