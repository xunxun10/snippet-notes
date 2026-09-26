# -*- coding: utf-8 -*-
# 生成“文件模式(MD 编辑器)”图标: 独立绘制, 不复用笔记底图
# 同时由主图标底图 snippet-notes.png 生成主图标 snippet-notes.ico
# 产物规格一致: png 256x256 / ico 单尺寸 256x256
# 用法: python res/img/gen_file_icon.py   (在仓库根目录执行, 需 Python3 + Pillow)

import os
from PIL import Image, ImageDraw, ImageFont

# ===================== 可调参数 =====================
BASE_PNG   = os.path.join(os.path.dirname(__file__), 'snippet-notes.png')        # 主图标底图
OUT_PNG    = os.path.join(os.path.dirname(__file__), 'snippet-notes-file.png')   # 输出png
OUT_ICO    = os.path.join(os.path.dirname(__file__), 'snippet-notes-file.ico')   # 输出ico
OUT_ICO_MAIN = os.path.join(os.path.dirname(__file__), 'snippet-notes.ico')      # 主图标ico(由底图直接生成)

SIZE       = 256               # 输出尺寸(与主图标一致)
SS         = 4                 # 超采样倍数(先大图绘制再缩小, 边缘更平滑)

CORNER     = 56                # 圆角半径(约边长22%, 与系统方块图标观感一致)
BG_COLOR   = (23, 80, 90)      # 底色: 深青(与主图标同色系, 但构图完全独立)
RIM_COLOR  = (78, 192, 208)    # 内描边: 亮青(呼应主图标边缘色)
RIM_WIDTH  = 5                 # 内描边宽度
RIM_INSET  = 3                 # 内描边距外边缘距离

TEXT       = 'MD'
TEXT_COLOR = (255, 255, 255)   # MD文字: 白色
TEXT_W_RATIO = 0.70            # MD文字宽度占图标边长比例(尽量大, 保证小尺寸可读)
TEXT_H_RATIO = 0.42            # MD文字高度上限比例

MARK_STYLE = 'frame'           # 装饰样式: 'underline' 下方横线 / 'frame' 环绕框 / 'none' 纯文字

# --- MARK_STYLE = 'underline' ---
LINE_COLOR    = (232, 118, 44) # 横线颜色: 橙色
LINE_H_RATIO  = 0.05           # 横线粗细比例
LINE_GAP_RATIO = 0.075         # 横线与文字底部间距比例

# --- MARK_STYLE = 'frame' ---
FRAME_COLOR       = (240, 180, 130)  # 框线颜色: 淡橙(降低饱和度, 避免与外描边抢视觉)
FRAME_PAD_X_RATIO   = 0.1            # 框与文字之间的左右留白比例(框体贴合文字, 形状随文字成横向长方形)
FRAME_PAD_Y_RATIO   = 0.16           # 框与文字之间的上下留白比例(调大=框更高)
FRAME_RADIUS_RATIO = 0.075           # 框圆角半径比例(上限约0.1, 再大趋近胶囊形)
FRAME_WIDTH_RATIO = 0.028            # 框线粗细比例
FRAME_TEXT_W_RATIO = 0.52            # 框内文字宽度比例

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

def fit_font(draw, text, max_w, max_h):
    # 按比例迭代缩放字号, 直到文字宽高都不超过上限
    px = max_w * 2
    for _ in range(24):
        font = load_font(px)
        bbox = draw.textbbox((0, 0), text, font=font)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        if w <= max_w and h <= max_h:
            return font, bbox, w, h
        px = max(8, int(px * min(max_w / w, max_h / h) * 0.96))
    return font, bbox, w, h

def build_file_icon(style=None):
    style = style or MARK_STYLE
    S = SIZE * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 圆角方块底
    radius = CORNER * SS
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=radius, fill=BG_COLOR + (255,))

    # 内描边(青色)
    inset = RIM_INSET * SS
    d.rounded_rectangle((inset, inset, S - 1 - inset, S - 1 - inset),
                        radius=radius - inset, outline=RIM_COLOR + (255,),
                        width=RIM_WIDTH * SS)

    max_h = int(S * TEXT_H_RATIO)

    if style == 'frame':
        # 环绕框: 框体贴合文字字形外框(横向长方形), 文字与框整体居中
        font, bbox, tw, th = fit_font(d, TEXT, int(S * FRAME_TEXT_W_RATIO), max_h)

        pad_x = S * FRAME_PAD_X_RATIO
        pad_y = S * FRAME_PAD_Y_RATIO
        x1 = (S - tw) / 2 - pad_x
        y1 = S / 2 - th / 2 - pad_y
        x2 = x1 + tw + pad_x * 2
        y2 = y1 + th + pad_y * 2
        d.rounded_rectangle((x1, y1, x2, y2),
                            radius=int(S * FRAME_RADIUS_RATIO),
                            outline=FRAME_COLOR + (255,),
                            width=int(S * FRAME_WIDTH_RATIO))

        d.text(((S - tw) / 2 - bbox[0], S / 2 - th / 2 - bbox[1]),
               TEXT, font=font, fill=TEXT_COLOR + (255,))

    elif style == 'underline':
        # 下方横线: 文字+横线作为整体垂直居中, 横线宽度与文字等宽
        font, bbox, tw, th = fit_font(d, TEXT, int(S * TEXT_W_RATIO), max_h)
        line_h = int(S * LINE_H_RATIO)
        gap = int(S * LINE_GAP_RATIO)
        top = S / 2 - (th + gap + line_h) / 2

        d.text(((S - tw) / 2 - bbox[0], top - bbox[1]), TEXT, font=font,
               fill=TEXT_COLOR + (255,))

        lx = (S - tw) / 2
        ly = top + th + gap
        d.rounded_rectangle((lx, ly, lx + tw, ly + line_h),
                            radius=line_h / 2, fill=LINE_COLOR + (255,))

    else:
        # 纯文字
        font, bbox, tw, th = fit_font(d, TEXT, int(S * TEXT_W_RATIO), max_h)
        d.text(((S - tw) / 2 - bbox[0], S / 2 - th / 2 - bbox[1]),
               TEXT, font=font, fill=TEXT_COLOR + (255,))

    return img.resize((SIZE, SIZE), Image.LANCZOS)

def main():
    out = build_file_icon()
    out.save(OUT_PNG)
    # 单尺寸ico, 与现有 snippet-notes.ico 规格一致
    out.save(OUT_ICO, sizes=[(SIZE, SIZE)])

    # 主图标ico: 由底图直接生成(不带改动), 与主图标png保持一致
    base = Image.open(BASE_PNG).convert('RGBA')
    if base.size != (SIZE, SIZE):
        base = base.resize((SIZE, SIZE), Image.LANCZOS)
    base.save(OUT_ICO_MAIN, sizes=[(SIZE, SIZE)])
    print('generated:', OUT_PNG, OUT_ICO, OUT_ICO_MAIN)

if __name__ == '__main__':
    main()