# -*- coding: utf-8 -*-
"""
从 qwerty-learner 的 GaoKao_3500.json 转换为 words.js
- name: 单词
- usphone: 美音（可能为空）
- ukphone: 英音（可能为空）
- pos: 词性
- meaning: 中文释义
- trans: 原始 trans
"""
import json
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

POS_RE = re.compile(
    r'^((?:n|v|adj|adv|prep|pron|conj|art|num|int|aux|vi|vt|a|ad|pl)\.)\s*'
)

def parse_trans(trans_list):
    out = []
    for t in trans_list:
        text = t.strip()
        if not text:
            continue
        SEP = '|SPLIT|'
        norm = re.sub(
            r'(^|\s)((?:n|v|adj|adv|prep|pron|conj|art|num|int|aux|vi|vt|a|ad|pl)\.)\s',
            lambda m: m.group(1) + SEP + m.group(2) + ' ',
            text,
        )
        parts = [p.strip() for p in norm.split(SEP) if p.strip()]
        for p in parts:
            m = POS_RE.match(p)
            if m:
                pos = m.group(1)
                meaning = p[m.end():].strip()
                if meaning:
                    out.append((pos, meaning))
            elif p:
                if out:
                    prev_pos, prev_mean = out[-1]
                    out[-1] = (prev_pos, prev_mean + '；' + p)
                else:
                    out.append(('', p))
    return out


def main():
    with open('GaoKao_3500_raw.json', 'r', encoding='utf-8') as f:
        raw = json.load(f)

    words = []
    for item in raw:
        name = item.get('name', '').strip()
        if not name:
            continue
        usphone = (item.get('usphone') or '').strip()
        ukphone = (item.get('ukphone') or '').strip()
        trans = item.get('trans') or []

        parsed = parse_trans(trans)

        if parsed:
            pos_set = []
            meaning_parts = []
            seen_pos = set()
            for pos, m in parsed:
                if pos and pos not in seen_pos:
                    pos_set.append(pos)
                    seen_pos.add(pos)
                meaning_parts.append(m)
            pos = ' '.join(pos_set) if pos_set else ''
            meaning = '；'.join(meaning_parts)
        else:
            pos = ''
            meaning = ''

        words.append({
            'name': name,
            'usphone': usphone,
            'ukphone': ukphone,
            'pos': pos,
            'meaning': meaning,
            'trans': trans,
        })

    with open('words.json', 'w', encoding='utf-8') as f:
        json.dump(words, f, ensure_ascii=False, indent=2)

    total = len(words)
    no_meaning = sum(1 for w in words if not w['meaning'])
    no_us = sum(1 for w in words if not w['usphone'])
    no_uk = sum(1 for w in words if not w['ukphone'])
    with open('convert_stats.txt', 'w', encoding='utf-8') as f:
        f.write(f'total: {total}\n')
        f.write(f'no_meaning: {no_meaning}\n')
        f.write(f'no_usphone: {no_us}\n')
        f.write(f'no_ukphone: {no_uk}\n')

if __name__ == '__main__':
    main()