from PIL import Image
import os

# Quantumult X 推荐的标准图标尺寸
TARGET_SIZE = 144

# 遍历当前目录下所有 png 文件
for filename in os.listdir("."):
    if filename.endswith(".png"):
        try:
            # 打开图片并转换为 RGBA (带透明通道)
            img = Image.open(filename).convert("RGBA")
            w, h = img.size
            
            # 计算缩放比例，让国旗最长的一边占据正方形的 75%（留出合适的边距，更好看）
            max_dim = max(w, h)
            scale = (TARGET_SIZE * 0.75) / max_dim
            new_w, new_h = int(w * scale), int(h * scale)
            
            # 缩放国旗图片
            img_resized = img.resize((new_w, new_h), Image.LANCZOS)
            
            # 创建一个 144x144 的全透明正方形画布
            new_img = Image.new("RGBA", (TARGET_SIZE, TARGET_SIZE), (255, 255, 255, 0))
            
            # 计算将国旗贴在正中心的坐标
            paste_x = (TARGET_SIZE - new_w) // 2
            paste_y = (TARGET_SIZE - new_h) // 2
            
            # 将国旗贴到透明画布上
            new_img.paste(img_resized, (paste_x, paste_y), img_resized)
            
            # 覆盖保存原文件
            new_img.save(filename)
            print(f"✅ 转换成功: {filename}")
            
        except Exception as e:
            print(f"❌ 转换失败: {filename}, 错误: {e}")

print("🎉 全部图标已处理为圈 X 标准尺寸！")
