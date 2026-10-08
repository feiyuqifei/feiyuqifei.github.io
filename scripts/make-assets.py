"""
生成站点所需的位图资源：
  - public/apple-touch-icon.png  180x180，iOS 添加到主屏时用
  - public/og-default.png        1200x630，社交平台分享卡片的默认图

为什么不直接手绘 SVG 然后导出：这两张图需要真实位图格式
（OG 图基本不支持 SVG），用 Pillow 直接画比调外部工具更可控。

字体说明：Windows 自带 msyh.ttc（微软雅黑）与 simhei.ttf（黑体）。
脚本会依次尝试，找不到就退回 Pillow 默认位图字体，保证不崩。
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PUBLIC = Path(__file__).resolve().parent.parent / "public"

BG_TOP = (15, 32, 39)      # #0f2027
BG_BOTTOM = (18, 59, 69)   # #123b45
ACCENT = (45, 212, 191)    # #2dd4bf
ACCENT_DIM = (30, 140, 130)
TEXT = (230, 237, 245)     # #e6edf5
TEXT_MUTED = (151, 165, 182)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """按优先级找一个可用的中文字体。"""
    candidates = [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def gradient(size: tuple[int, int]) -> Image.Image:
    """生成从左上到右下的线性渐变背景。"""
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    assert px is not None
    for y in range(h):
        for x in range(w):
            # 对角线插值，观感比垂直渐变更有方向感
            t = (x / max(w - 1, 1) + y / max(h - 1, 1)) / 2
            px[x, y] = (
                int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t),
                int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t),
                int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t),
            )
    return img


def draw_fish(
    d: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    scale: float,
    color: tuple[int, int, int] = ACCENT,
    width: int = 5,
) -> None:
    """
    画飞鱼标志：一条跃起的弧线 + 背鳍 + 尾鳍 + 水波。
    用二次贝塞尔采样成折线，避免依赖额外绘图库。
    """
    def quad(p0, p1, p2, steps=40):
        pts = []
        for i in range(steps + 1):
            t = i / steps
            x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t**2 * p2[0]
            y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t**2 * p2[1]
            pts.append((cx + x * scale, cy + y * scale))
        return pts

    # 身体：一段向上的弧（下缘反向拼回，形成闭合轮廓）
    lower = list(reversed(quad((1.0, -0.30), (0.45, -0.05), (-0.15, 0.30))[:-1]))
    d.line(
        quad((-1.0, 0.25), (-0.1, -0.72), (1.0, -0.30)) + lower,
        fill=color,
        width=width,
        joint="curve",
    )
    # 背鳍
    d.line(quad((-0.25, -0.45), (-0.05, -1.15), (0.30, -0.85)), fill=color, width=width, joint="curve")
    # 尾鳍
    d.line(quad((-1.0, 0.25), (-1.35, -0.05), (-1.25, -0.55)), fill=color, width=width, joint="curve")
    # 眼睛
    r = max(2, int(4 * scale * 0.22))
    d.ellipse((cx + 0.6 * scale - r, cy - 0.30 * scale - r, cx + 0.6 * scale + r, cy - 0.30 * scale + r), fill=color)
    # 水波
    wave = []
    for i in range(121):
        x = -1.5 + 3.0 * i / 120
        wave.append((cx + x * scale, cy + 0.78 * scale + math.sin(i / 120 * 4 * math.pi) * 0.1 * scale))
    d.line(wave, fill=ACCENT_DIM, width=max(2, width - 1), joint="curve")


def make_apple_touch_icon() -> None:
    size = 180
    img = gradient((size, size))
    d = ImageDraw.Draw(img)
    draw_fish(d, size / 2, size * 0.52, size * 0.28, width=7)
    out = PUBLIC / "apple-touch-icon.png"
    img.save(out, "PNG", optimize=True)
    print(f"  [OK] {out.name}  {out.stat().st_size / 1024:.1f} KB")


def make_og_default() -> None:
    w, h = 1200, 630
    img = gradient((w, h))
    d = ImageDraw.Draw(img)

    # 左侧飞鱼标志
    draw_fish(d, 190, h / 2, 78, width=9)

    # 右侧文案
    f_title = load_font(96, bold=True)
    f_tag = load_font(40)
    f_sub = load_font(30)

    d.text((360, 196), "飞鱼", font=f_title, fill=TEXT)
    d.text((360, 320), "FEIYU", font=f_sub, fill=ACCENT)

    # 分隔线
    d.line([(362, 372), (762, 372)], fill=ACCENT_DIM, width=3)

    d.text((360, 396), "潜得够深，才能跃出水面。", font=f_tag, fill=TEXT)
    d.text((360, 462), "安全 · 硬件 · 工具", font=f_sub, fill=TEXT_MUTED)

    out = PUBLIC / "og-default.png"
    img.save(out, "PNG", optimize=True)
    print(f"  [OK] {out.name}  {out.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    PUBLIC.mkdir(parents=True, exist_ok=True)
    print("生成站点位图资源：")
    make_apple_touch_icon()
    make_og_default()
    print("完成。")
