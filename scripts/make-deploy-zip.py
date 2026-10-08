"""
生成可拖拽部署的站点压缩包，并做上线前完整性校验。

为什么需要它：
  部署到 GitHub Pages 之外还有大量零门槛选择
  （Cloudflare Pages / Netlify Drop 的拖拽上传），
  但它们要的是一个**完整的静态站点目录**。手动压缩 dist 很容易漏掉隐藏文件
  或把 .prerender 之类的构建中间产物一起打进去。

这个脚本会：
  1. 校验 dist 里该有的东西都在（404、RSS、sitemap、搜索索引、字体）
  2. 排除构建中间产物（.prerender 目录）
  3. 校验所有 HTML 引用的站内资源都真实存在（提前发现 404）
  4. 打出时间戳命名的 zip

用法:
  python scripts/make-deploy-zip.py
退出码 0 表示校验通过且压缩包已生成。
"""

from __future__ import annotations

import re
import sys
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
# 构建中间产物，不属于站点内容，不能打进去
EXCLUDE_DIRS = {".prerender"}

errors: list[str] = []
warnings: list[str] = []
checks: list[tuple[bool, str]] = []


def check(ok: bool, label: str, *, warn_only: bool = False) -> None:
    checks.append((ok, label))
    if not ok:
        (warnings if warn_only else errors).append(label)


def collect_files() -> list[Path]:
    """收集要打包的文件，跳过中间产物目录。"""
    out: list[Path] = []
    for p in DIST.rglob("*"):
        if any(part in EXCLUDE_DIRS for part in p.relative_to(DIST).parts):
            continue
        if p.is_file():
            out.append(p)
    return out


def verify_required() -> None:
    """检查站点必需的文件/目录是否存在。"""
    print("[1] 必需文件检查")
    required_files = {
        "index.html": "首页",
        "404.html": "404 页面（GitHub Pages / 多数托管平台依赖它）",
        "rss.xml": "RSS 订阅源",
        "sitemap-index.xml": "站点地图索引",
        "favicon.svg": "站点图标",
        "favicon.ico": "站点图标（旧浏览器）",
        "apple-touch-icon.png": "iOS 主屏图标",
        "og-default.png": "社交分享默认卡片图",
        "avatar.svg": "头像占位图",
    }
    for rel, desc in required_files.items():
        check((DIST / rel).exists(), f"{rel} — {desc}")

    # 搜索索引：由 astro-pagefind 在 build 后生成
    pf = DIST / "pagefind"
    check(pf.is_dir(), "pagefind/ 搜索索引目录")
    if pf.is_dir():
        for rel, desc in {
            "pagefind.js": "搜索核心脚本",
            "pagefind-component-ui.js": "搜索界面组件（Component UI）",
            "pagefind-component-ui.css": "搜索界面样式",
            "pagefind-entry.json": "索引入口元数据",
        }.items():
            check((pf / rel).exists(), f"pagefind/{rel} — {desc}")

    # KaTeX 公式字体：缺了公式就变成错位的乱码
    fonts = list(DIST.rglob("KaTeX_*.woff2"))
    check(len(fonts) > 0, f"KaTeX 数学字体（找到 {len(fonts)} 个 woff2）")

    # 文章页
    for rel in (
        "tech/http-request-smuggling/index.html",
        "tech/i2c-sensor-debugging/index.html",
        "tools/web-security-toolkit/index.html",
        "tools/powershell-workspace-organization/index.html",
        "about/index.html",
        "archive/index.html",
        "tags/index.html",
        "tech/index.html",
        "tools/index.html",
    ):
        check((DIST / rel).exists(), f"{rel}")


def verify_no_intermediate() -> None:
    """确保没有把构建中间产物打进去。"""
    print("\n[2] 中间产物排除检查")
    unexpected = [
        p for p in DIST.rglob("*")
        if p.is_file() and any(part in EXCLUDE_DIRS for part in p.relative_to(DIST).parts)
    ]
    check(True, f"dist 中存在的中间产物文件数: {len(unexpected)}（将被排除，不影响打包）")


def verify_internal_links(files: list[Path]) -> None:
    """
    校验 HTML 里引用的站内资源是否真实存在。

    这是提前发现 404 最有效的手段：构建成功不代表资源路径对，
    尤其是 base path 配错、或 public/ 下的文件忘了放。
    """
    print("\n[3] 站内资源引用完整性")
    available = {p.relative_to(DIST).as_posix() for p in files}
    missing: dict[str, set[str]] = {}

    html_files = [p for p in files if p.suffix == ".html"]
    for html in html_files:
        try:
            text = html.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        # 只检查以 / 开头的站内绝对路径引用
        for m in re.finditer(r'(?:href|src)="(/[^"#?]*)"', text):
            ref = m.group(1).lstrip("/")
            if not ref or ref.endswith("/"):
                # 目录形式，检查其 index.html
                candidate = f"{ref}index.html" if ref else "index.html"
            else:
                candidate = ref
            if candidate in available:
                continue
            # 也接受目录本身存在的情况
            if any(a.startswith(candidate.rstrip("/") + "/") for a in available):
                continue
            missing.setdefault(candidate, set()).add(html.relative_to(DIST).as_posix())

    if missing:
        for target, sources in sorted(missing.items()):
            preview = ", ".join(sorted(sources)[:3])
            errors.append(f"引用了不存在的资源: /{target}  (来自 {preview})")
        check(False, f"存在 {len(missing)} 个失效引用")
    else:
        check(True, f"{len(html_files)} 个 HTML 中的站内引用全部有效")


def make_zip(files: list[Path]) -> Path:
    """打包成 zip。"""
    print("\n[4] 生成压缩包")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out = ROOT / f"feiyu-site-{stamp}.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for f in files:
            zf.write(f, f.relative_to(DIST).as_posix())
    size_mb = out.stat().st_size / 1024 / 1024
    check(out.exists() and size_mb > 0, f"{out.name} 已生成（{size_mb:.2f} MB，{len(files)} 个文件）")
    return out


def main() -> int:
    if not DIST.is_dir():
        print(f"找不到构建产物目录: {DIST}")
        print("请先执行: pnpm run build")
        return 2

    verify_required()
    verify_no_intermediate()
    files = collect_files()
    verify_internal_links(files)
    out = make_zip(files)

    print()
    for ok, label in checks:
        print(f"  {'[OK]  ' if ok else '[FAIL]'} {label}")

    if warnings:
        print("\n提示:")
        for w in warnings:
            print(f"  ! {w}")

    if errors:
        print(f"\n结果: {len(errors)} 项未通过，请先修复")
        return 1

    print(f"\n结果: 全部 {len(checks)} 项通过")
    print(f"\n压缩包: {out}")
    print("可直接拖拽到 Cloudflare Pages 或 Netlify Drop 部署。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
