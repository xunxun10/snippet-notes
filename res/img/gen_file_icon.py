# -*- coding: utf-8 -*-
# 生成文件模式图标：基于主图标 snippet-note.png 右下角叠加 "MD" 角标
# 产物规格与现有主图标一致：png 256x256 / ico 单尺寸 256x256
# 用法: python res/img/gen_file_icon.py   (在仓库根目录执行, 需 Python3 + Pillow)

import os
from PIL import Image, ImageDraw, ImageFont

# ===================== 可调参数 =====================
BASE_PNG   = os.path.join(os.path.dirname(__file__), 'snippet-note.png')        # 底图
OUT_PNG    = os.path.join(os.path.dirname(__file__), 'snippet-note-file.png')   # 输出png
OUT_ICO    = os.path.join(os.path.dirname(__file__), 'snippet-note-file.ico')   # 输出ico
SIZE       = 256               # 输出尺寸(与现有主图标一致)
BADGE_SIZE = 0.36              # 角标占底图边长比例(调小更精致)
BADGE_POS  = 'right-bottom'    # 角标位置
BADGE_MARGIN = 0.05            # 角标与图标边缘的间距比例
BADGE_COLOR = (232, 118, 44)   # 角标底色(橙色系, 与主图标青灰蓝区分)
BADGE_ALPHA = 235              # 角标底不透明度(0-255)
TEXT_COLOR = (255, 255, 255)   # MD文字颜色(白色)
BADGE_TEXT = 'MD'
FONTS      = [                 # 粗体字体候选(按顺序回退)
    r'C:\Windows\Fonts\arialbd.ttf',
    r'C:\Windows\Fonts\segoeuib.ttf',
    r'C:\Windows\Fonts\arial.ttf',
]
# ===================================================

def load_font(px):
    for p in FONTS:
        if os.path.exists(p):
            return ImageFont.truetype(p, px)
    return ImageFont.load_default()

def rounded_rect(draw, box, radius, fill):
    # Pillow rounded_rectangle 兼容处理(老版本无此方法)
    try:
        draw.rounded_rectangle(box, radius=radius, fill=fill)
    except AttributeError:
        draw.rectangle(box, fill=fill)

def main():
    base = Image.open(BASE_PNG).convert('RGBA')
    if base.size != (SIZE, SIZE):
        base = base.resize((SIZE, SIZE), Image.LANCZOS)

    # 角标图层(独立绘制后合成, 便于控制透明度)
    badge_len = int(SIZE * BADGE_SIZE)
    badge = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(badge)

    # 角标圆角矩形底: 右下角, 与边缘留出间距更精致
    margin = int(SIZE * BADGE_MARGIN)
    x2, y2 = SIZE - margin, SIZE - margin
    x1, y1 = x2 - badge_len, y2 - badge_len
    radius = int(badge_len * 0.26)
    rounded_rect(bdraw, (x1, y1, x2, y2), radius,
                 BADGE_COLOR + (BADGE_ALPHA,))

    # MD 文字: 居中, 尽量占满角标
    text_px = int(badge_len * 0.52)
    for _ in range(20):
        font = load_font(text_px)
        bbox = bdraw.textbbox((0, 0), BADGE_TEXT, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        if tw <= badge_len * 0.82 and th <= badge_len * 0.72:
            break
        text_px -= 2
    tx = x1 + (badge_len - tw) / 2 - bbox[0]
    ty = y1 + (badge_len - th) / 2 - bbox[1]
    bdraw.text((tx, ty), BADGE_TEXT, font=font, fill=TEXT_COLOR + (255,))

    # 合成
    out = Image.alpha_composite(base, badge)
    out.save(OUT_PNG)
    # 单尺寸ico, 与现有 snippet-note.ico 规格一致
    out.save(OUT_ICO, sizes=[(SIZE, SIZE)])
    print('generated:', OUT_PNG, OUT_ICO)

if __name__ == '__main__':
    main()
