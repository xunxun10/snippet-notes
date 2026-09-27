# -*- coding: utf-8 -*-
# 图标生成:
#   snippet-notes.png      -> snippet-notes.ico      (主图标, 由底图缩放)
#   snippet-notes-file.png -> snippet-notes-file.ico (文件模式/MD 编辑器图标, 各尺寸由本脚本现画)
# 默认只写 ico; 加 --new 时额外重绘 snippet-notes-file.png(即 256 那张)
# 产物规格: png 256x256 / ico 内嵌 16~256 多尺寸, 每尺寸单独绘制(小尺寸自动简化), 圆角不糊不断裂
# 用法: python res/img/gen_file_icon.py [--new]   (在仓库根目录执行, 需 Python3 + Pillow)

import os
import sys
from PIL import Image, ImageDraw, ImageFont

# ===================== 可调参数 =====================
BASE_PNG   = os.path.join(os.path.dirname(__file__), 'snippet-notes.png')        # 主图标底图
OUT_PNG    = os.path.join(os.path.dirname(__file__), 'snippet-notes-file.png')   # 输出png
OUT_ICO    = os.path.join(os.path.dirname(__file__), 'snippet-notes-file.ico')   # 输出ico
OUT_ICO_MAIN = os.path.join(os.path.dirname(__file__), 'snippet-notes.ico')      # 主图标ico(由底图直接生成)

SIZE       = 256               # 输出尺寸(与主图标一致)
SS         = 4                 # 超采样倍数(先大图绘制再缩小, 边缘更平滑)
ICO_SIZES  = [16, 24, 32, 48, 64, 128, 256]   # ico 内嵌尺寸(内置真实像素, 免系统缩放出毛边)
SMALL_SIZE = 32                # <= 此尺寸不画青色内描边(不足 1px, 会糊成灰雾; 大尺寸保留)
NO_FRAME_SIZE = 24             # <= 此尺寸连橙色框也不画(框会挤掉文字空间, 不如放大纯文字清晰)

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

def build_file_icon(style=None, size=SIZE):
    # size: 目标边长(各 ico 尺寸单独绘制, 而非从 256 缩下来)
    style = style or MARK_STYLE
    if style == 'frame' and size <= NO_FRAME_SIZE:
        style = 'none'         # 小尺寸改为放大纯文字
    S = size * SS
    k = S / SIZE               # 相对基准尺寸(256)的缩放系数
    small = size <= SMALL_SIZE
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 圆角方块底
    radius = CORNER * k
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=radius, fill=BG_COLOR + (255,))

    if not small:
        # 内描边(青色); 小尺寸下不足 1px, 会糊成灰雾, 直接省略
        inset = RIM_INSET * k
        d.rounded_rectangle((inset, inset, S - 1 - inset, S - 1 - inset),
                            radius=radius - inset, outline=RIM_COLOR + (255,),
                            width=max(1, round(RIM_WIDTH * k)))

    # 框线粗细: 至少 1px, 否则小尺寸下不可见
    frame_w = max(1, round(FRAME_WIDTH_RATIO * size)) * SS
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
                            width=frame_w)

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

    return resize_rgba(img, size)

def resize_rgba(img, size):
    # 走预乘 alpha 模式(RGBa)缩放: 否则透明区域的黑色会混入边缘, 小尺寸圆角出现深色毛边/断裂
    img = img.convert('RGBA')
    if img.size == (size, size):
        return img.copy()
    return img.convert('RGBa').resize((size, size), Image.LANCZOS).convert('RGBA')

def open_square(path):
    img = Image.open(path).convert('RGBA')
    return img if img.size == (SIZE, SIZE) else resize_rgba(img, SIZE)

def save_ico(frames, ico_path):
    # frames: 与 ICO_SIZES 一一对应的图像, 作为真实帧写入, 由系统直接取用不再临时缩放
    frames = [f.convert('RGBA') for f in frames]
    frames[-1].save(ico_path, format='ICO',
                    sizes=[(s, s) for s in ICO_SIZES], append_images=frames[:-1])
    return ico_path

def shrink_all(src):
    # 由单张 256 源图缩放得到全部 ico 帧
    return [resize_rgba(src, s) for s in ICO_SIZES]

def main():
    new = '--new' in sys.argv[1:]

    # 文件模式图标: 每个尺寸单独绘制(小尺寸自动简化), 256 那张同时作为 png 导出
    frames = [build_file_icon(size=s) for s in ICO_SIZES]
    if new:
        frames[-1].save(OUT_PNG)
    save_ico(frames, OUT_ICO)

    # 主图标ico: 由底图直接生成(不带改动), 与主图标png保持一致
    save_ico(shrink_all(open_square(BASE_PNG)), OUT_ICO_MAIN)
    print('generated:', OUT_ICO, OUT_ICO_MAIN, '(png redrawn)' if new else '')

if __name__ == '__main__':
    main()