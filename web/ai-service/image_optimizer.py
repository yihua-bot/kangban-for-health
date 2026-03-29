"""
图片预处理优化模块
针对体检报告图片进行优化，提高视觉模型识别准确率
"""

import os
import logging
from PIL import Image, ImageEnhance, ImageFilter
import cv2
import numpy as np
from typing import Tuple, Optional

_logger = logging.getLogger("image-optimizer")


class ImageOptimizer:
    """图片优化器"""

    def __init__(
        self,
        max_dimension: int = 2048,
        min_dimension: int = 800,
        target_dpi: int = 300,
        enhance_contrast: float = 1.3,
        enhance_sharpness: float = 1.2,
        denoise_strength: int = 10,
    ):
        """
        初始化图片优化器

        Args:
            max_dimension: 最大边长（像素）
            min_dimension: 最小边长（像素）
            target_dpi: 目标DPI
            enhance_contrast: 对比度增强系数（1.0=不变）
            enhance_sharpness: 锐化系数（1.0=不变）
            denoise_strength: 降噪强度（0-20，0=不降噪）
        """
        self.max_dimension = max_dimension
        self.min_dimension = min_dimension
        self.target_dpi = target_dpi
        self.enhance_contrast = enhance_contrast
        self.enhance_sharpness = enhance_sharpness
        self.denoise_strength = denoise_strength

    def optimize_for_vision_model(
        self, image_path: str, output_path: Optional[str] = None
    ) -> str:
        """
        优化图片以提高视觉模型识别率

        Args:
            image_path: 输入图片路径
            output_path: 输出图片路径（None则自动生成）

        Returns:
            优化后的图片路径
        """
        try:
            _logger.info(f"开始优化图片: {image_path}")

            # 读取图片
            img = Image.open(image_path)
            original_size = img.size
            original_mode = img.mode

            # 转换为RGB（如果是RGBA或其他格式）
            if img.mode != "RGB":
                _logger.info(f"转换图片模式: {img.mode} -> RGB")
                img = img.convert("RGB")

            # 1. 调整分辨率
            img = self._resize_image(img)

            # 2. 增强对比度
            if self.enhance_contrast != 1.0:
                img = self._enhance_contrast(img)

            # 3. 锐化
            if self.enhance_sharpness != 1.0:
                img = self._enhance_sharpness(img)

            # 4. 降噪（针对拍照的报告）
            if self.denoise_strength > 0:
                img = self._denoise_image(img)

            # 5. 自动调整亮度（如果图片太暗或太亮）
            img = self._auto_adjust_brightness(img)

            # 6. 去除边缘空白
            img = self._remove_borders(img)

            # 生成输出路径
            if output_path is None:
                base, ext = os.path.splitext(image_path)
                output_path = f"{base}_optimized{ext}"

            # 保存优化后的图片
            img.save(output_path, quality=95, dpi=(self.target_dpi, self.target_dpi))

            _logger.info(
                f"图片优化完成: {original_size} -> {img.size}, "
                f"模式: {original_mode} -> {img.mode}, "
                f"输出: {output_path}"
            )

            return output_path

        except Exception as e:
            _logger.error(f"图片优化失败: {str(e)}")
            # 优化失败则返回原图
            return image_path

    def _resize_image(self, img: Image.Image) -> Image.Image:
        """调整图片分辨率"""
        width, height = img.size
        max_dim = max(width, height)
        min_dim = min(width, height)

        # 如果图片太大，缩小
        if max_dim > self.max_dimension:
            ratio = self.max_dimension / max_dim
            new_size = (int(width * ratio), int(height * ratio))
            _logger.info(f"缩小图片: {img.size} -> {new_size}")
            return img.resize(new_size, Image.Resampling.LANCZOS)

        # 如果图片太小，放大
        elif min_dim < self.min_dimension:
            ratio = self.min_dimension / min_dim
            new_size = (int(width * ratio), int(height * ratio))
            _logger.info(f"放大图片: {img.size} -> {new_size}")
            return img.resize(new_size, Image.Resampling.LANCZOS)

        return img

    def _enhance_contrast(self, img: Image.Image) -> Image.Image:
        """增强对比度"""
        enhancer = ImageEnhance.Contrast(img)
        return enhancer.enhance(self.enhance_contrast)

    def _enhance_sharpness(self, img: Image.Image) -> Image.Image:
        """锐化图片"""
        enhancer = ImageEnhance.Sharpness(img)
        return enhancer.enhance(self.enhance_sharpness)

    def _denoise_image(self, img: Image.Image) -> Image.Image:
        """降噪处理"""
        try:
            # 转换为numpy数组
            img_array = np.array(img)

            # 使用OpenCV的非局部均值降噪
            denoised = cv2.fastNlMeansDenoisingColored(
                img_array,
                None,
                h=self.denoise_strength,
                hColor=self.denoise_strength,
                templateWindowSize=7,
                searchWindowSize=21,
            )

            return Image.fromarray(denoised)
        except Exception as e:
            _logger.warning(f"降噪失败: {str(e)}")
            return img

    def _auto_adjust_brightness(self, img: Image.Image) -> Image.Image:
        """自动调整亮度"""
        try:
            # 转换为numpy数组
            img_array = np.array(img)

            # 计算平均亮度
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            avg_brightness = np.mean(gray)

            # 目标亮度（中等偏亮）
            target_brightness = 140

            # 如果亮度偏离目标较多，进行调整
            if abs(avg_brightness - target_brightness) > 30:
                factor = target_brightness / avg_brightness
                # 限制调整范围
                factor = max(0.7, min(factor, 1.5))

                enhancer = ImageEnhance.Brightness(img)
                img = enhancer.enhance(factor)
                _logger.info(
                    f"调整亮度: {avg_brightness:.1f} -> {target_brightness} (factor={factor:.2f})"
                )

            return img
        except Exception as e:
            _logger.warning(f"亮度调整失败: {str(e)}")
            return img

    def _remove_borders(self, img: Image.Image) -> Image.Image:
        """去除图片边缘的空白区域"""
        try:
            # 转换为numpy数组
            img_array = np.array(img)

            # 转换为灰度图
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)

            # 二值化
            _, binary = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)

            # 查找轮廓
            contours, _ = cv2.findContours(
                binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )

            if contours:
                # 找到最大的轮廓
                largest_contour = max(contours, key=cv2.contourArea)
                x, y, w, h = cv2.boundingRect(largest_contour)

                # 添加一些边距
                margin = 10
                x = max(0, x - margin)
                y = max(0, y - margin)
                w = min(img_array.shape[1] - x, w + 2 * margin)
                h = min(img_array.shape[0] - y, h + 2 * margin)

                # 裁剪
                cropped = img_array[y : y + h, x : x + w]

                # 只有裁剪掉的部分超过5%才应用
                original_area = img_array.shape[0] * img_array.shape[1]
                cropped_area = cropped.shape[0] * cropped.shape[1]
                if cropped_area / original_area > 0.95:
                    return img

                _logger.info(f"裁剪边缘: {img.size} -> {(w, h)}")
                return Image.fromarray(cropped)

            return img
        except Exception as e:
            _logger.warning(f"边缘裁剪失败: {str(e)}")
            return img

    def optimize_for_header_extraction(self, image_path: str) -> str:
        """
        专门优化页眉区域（用于提取患者信息）

        Args:
            image_path: 输入图片路径

        Returns:
            优化后的页眉图片路径
        """
        try:
            img = Image.open(image_path)

            # 只保留顶部20%的区域
            width, height = img.size
            header_height = int(height * 0.2)
            header_img = img.crop((0, 0, width, header_height))

            # 放大3倍
            new_size = (width * 3, header_height * 3)
            header_img = header_img.resize(new_size, Image.Resampling.LANCZOS)

            # 转换为灰度
            if header_img.mode != "L":
                header_img = header_img.convert("L")

            # 转换为numpy数组
            img_array = np.array(header_img)

            # 强力降噪
            denoised = cv2.fastNlMeansDenoising(img_array, None, 14, 7, 21)

            # 锐化
            kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
            sharpened = cv2.filter2D(denoised, -1, kernel)

            # 自适应二值化
            binary = cv2.adaptiveThreshold(
                sharpened, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
            )

            # 保存
            base, ext = os.path.splitext(image_path)
            output_path = f"{base}_header_optimized{ext}"
            cv2.imwrite(output_path, binary)

            _logger.info(f"页眉优化完成: {output_path}")
            return output_path

        except Exception as e:
            _logger.error(f"页眉优化失败: {str(e)}")
            return image_path


# 全局实例
default_optimizer = ImageOptimizer()


def optimize_image(image_path: str, output_path: Optional[str] = None) -> str:
    """便捷函数：使用默认配置优化图片"""
    return default_optimizer.optimize_for_vision_model(image_path, output_path)


def optimize_header_image(image_path: str) -> str:
    """便捷函数：优化页眉区域"""
    return default_optimizer.optimize_for_header_extraction(image_path)
