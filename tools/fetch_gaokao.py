# -*- coding: utf-8 -*-
import urllib.request
import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Try multiple CDN mirrors
urls = [
    'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/GaoKao_3500.json',
    'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/GaoKao_3500.json',
    'https://cdn.jsdelivr.net/gh/RealKai42/qwerty-learner/public/dicts/GaoKao_3500.json',
    'https://cdn.jsdelivr.net/gh/RealKai42/qwerty-learner@master/public/dicts/GaoKao_3500.json',
]

for url in urls:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=20) as r:
            content = r.read()
        # save raw
        with open('GaoKao_3500_raw.json', 'wb') as f:
            f.write(content)
        print(f'OK from {url}: {len(content)} bytes')
        break
    except Exception as e:
        print(f'FAIL {url}: {e}')