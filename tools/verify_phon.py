# verify_phon.py — 验证音标正确渲染
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 1280, 'height': 720})
        page.on('console', lambda m: print(f'[{m.type}] {m.text}') if m.type in ('error','warning') else None)
        page.on('pageerror', lambda e: print(f'[PAGEERROR] {e}'))

        # 学习页直接打开 a
        await page.goto('http://127.0.0.1:8765/learn.html', wait_until='networkidle')
        await page.wait_for_selector('#wName')
        name = await page.text_content('#wName')
        phon = await page.text_content('#wPhon')
        # 写到文件，避免 GBK print 崩
        with open('phon_check.txt', 'w', encoding='utf-8') as f:
            f.write(f'[learn.html a] name={name!r} phon={phon!r}\n')

        # 截图
        await page.screenshot(path='shot_phon.png', full_page=False)
        print('screenshot -> shot_phon.png')

        await browser.close()

asyncio.run(main())