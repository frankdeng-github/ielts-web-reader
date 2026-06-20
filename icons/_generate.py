"""生成 chrome 扩展的 3 个尺寸 PNG 图标 (深底 + 黄色 IWR 字样)"""
from PIL import Image, ImageDraw, ImageFont

SIZES = [16, 48, 128]
OUT_DIR = "/home/frank/ielts-must-pass/extensions/web-reader/icons"


def get_font(size):
    """找一个能渲染 ASCII 的字体"""
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except Exception:
            pass
    return ImageFont.load_default()


def render(size):
    img = Image.new("RGBA", (size, size), (26, 26, 26, 255))
    d = ImageDraw.Draw(img)
    # 黄圆点
    pad = max(1, size // 8)
    d.ellipse([pad, pad, size - pad, size - pad], fill=(255, 217, 102, 255))
    # 字
    if size >= 48:
        text = "IWR"
        font = get_font(int(size * 0.30))
        bbox = d.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        d.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1]),
               text, fill=(26, 26, 26, 255), font=font)
    else:
        # 16px 只放一个点
        cx, cy = size // 2, size // 2
        d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=(26, 26, 26, 255))
    return img


def main():
    import os
    os.makedirs(OUT_DIR, exist_ok=True)
    for s in SIZES:
        img = render(s)
        path = f"{OUT_DIR}/icon-{s}.png"
        img.save(path)
        print(f"✅ {path}  ({s}x{s})")


if __name__ == "__main__":
    main()