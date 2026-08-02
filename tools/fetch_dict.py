# -*- coding: utf-8 -*-
import urllib.request
import json
import base64
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

req = urllib.request.Request('https://api.github.com/repos/RealKai42/qwerty-learner/contents/src/resources/dictionary.ts')
with urllib.request.urlopen(req, timeout=60) as r:
    data = json.loads(r.read())
content = base64.b64decode(data['content']).decode('utf-8')
with open('dictionary.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print(f'saved {len(content)} chars')