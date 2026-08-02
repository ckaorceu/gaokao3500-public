# verify_all.py — 验证三处改动
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 1280, 'height': 720})
        errors = []
        page.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type in ('error','warning') else None)
        page.on('pageerror', lambda e: errors.append(f'[PAGEERROR] {e}'))

        # ---- 1. 学习页：音标美/英 + 朗读按钮 + 紧凑 ----
        await page.goto('http://127.0.0.1:8765/learn.html', wait_until='networkidle')
        await page.wait_for_selector('#wName')
        name = await page.text_content('#wName')
        phon = await page.text_content('#wPhon')
        has_speak = await page.query_selector('.speak') is not None
        card_h = await page.evaluate("document.querySelector('.flashcard').offsetHeight")
        await page.screenshot(path='shot_learn_new.png')
        with open('verify_out.txt','w',encoding='utf-8') as f:
            f.write(f'learn name={name}\n')
            f.write(f'learn phon={phon}\n')
            f.write(f'learn has_speak={has_speak}\n')
            f.write(f'learn card_height={card_h}\n')

        # 测试朗读（检查 speechSynthesis 可用）
        speak_ok = await page.evaluate("typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'")
        with open('verify_out.txt','a',encoding='utf-8') as f:
            f.write(f'learn speechSynthesis_supported={speak_ok}\n')

        # 测试评级推进
        await page.click('.actions .primary')
        counter = await page.text_content('#counter')
        with open('verify_out.txt','a',encoding='utf-8') as f:
            f.write(f'after rate counter={counter}\n')

        # ---- 2. 首页：卡片音标美/英 ----
        await page.goto('http://127.0.0.1:8765/index.html', wait_until='networkidle')
        await page.wait_for_selector('.word-card')
        # 找一个既有美音又有英音的词卡
        card_phon = await page.eval_on_selector_all('.word-card', "els => els.slice(0,5).map(e => e.querySelector('.phonetic').textContent)")
        with open('verify_out.txt','a',encoding='utf-8') as f:
            f.write(f'index first5 phon={card_phon}\n')
        await page.screenshot(path='shot_index_new.png', full_page=False)

        await browser.close()

        with open('verify_out.txt','a',encoding='utf-8') as f:
            f.write(f'console_errors={len(errors)}\n')
            for e in errors:
                f.write('  '+e+'\n')

asyncio.run(main())
