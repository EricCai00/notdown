"""Render the unchanged fixture using cmark-gfm and Pandoc's gfm reader.

Requires Python 3, cmarkgfm, and pandoc on PATH. This workspace installed
cmarkgfm into .run/gfm-renderer without changing application dependencies.
"""
from pathlib import Path
import hashlib
import html
import importlib.metadata
import json
import re
import shutil
import subprocess
import sys

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
sys.path.insert(0, str(ROOT / '.run' / 'gfm-renderer'))
import cmarkgfm
from cmarkgfm.cmark import Options

source_path = OUT.parent / 'typora-comparison.md'
source_bytes = source_path.read_bytes()
source = source_bytes.decode('utf-8')
version = subprocess.check_output(['pandoc', '--version'], text=True).splitlines()[0]
outputs = {
    'cmark-gfm': cmarkgfm.github_flavored_markdown_to_html(source, options=Options.CMARK_OPT_UNSAFE),
    'pandoc-gfm': subprocess.check_output(['pandoc', '-f', 'gfm', '-t', 'html5', '--wrap=none', str(source_path)]).decode('utf-8'),
}
CSS = """
body{font:16px/1.65 system-ui,'Microsoft YaHei',sans-serif;color:#24292f;background:white;margin:0;padding:28px 36px;overflow-wrap:anywhere}
main{max-width:980px;margin:auto}h1,h2,h3{line-height:1.3}h2{margin-top:1.8em;border-bottom:1px solid #ddd;padding-bottom:8px}
a{color:#0969da}pre{background:#f6f8fa;padding:16px;overflow:auto;white-space:pre-wrap}code{background:#f6f8fa;font-size:.9em}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #d0d7de;padding:8px;text-align:left}img{max-width:100%}
blockquote{border-left:4px solid #ddd;margin-left:0;padding-left:18px;color:#57606a}li{margin:5px 0}input[type=checkbox]{margin-right:6px}
.notice{background:#eef5ff;padding:16px;border-radius:8px;margin-bottom:24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.panel{border:1px solid #d0d7de;border-radius:10px;padding:20px;min-width:0}.panel h2{margin-top:0}
@media(max-width:850px){.grid{grid-template-columns:1fr}body{padding:20px}}
"""
def page(title, content, wide=False):
    # Preserve renderer output. The wrapper blocks active content and external
    # embeds; it does not strip tags or rewrite the generated task list markup.
    csp = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: https:; frame-src 'none'; base-uri 'none'; form-action 'none'"
    return f'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="{csp}"><title>{html.escape(title)}</title><style>{CSS}</style></head><body><main style="max-width:{"1440" if wide else "980"}px">{content}</main></body></html>'

sections = {}
summary = {}
for name, output in outputs.items():
    (OUT / f'{name}.fragment.html').write_text(output, encoding='utf-8')
    note = f'<div class="notice"><strong>{name}</strong> · <a href="index.html">返回并排对照</a><br>原文件全文；仅添加统一排版。无 Notdown 解析或任务列表补丁。脚本与外部 iframe 不运行；图表围栏不额外转换成图。</div>'
    (OUT / f'{name}.html').write_text(page(name, note + output), encoding='utf-8')
    # Extract the actual G02 HTML from each full-document output, not a second
    # Markdown rendering and not a manually authored checkbox illustration.
    match = re.search(r'<h2\b[^>]*>G02[^<]*</h2>([\s\S]*?)(?=<h2\b)', output)
    if not match:
        raise RuntimeError(f'Missing G02 in {name}')
    section = match.group(1)
    sections[name] = section
    ordered = re.search(r'<ol\b[^>]*>[\s\S]*?</ol>', section)
    summary[name] = {
        'g02_checkbox_inputs': len(re.findall(r'type="checkbox"', section)),
        'ordered_list_html': ordered.group(0) if ordered else None,
    }

metadata = {
    'source': str(source_path),
    'source_sha256': hashlib.sha256(source_bytes).hexdigest(),
    'cmarkgfm_python_package': importlib.metadata.version('cmarkgfm'),
    'cmark_call': 'github_flavored_markdown_to_html(source, options=Options.CMARK_OPT_UNSAFE)',
    'pandoc_version': version,
    'pandoc_args': ['-f', 'gfm', '-t', 'html5', '--wrap=none'],
    'results': summary,
}
(OUT / 'results.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
shutil.copyfile(OUT.parent / 'typora-comparison-image.png', OUT / 'typora-comparison-image.png')
panels = ''.join(f'<section class="panel"><h2>{name}</h2><p><a href="{name}.html">打开全文</a> · <a href="{name}.fragment.html">原始 HTML 文件</a></p>{sections[name]}<details><summary>查看有序任务列表的实际 HTML</summary><pre>{html.escape(summary[name]["ordered_list_html"] or "未生成 ol")}</pre></details></section>' for name in outputs)
intro = f'''<h1>GFM 实际渲染对照</h1>
<p>cmark-gfm（Python 绑定 {metadata['cmarkgfm_python_package']}）与 {version} / gfm。</p>
<p><strong>实测：cmark-gfm 将有序任务渲染成复选框；Pandoc 3.11 / gfm 将其中的 [ ]、[x] 保留为文字。</strong>两者的无序任务均渲染为复选框。</p>
<p>官方直接说明：<a href="https://enterprise.github.com/downloads/en/markdown-cheatsheet.pdf#page=2">GitHub Markdown 速查表，第 2 页 TASK LISTS</a>：“any unordered or ordered list supported”。<a href="https://github.github.io/gfm/#task-list-items-extension-">GFM §5.3</a> 对列表项统一定义任务标记，示例未单独展示有序任务。用户当前 Typora 截图中，有序任务保留文字，与这里的 Pandoc 结果一致。</p>
<div class="notice">以下截取自两款渲染器的<strong>全文 HTML 输出</strong>中的 G02，不是人工制作的复选框。完整原文件均已渲染，可从各栏打开。列表编号使用浏览器默认显示；这里没有套用 GitHub 网站隐藏列表标记的 CSS。</div>
<pre>1. [ ] ordered task\n2. [x] ordered completed task</pre>
<div class="grid">{panels}</div>
<h2>渲染条件</h2><p>两者均读取同一份 UTF-8 Markdown，未去掉 YAML，未调用 Notdown codec。cmark-gfm 开启原始 HTML 输出并使用自带 GFM 扩展；Pandoc 使用 gfm 输入格式。包装页限制活动内容，但保留各渲染器的 HTML 输出。数学、高亮、目录和图表等 Typora 扩展不在这里额外补齐。</p>
<p>源码 SHA-256：<code>{metadata['source_sha256']}</code></p><p><a href="results.json">版本、命令与结果记录</a> · <a href="https://github.com/theacodes/cmarkgfm">cmark-gfm Python 绑定</a></p>'''
(OUT / 'index.html').write_text(page('GFM 实际渲染对照', intro, True), encoding='utf-8')
print(json.dumps(metadata, ensure_ascii=False, indent=2))
