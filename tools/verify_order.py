from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 900, "height": 1100})
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR:" + str(e)))

    # 首页：顺序/乱序 chips
    pg.goto(BASE + "/index.html", wait_until="networkidle")
    pg.wait_for_selector("#orderChips .order-chip")
    chips = pg.locator("#orderChips .order-chip").all_inner_texts()
    print("order chips:", chips)
    assert chips == ["顺序", "乱序"], "order chips wrong"

    # 选 乱序 + 看词记义，开始
    pg.locator('#orderChips .order-chip[data-order="shuffle"]').click()
    pg.locator('#modePicker .mode-chip[data-mode="meaning"]').click()
    pg.locator("#startBtn").click()
    pg.wait_for_url("**/learn.html**")
    url = pg.url
    print("entry url:", url)
    assert "order=shuffle" in url, "shuffle not passed"

    pg.wait_for_selector("#flashcard .w")
    name = pg.text_content("#flashcard .w")
    print("first word (shuffle run1):", name)

    # 再开两个乱序 session，看是否可能乱序（3893词，两次都从 a 起概率极低）
    seqs = []
    for _ in range(2):
        pg2 = b.new_page()
        pg2.goto(BASE + "/learn.html?mode=meaning&order=shuffle&w=a", wait_until="networkidle")
        pg2.wait_for_selector("#flashcard .w")
        # 连续取前 5 个词名（通过暴露的 queue 不易取，改取 DOM：翻页触发看前几个）
        # 简单做法：直接读 learn.js 暴露的全局队列
        names = pg2.evaluate("()=>queue.slice(0,5).map(x=>x.w.name)")
        seqs.append(names)
        pg2.close()
    print("shuffle seq A:", seqs[0])
    print("shuffle seq B:", seqs[1])
    # 断言两次乱序序列不同（极小概率同序）
    assert seqs[0] != seqs[1], "two shuffles identical (unlikely) - check shuffle"

    # 顺序模式应从 a 开始且稳定
    pg3 = b.new_page()
    pg3.goto(BASE + "/learn.html?mode=meaning&w=a", wait_until="networkidle")
    pg3.wait_for_selector("#flashcard .w")
    seq_seq = pg3.evaluate("()=>queue.slice(0,5).map(x=>x.w.name)")
    print("seq seq:", seq_seq)
    pg3.close()

    b.close()

print("console_errors:", errs if errs else "NONE")
if errs:
    raise SystemExit(1)
print("ORDER (SHUFFLE) PASS")
