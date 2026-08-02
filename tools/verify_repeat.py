from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:8765"
errs = []

def setup(b, repeat="on", rmax=None, mode="meaning"):
    pg = b.new_page()
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PE:"+str(e)))
    pg.goto(BASE + "/index.html", wait_until="networkidle")
    pg.wait_for_selector("#repeatChips .drill-chip")
    pg.click('#repeatChips .drill-chip[data-repeat="%s"]' % repeat)
    if repeat == "on" and rmax is not None:
        pg.click('#repeatMaxChips .drill-chip[data-max="%s"]' % str(rmax))
    if repeat == "off":
        assert pg.is_hidden("#repeatMaxRow"), "max row should hide when repeat off"
    else:
        assert pg.is_visible("#repeatMaxRow"), "max row should show when repeat on"
    pg.click('#modePicker .mode-chip[data-mode="%s"]' % mode)
    pg.click("#startBtn")
    pg.wait_for_timeout(250)
    pg.wait_for_selector("#flashcard .w", state="attached")
    return pg

def drive_weak(pg, target, times):
    for _ in range(times):
        pg.evaluate(f"{{ let i=queue.findIndex(x=>x.w.name==='{target}'); if(i>=0) idx=i; }}")
        pg.evaluate("rate(0)")  # 不会
        pg.wait_for_timeout(20)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)

    # 1) chips present, max row hidden until repeat on
    pg = setup(b, "off")
    print("off: max row hidden ok")
    pg.close()

    pg = setup(b, "on")
    print("on: max row visible ok")
    assert "repeat=on" in pg.url
    pg.close()

    # 2) cap=1 : rating 不会 once enqueues 1 extra, 2nd weak rating does NOT enqueue more
    pg = setup(b, "on", rmax=1)
    assert "rmax=1" in pg.url
    target = pg.text_content("#flashcard .w")
    pg.evaluate(f"{{ let i=queue.findIndex(x=>x.w.name==='{target}'); if(i>=0) idx=i; }}")
    drive_weak(pg, target, 1)
    s1 = pg.evaluate(f"({{rc: repeatCount['{target}']||0, inQ: queue.filter(x=>x.w.name==='{target}').length}})")
    assert s1["rc"] == 1 and s1["inQ"] == 2, "cap=1 fail: " + str(s1)
    drive_weak(pg, target, 1)
    s2 = pg.evaluate(f"({{rc: repeatCount['{target}']||0, inQ: queue.filter(x=>x.w.name==='{target}').length}})")
    assert s2["rc"] == 1 and s2["inQ"] == 2, "cap=1 exceeded: " + str(s2)
    print("cap=1 ok:", s1, s2)
    pg.close()

    # 3) cap=5 : 5 weak ratings -> rc=5, inQ grows to 6
    pg = setup(b, "on", rmax=5)
    target = pg.text_content("#flashcard .w")
    pg.evaluate(f"{{ let i=queue.findIndex(x=>x.w.name==='{target}'); if(i>=0) idx=i; }}")
    drive_weak(pg, target, 5)
    s = pg.evaluate(f"({{rc: repeatCount['{target}']||0, inQ: queue.filter(x=>x.w.name==='{target}').length}})")
    assert s["rc"] == 5 and s["inQ"] == 6, "cap=5 fail: " + str(s)
    print("cap=5 ok:", s)
    pg.close()

    # 4) infinity: many weak ratings keep re-enqueuing
    pg = setup(b, "on", rmax=-1)
    target = pg.text_content("#flashcard .w")
    pg.evaluate(f"{{ let i=queue.findIndex(x=>x.w.name==='{target}'); if(i>=0) idx=i; }}")
    drive_weak(pg, target, 6)
    s = pg.evaluate(f"({{rc: repeatCount['{target}']||0, inQ: queue.filter(x=>x.w.name==='{target}').length}})")
    assert s["rc"] == 6 and s["inQ"] == 7, "infinity fail: " + str(s)
    print("infinity ok:", s)
    pg.close()

    b.close()

print("errors:", errs if errs else "NONE")
if errs: raise SystemExit(1)
print("REPEAT CAP CONFIG PASS")
