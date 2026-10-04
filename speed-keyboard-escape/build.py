#!/usr/bin/env python3
"""Gói game thành HTML để phát hành.

  dist/speed-keyboard-escape.html   1 file đầy đủ, mở trực tiếp trên máy (đã nhúng Three.js)
  dist/artifact.html                dạng fragment cho khung Artifact (Three.js tải từ jsDelivr, ghim r159)
"""
import re, pathlib

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf8')
css = (root / 'style.css').read_text(encoding='utf8')
THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js'


def read_js(src):
    return (root / src).read_text(encoding='utf8').replace('</script', '<\\/script')  # tránh đóng thẻ script sớm


def inline_all(m):
    return '<script>\n' + read_js(m.group(1)) + '\n</script>'


def standalone():
    out = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>')
    return re.sub(r'<script src="([^"]+)"></script>', inline_all, out)


def artifact(three_src=THREE_CDN):
    head_links = re.findall(r'<link[^>]*fonts[^>]*>', html)
    body = re.search(r'<body>(.*)</body>', html, re.S).group(1)

    def sub(m):
        src = m.group(1)
        if src.startswith('vendor/three'):
            return f'<script src="{three_src}"></script>\n<script>if(!window.THREE){{var l=document.getElementById("loading");if(l)l.innerHTML="<div><h1>Không tải được Three.js</h1><p>Kiểm tra kết nối mạng rồi tải lại trang.</p></div>";}}</script>'
        return inline_all(m)

    body = re.sub(r'<script src="([^"]+)"></script>', sub, body)
    return ('<title>+1 Speed Keyboard Escape</title>\n' + '\n'.join(head_links) +
            '\n<style>\n' + css + '\n</style>\n' + body.strip() + '\n')


if __name__ == '__main__':
    out = root / 'dist'
    out.mkdir(exist_ok=True)
    for name, text in (('speed-keyboard-escape.html', standalone()), ('artifact.html', artifact())):
        (out / name).write_text(text, encoding='utf8')
        print(f'{out / name} ({(out / name).stat().st_size / 1024:.0f} KB)')
    # bản thử cục bộ (Three.js lấy từ vendor/) để kiểm thử khi không có mạng
    (out / '_artifact_local_test.html').write_text(artifact('../vendor/three.min.js'), encoding='utf8')
