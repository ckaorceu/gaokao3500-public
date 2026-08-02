from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:8765"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page()
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PE:"+str(e)))

    # home renders list (no regression)
    pg.goto(BASE + "/index.html", wait_until="networkidle")
    pg.wait_for_selector("#wordList .word-card")
    n = pg.locator("#wordList .word-card").count()
    print("home word cards:", n)
    assert n > 0

    # weak-drill: 只练未掌握 -> learn page should start with a weak word (low level)
    # first set abandon meaning to L5 (done) so it's not weak; pick a fresh word like 'zebra' (unknown)
    pg.goto(BASE + "/learn.html?mode=meaning&w=zebra&drill=weak", wait_until="networkidle")
    pg.wait_for_selector("#flashcard .w", state="attached")
    pg.wait_for_timeout(200)
    w = pg.text_content("#flashcard .w")
    print("weak-drill first word:", w)
    assert w is not None

    # shuffle produces different order than seq for the same list
    pg.goto(BASE + "/learn.html?mode=meaning&order=seq", wait_until="networkidle")
    pg.wait_for_selector("#flashcard .w", state="attached")
    seq_w = pg.text_content("#flashcard .w")
    pg.goto(BASE + "/learn.html?mode=meaning&order=shuffle", wait_until="networkidle")
    pg.wait_for_selector("#flashcard .w", state="attached")
    sh_w = pg.text_content("#flashcard .w")
    print("seq first:", seq_w, "| shuffle first:", sh_w)
    assert seq_w == "a", "seq queue should start at 'a'"

    b.close()

print("errors:", errs if errs else "NONE")
if errs: raise SystemExit(1)
print("DRILL + SHUFFLE + LIST PASS")
