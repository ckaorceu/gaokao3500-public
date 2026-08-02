from playwright.sync_api import sync_playwright
from PIL import Image

BASE = "http://127.0.0.1:8765"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 900, "height": 1000})
    pg.goto(BASE + "/learn.html?w=ability&mode=quizEn", wait_until="networkidle")
    pg.wait_for_selector("#quizOpts button")
    pg.locator('#quizOpts button[data-correct="1"]').click()
    pg.wait_for_timeout(150)
    # 取每个按钮中心像素
    btns = pg.locator("#quizOpts button").all()
    boxes = []
    for i, btn in enumerate(btns):
        bb = btn.bounding_box()
        boxes.append((i, bb))
    pg.screenshot(path="shot_qpx.png")
    im = Image.open("shot_qpx.png").convert("RGB")
    for i, bb in boxes:
        cx = int(bb["x"] + bb["width"]/2)
        cy = int(bb["y"] + bb["height"]/2)
        print(f"btn{i} center px = {im.getpixel((cx,cy))}  label={btns[i].inner_text()[:18]}")
    # 答错态：点第一个错误项
    pg.goto(BASE + "/learn.html?w=ability&mode=quizEn", wait_until="networkidle")
    pg.wait_for_selector("#quizOpts button")
    pg.locator('#quizOpts button[data-correct="0"]').first.click()
    pg.wait_for_timeout(150)
    btns2 = pg.locator("#quizOpts button").all()
    boxes2 = [(i, btn.bounding_box()) for i, btn in enumerate(btns2)]
    pg.screenshot(path="shot_qpx2.png")
    im2 = Image.open("shot_qpx2.png").convert("RGB")
    print("--- wrong answer state ---")
    for i, bb in boxes2:
        cx = int(bb["x"] + bb["width"]/2)
        cy = int(bb["y"] + bb["height"]/2)
        print(f"btn{i} center px = {im2.getpixel((cx,cy))}  label={btns2[i].inner_text()[:18]}")
    b.close()
