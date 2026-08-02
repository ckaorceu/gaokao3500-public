import subprocess, time, os, sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765"

def run():
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_page()
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append("PAGEERR:" + str(e)))

        # 进入学习页首词 a（看词记义）
        pg.goto(BASE + "/learn.html?mode=meaning&w=a", wait_until="networkidle")
        pg.wait_for_selector("#flashcard .w")
        name = pg.text_content("#flashcard .w")
        phon = pg.text_content("#flashcard .ph")
        assert name == "a", "name != a: " + name
        assert "美" in phon, "phon no us: " + phon
        print("MODE meaning: word=%s phon=%s" % (ascii(name), ascii(phon)))

        # 显示释义
        pg.click("#revealBtn")
        mn = pg.text_content("#mn")
        assert mn and "一" in mn, "meaning not shown: " + ascii(mn)
        print("  reveal meaning OK:", ascii(mn[:20]))

        # 切换 看义记词（通过 URL 进入，模式选择已移到首页）
        pg.goto(BASE + "/learn.html?mode=word&w=a", wait_until="networkidle")
        pg.wait_for_selector("#typeInput")
        hint = pg.text_content("#flashcard .mn")
        assert hint and len(hint) > 0
        # 输入正确拼写
        pg.fill("#typeInput", "a")
        pg.click("text=核对")
        res = pg.text_content("#checkResult")
        assert "正确" in res, "word mode check failed: " + res
        print("MODE word: hint shown, correct input ->", ascii(res))

        # 切换 听音拼写
        pg.goto(BASE + "/learn.html?mode=spelling&w=a", wait_until="networkidle")
        pg.wait_for_selector("#typeInput")
        # 输入错误再核对
        pg.fill("#typeInput", "zzz")
        pg.click("text=核对")
        res2 = pg.text_content("#checkResult")
        assert "正确拼写" in res2, "spelling check failed: " + res2
        print("MODE spelling: wrong input ->", ascii(res2))

        # 巧记编辑
        pg.click("text=编辑")
        pg.wait_for_selector("#trickAssoc")
        pg.fill("#trickAssoc", "a = 字母表第一个")
        pg.fill("#trickHomo", "谐音测试")
        pg.click("text=保存")
        pg.wait_for_selector("#trickBody .trick-item")
        items = pg.query_selector_all("#trickBody .trick-item")
        assert len(items) >= 2, "trick items not saved: " + str(len(items))
        print("TRICK panel saved items:", len(items))

        # 验证持久化（重载）
        pg.reload(wait_until="networkidle")
        pg.wait_for_selector("#trickBody")
        items2 = pg.query_selector_all("#trickBody .trick-item")
        assert len(items2) >= 2, "trick lost after reload"
        print("TRICK persistence OK after reload:", len(items2))

        b.close()

    print("console_errors:", errs if errs else "NONE")
    if errs:
        sys.exit(1)
    print("ALL MODES PASS")

if __name__ == "__main__":
    run()
