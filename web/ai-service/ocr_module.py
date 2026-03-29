"""
OCR模块 - 体检报告文字识别
支持图片和PDF格式
"""

import pytesseract
from PIL import Image
import cv2
import numpy as np
import re
from typing import Dict, List, Optional
import os


class ReportOCR:
    """体检报告OCR识别器"""

    def __init__(self):
        # 配置tesseract路径（如果需要）
        # pytesseract.pytesseract.tesseract_cmd = '/usr/local/bin/tesseract'
        pass

    def preprocess_image(self, image: Image.Image) -> Image.Image:
        """图像预处理，提高OCR准确率"""
        # 转换为OpenCV格式
        img_array = np.array(image)

        # 转换为灰度图
        if len(img_array.shape) == 3:
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
        else:
            gray = img_array

        # 去噪
        denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)

        # 二值化
        _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # 转回PIL Image
        return Image.fromarray(binary)

    def preprocess_header_image(self, image: Image.Image) -> Image.Image:
        """针对页眉身份字段做更激进的放大和增强"""
        enlarged = image.resize((int(image.width * 3), int(image.height * 3)))
        img_array = np.array(enlarged)
        if len(img_array.shape) == 3:
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
        else:
            gray = img_array

        denoised = cv2.fastNlMeansDenoising(gray, None, 14, 7, 21)
        sharpened = cv2.GaussianBlur(denoised, (0, 0), 3)
        sharpened = cv2.addWeighted(denoised, 1.8, sharpened, -0.8, 0)
        _, binary = cv2.threshold(sharpened, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return Image.fromarray(binary)

    def extract_text(self, image_path: str) -> str:
        """从图片中提取文字"""
        try:
            # 打开图片
            image = Image.open(image_path)

            # 预处理
            processed_image = self.preprocess_image(image)

            # OCR识别（支持中英文）
            text = pytesseract.image_to_string(
                processed_image,
                lang='chi_sim+eng',
                config='--psm 6'  # 假设文本块统一
            )

            return text
        except Exception as e:
            print(f"OCR识别失败: {str(e)}")
            return ""

    def extract_from_pdf(self, pdf_path: str) -> str:
        """从PDF中提取文字"""
        try:
            from pdf2image import convert_from_path

            # 转换PDF为图片
            images = convert_from_path(pdf_path, dpi=300)

            # 对每一页进行OCR
            all_text = []
            for i, image in enumerate(images):
                print(f"处理第 {i+1}/{len(images)} 页...")

                # 预处理
                processed_image = self.preprocess_image(image)

                # OCR识别
                text = pytesseract.image_to_string(
                    processed_image,
                    lang='chi_sim+eng',
                    config='--psm 6'
                )
                all_text.append(text)

            return "\n\n".join(all_text)
        except Exception as e:
            print(f"PDF OCR识别失败: {str(e)}")
            return ""

    def extract_header_text_from_image(self, image: Image.Image) -> str:
        """只提取页眉区域文字，用于姓名/医院/体检日期等身份字段补全"""
        width, height = image.size
        crop_ratios = (0.24, 0.34, 0.46, 0.58)
        psm_modes = ('--psm 4', '--psm 6', '--psm 11')
        lines: List[str] = []

        for ratio in crop_ratios:
            header_height = max(int(height * ratio), 1)
            header = image.crop((0, 0, width, header_height))
            processed_image = self.preprocess_header_image(header)
            for psm in psm_modes:
                text = pytesseract.image_to_string(
                    processed_image,
                    lang='chi_sim+eng',
                    config=psm,
                )
                for raw_line in text.splitlines():
                    line = raw_line.strip()
                    if not line or len(line) < 2:
                        continue
                    if line not in lines:
                        lines.append(line)

        return '\n'.join(lines)

    def extract_identity_fields(self, text: str) -> Dict:
        normalized_text = self._normalize_text(text)
        return {
            "patientName": self._extract_patient_name(normalized_text),
            "patientAge": self._extract_patient_age(normalized_text),
            "patientSex": self._extract_patient_sex(normalized_text),
            "reportDate": self._extract_date(normalized_text),
            "hospital": self._extract_hospital(normalized_text),
            "reportType": self._extract_report_type(normalized_text),
            "rawText": normalized_text,
        }

    def parse_medical_report(self, text: str) -> Dict:
        """解析体检报告文本，提取结构化数据"""
        normalized_text = self._normalize_text(text)
        result = {
            "reportDate": self._extract_date(normalized_text),
            "hospital": self._extract_hospital(normalized_text),
            "reportType": self._extract_report_type(normalized_text),
            "patientName": self._extract_patient_name(normalized_text),
            "patientAge": self._extract_patient_age(normalized_text),
            "patientSex": self._extract_patient_sex(normalized_text),
            "items": self._extract_test_items(normalized_text),
            "rawText": normalized_text,
        }
        return result

    def _normalize_text(self, text: str) -> str:
        """规范化OCR文本，减少全角字符和分隔符噪音"""
        replacements = {
            '：': ':',
            '（': '(',
            '）': ')',
            '／': '/',
            '－': '-',
            '—': '-',
            '～': '~',
            '，': ',',
            '。': '.',
            '|': ' ',
        }

        normalized = text
        for source, target in replacements.items():
            normalized = normalized.replace(source, target)

        normalized = re.sub(r'[ \t]+', ' ', normalized)
        normalized = re.sub(r'\n{2,}', '\n', normalized)
        return normalized

    def _extract_date(self, text: str) -> Optional[str]:
        """提取报告日期"""
        # 匹配日期格式: YYYY-MM-DD, YYYY年MM月DD日, YYYY/MM/DD
        patterns = [
            r'(\d{4})-(\d{1,2})-(\d{1,2})',
            r'(\d{4})年(\d{1,2})月(\d{1,2})日',
            r'(\d{4})/(\d{1,2})/(\d{1,2})',
        ]

        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                year, month, day = match.groups()
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"

        return None

    def _extract_hospital(self, text: str) -> Optional[str]:
        """提取医院名称"""
        # 匹配医院名称
        patterns = [
            r'([\u4e00-\u9fa5A-Za-z0-9]{2,40}(?:医院|医疗中心|卫生院|诊所))',
            r'([\u4e00-\u9fa5]+(?:医院|医疗中心|卫生院|诊所))',
            r'(?:医院|就诊机构|体检机构)[：:]?\s*([\u4e00-\u9fa5A-Za-z0-9]{2,40})',
        ]

        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1).strip()

        return None

    def _extract_report_type(self, text: str) -> str:
        """提取报告类型"""
        if '年度体检' in text or '健康体检' in text:
            return '年度体检'
        elif '专项检查' in text:
            return '专项检查'
        elif '复查' in text:
            return '复查'
        else:
            return '常规检查'

    def _extract_patient_name(self, text: str) -> Optional[str]:
        patterns = [
            r'(?:姓名|受检者|患者|名字)[:：]\s*([\u4e00-\u9fa5A-Za-z·]{2,20})',
            r'(?:姓名|受检者|患者|名字)\s+([\u4e00-\u9fa5A-Za-z·]{2,20})',
            r'(?:姓名|受检者|患者|名字)([\u4e00-\u9fa5A-Za-z·]{2,20})',
        ]

        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1).strip()
        return None

    def _extract_patient_age(self, text: str) -> Optional[int]:
        patterns = [
            r'(?:年龄|岁)[:：]?\s*(\d{1,3})',
            r'(?:年龄)\s+(\d{1,3})',
            r'(\d{1,3})\s*岁',
        ]

        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                value = int(match.group(1))
                if 0 < value < 120:
                    return value
        return None

    def _extract_patient_sex(self, text: str) -> Optional[str]:
        patterns = [
            r'(?:性别)[:：]?\s*(男|女)',
            r'(?:性别)\s+(男|女)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1).strip()
        return None

    def _extract_test_items(self, text: str) -> List[Dict]:
        """提取检测项目和结果"""
        items = []
        item_configs = [
            {"aliases": ['收缩压', '高压'], "name": '收缩压', "unit": 'mmHg'},
            {"aliases": ['舒张压', '低压'], "name": '舒张压', "unit": 'mmHg'},
            {"aliases": ['空腹血糖', '葡萄糖', '血糖'], "name": '空腹血糖', "unit": 'mmol/L'},
            {"aliases": ['餐后2小时血糖', '餐后血糖', '餐后'], "name": '餐后血糖', "unit": 'mmol/L'},
            {"aliases": ['糖化血红蛋白', 'HbA1c'], "name": '糖化血红蛋白', "unit": '%'},
            {"aliases": ['总胆固醇'], "name": '总胆固醇', "unit": 'mmol/L'},
            {"aliases": ['甘油三酯'], "name": '甘油三酯', "unit": 'mmol/L'},
            {"aliases": ['低密度脂蛋白', 'LDL'], "name": '低密度脂蛋白', "unit": 'mmol/L'},
            {"aliases": ['高密度脂蛋白', 'HDL'], "name": '高密度脂蛋白', "unit": 'mmol/L'},
            {"aliases": ['谷丙转氨酶', 'ALT'], "name": '谷丙转氨酶', "unit": 'U/L'},
            {"aliases": ['谷草转氨酶', 'AST'], "name": '谷草转氨酶', "unit": 'U/L'},
            {"aliases": ['肌酐'], "name": '肌酐', "unit": 'μmol/L'},
            {"aliases": ['尿酸'], "name": '尿酸', "unit": 'μmol/L'},
            {"aliases": ['尿素氮'], "name": '尿素氮', "unit": 'mmol/L'},
        ]

        seen_names = set()
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        for line in lines:
            item = self._extract_item_from_line(line, item_configs)
            if not item:
                continue
            if item['name'] in seen_names:
                continue
            items.append(item)
            seen_names.add(item['name'])

        if len(items) >= 2:
            return items

        inline_text = " ".join(lines)
        for config in item_configs:
            if config['name'] in seen_names:
                continue
            item = self._extract_item_from_block(inline_text, config)
            if not item:
                continue
            items.append(item)
            seen_names.add(item['name'])

        if not items:
            print("警告: 未能从文本中提取到检测项目")
            return []

        return items

    def _extract_item_from_line(self, line: str, item_configs: List[Dict]) -> Optional[Dict]:
        for config in item_configs:
            if not any(alias in line for alias in config['aliases']):
                continue

            reference_match = re.search(r'(\d+\.?\d*)\s*[-~]\s*(\d+\.?\d*)', line)
            numbers = re.findall(r'\d+\.?\d*', line)
            if not numbers:
                return None

            ref_min = None
            ref_max = None
            if reference_match:
                ref_min, ref_max = reference_match.groups()

            value = None
            for number in numbers:
                if ref_min and ref_max and number in {ref_min, ref_max}:
                    continue
                value = number
                break

            if not value:
                return None

            if not ref_min or not ref_max:
                if len(numbers) >= 3:
                    value = numbers[0]
                    ref_min = numbers[1]
                    ref_max = numbers[2]
                else:
                    continue

            return {
                'name': config['name'],
                'value': value,
                'unit': self._extract_unit(line, config['unit']),
                'reference': f"{ref_min}-{ref_max}",
            }

        return None

    def _extract_item_from_block(self, text: str, config: Dict) -> Optional[Dict]:
        alias_pattern = "|".join(re.escape(alias) for alias in config['aliases'])
        pattern = rf'({alias_pattern})[\s:]*([0-9]+\.?[0-9]*)[^0-9]{{0,20}}([0-9]+\.?[0-9]*)\s*[-~]\s*([0-9]+\.?[0-9]*)'
        match = re.search(pattern, text)
        if not match:
            return None

        _, value, ref_min, ref_max = match.groups()
        return {
            'name': config['name'],
            'value': value,
            'unit': config['unit'],
            'reference': f"{ref_min}-{ref_max}",
        }

    def _extract_unit(self, line: str, default_unit: str) -> str:
        unit_patterns = ['mmHg', 'mmol/L', 'μmol/L', 'umol/L', 'U/L', '%']
        for unit in unit_patterns:
            if unit in line:
                return unit.replace('umol/L', 'μmol/L')
        return default_unit

def process_report_file(file_path: str) -> Dict:
    """处理体检报告文件（图片或PDF）"""
    ocr = ReportOCR()

    # 判断文件类型
    file_ext = os.path.splitext(file_path)[1].lower()

    if file_ext == '.pdf':
        # PDF文件
        text = ocr.extract_from_pdf(file_path)
    elif file_ext in ['.jpg', '.jpeg', '.png', '.bmp']:
        # 图片文件
        text = ocr.extract_text(file_path)
    else:
        raise ValueError(f"不支持的文件格式: {file_ext}")

    # 解析文本
    result = ocr.parse_medical_report(text)

    return result


def parse_report_text(text: str) -> Dict:
    """Parse already extracted report text without running OCR again."""
    ocr = ReportOCR()
    return ocr.parse_medical_report(text)


def process_identity_from_file(file_path: str) -> Dict:
    """仅提取报告头部身份字段"""
    ocr = ReportOCR()
    file_ext = os.path.splitext(file_path)[1].lower()

    try:
        if file_ext == '.pdf':
            from pdf2image import convert_from_path

            images = convert_from_path(file_path, dpi=320, first_page=1, last_page=1)
            image = images[0]
        elif file_ext in ['.jpg', '.jpeg', '.png', '.bmp']:
            image = Image.open(file_path)
        else:
            raise ValueError(f"不支持的文件格式: {file_ext}")

        text = ocr.extract_header_text_from_image(image)
        return ocr.extract_identity_fields(text)
    except Exception as e:
        print(f"身份字段OCR识别失败: {str(e)}")
        return {
            "patientName": None,
            "patientAge": None,
            "patientSex": None,
            "reportDate": None,
            "hospital": None,
            "reportType": None,
            "rawText": "",
        }
