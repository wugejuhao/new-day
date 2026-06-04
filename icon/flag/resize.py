from PIL import Image, ImageDraw
import os

TARGET_SIZE = 144
# 定义圆角的半径，这里设置为 28 像素，使其具有明显的圆角效果，但又不会太圆。
# 可以根据喜好调整这个值，推荐在 TARGET_SIZE 的 1/10 到 1/4 之间。
RADIUS = 28

# 遍历当前目录下所有 png 文件
for filename in os.listdir("."):
    if filename.endswith(".png"):
        try:
            # 打开图片并转换为 RGBA (带透明通道)
            img = Image.open(filename).convert("RGBA")
            
            # 1. 自动裁掉现有的多余透明边框，找回真实国旗图片
            bbox = img.getbbox()
            if bbox:
                img = img.crop(bbox)
            
            w, h = img.size
            
            # 2. 核心修复：这次不再缩水，让最长边 100% 撑满 144 像素！
            max_dim = max(w, h)
            scale = TARGET_SIZE / max_dim
            new_w, new_h = int(w * scale), int(h * scale)
            
            # 缩放国旗图片
            img_resized = img.resize((new_w, new_h), Image.LANCZOS)
            
            # 3. 核心修复：创建一个 144x144 的全透明正方形画布
            new_img = Image.new("RGBA", (TARGET_SIZE, TARGET_SIZE), (255, 255, 255, 0))
            
            # 计算将国旗贴在正中心的坐标
            paste_x = (TARGET_SIZE - new_w) // 2
            paste_y = (TARGET_SIZE - new_h) // 2
            
            # 将放大后的国旗贴到透明画布上
            new_img.paste(img_resized, (paste_x, paste_y), img_resized)

            # 4. 核心修复：应用圆角遮罩到整个画布
            # 创建一个用于生成遮罩的、大小一致的画布
            mask = Image.new("L", (TARGET_SIZE, TARGET_SIZE), 0)
            draw = ImageDraw.Draw(mask)
            # 在遮罩画布上绘制一个指定半径的白底圆角矩形
            draw.rounded_rectangle((0, 0, TARGET_SIZE, TARGET_SIZE), radius=RADIUS, fill=255)
            
            # 将圆角遮罩应用到 new_img
            # 此时 new_img 的 alpha 通道将只在 mask 的白色区域（圆角内）保留，其余（圆角外）变为完全透明
            final_img = Image.composite(new_img, Image.new("RGBA", (TARGET_SIZE, TARGET_SIZE), (0, 0, 0, 0)), mask)

            # 覆盖保存原文件
            final_img.save(filename)
            print(f"✅ 处理成功: {filename} (放大 + 满屏 + 圆角)")
            
        except Exception as e:
            print(f"❌ 处理失败: {filename}, 错误: {e}")

print("🎉 图标已全部放大至 100% 饱满尺寸，并已全部应用圆角！")
