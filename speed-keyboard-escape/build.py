#!/usr/bin/env python3
"""Gói game thành 1 file HTML duy nhất (dist/speed-keyboard-escape.html) để mở trực tiếp bằng trình duyệt."""
import re, pathlib

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf8')
css = (root / 'style.css').read_text(encoding='utf8')

def inline_script(m):
    src = m.group(1)
    code = (root / src).read_text(encoding='utf8')
    code = code.replace('</script', '<\\/script')  # tránh đóng thẻ script sớm
    return '<script>\n' + code + '\n</script>'

html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>')
html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)

out = root / 'dist'
out.mkdir(exist_ok=True)
target = out / 'speed-keyboard-escape.html'
target.write_text(html, encoding='utf8')
print(f'{target} ({target.stat().st_size / 1024:.0f} KB)')
