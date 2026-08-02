# -*- coding: utf-8 -*-
"""
构建高考3500词巧记网站。
生成静态文件：index.html, learn.html, words.js
所有数据从 words.json 提取，巧记位留空。
"""
import json
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(HERE, 'words.json'), 'r', encoding='utf-8') as f:
    words = json.load(f)

# 生成 words.js
words_js = "const WORDS = " + json.dumps(words, ensure_ascii=False) + ";\n"
with open(os.path.join(HERE, 'words.js'), 'w', encoding='utf-8') as f:
    f.write(words_js)

print(f'generated words.js ({len(words)} words)')