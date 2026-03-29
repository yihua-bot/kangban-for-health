"""
Health Guardian AI Service
体检报告OCR识别与健康分析服务
"""

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
_logger = logging.getLogger("ai-service")

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import tempfile
import os
import json
import base64
import io
import time
import asyncio
import re
import ssl
import urllib.request
from datetime import datetime
from pdf2image import convert_from_path
from PIL import Image
from ocr_module import process_identity_from_file, process_report_file, parse_report_text
from document_classifier import classify_document, reclassify_with_text
from medical_normalizer import normalize_analysis_payload

# ============================================
# 导入优化模块
# ============================================
try:
    from image_optimizer import ImageOptimizer
    from prompts import (
        build_vision_schema_prompt_v2,
        build_json_schema_prompt_v2,
        build_identity_schema_prompt_v2,
        build_identity_text_prompt_v2,
    )
    from validator import ResultValidator, RetryStrategy
    from hybrid_strategy import HybridParser, ParserMethod
    _optimization_enabled = True
    _logger.info("✅ 优化模块加载成功")
except ImportError as e:
    _optimization_enabled = False
    _logger.warning(f"⚠️ 优化模块未加载: {e}，将使用原有功能")

app = FastAPI(
    title="Health Guardian AI Service",
    description="体检报告OCR识别与健康分析服务",
    version="1.0.0",
)

# CORS配置：从环境变量读取允许的来源，默认只允许 localhost
_cors_origins_env = os.environ.get("CORS_ORIGINS", "")
_cors_origins = (
    [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
    if _cors_origins_env
    else [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
    ]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# 初始化优化模块
# ============================================
if _optimization_enabled:
    # 图片优化器
    image_optimizer = ImageOptimizer(
        max_dimension=2048,
        min_dimension=800,
        enhance_contrast=1.3,
        enhance_sharpness=1.2,
        denoise_strength=10,
    )

    # 结果验证器
    result_validator = ResultValidator(
        min_abnormalities=0,
        max_abnormalities=30,
        require_basic_info=False,
    )

    # 重试策略
    retry_strategy = RetryStrategy(
        max_retries=3,
        retry_delay=1.0,
    )

    # 混合解析器
    hybrid_parser = HybridParser(
        validator=result_validator,
        enable_parallel=True,
        enable_retry=True,
        max_retries=2,
        retry_delay=1.0,
    )

    _logger.info("✅ 优化模块初始化完成")
else:
    image_optimizer = None
    result_validator = None
    retry_strategy = None
    hybrid_parser = None

# ============================================
# 数据模型
# ============================================


class AbnormalityItem(BaseModel):
    """异常项"""

    itemName: str
    value: str
    unit: str
    referenceRange: str
    severity: str  # normal, mild, moderate, severe
    riskLevel: str  # low, medium, high, urgent
    category: str
    doctorAdvice: Optional[str] = None
    followUpRequired: bool
    followUpPeriod: Optional[int] = None  # 天数


class ReportAnalysisResult(BaseModel):
    """报告分析结果"""

    reportId: str
    reportDate: Optional[str] = None
    hospital: Optional[str] = None
    reportType: Optional[str] = None
    abnormalities: List[AbnormalityItem]
    aiSummary: str
    generatedTasks: List[dict]
    processedAt: str
    lowConfidence: bool = False
    rawItemsCount: int = 0
    textPreview: Optional[str] = None
    patientName: Optional[str] = None
    patientAge: Optional[int] = None
    patientSex: Optional[str] = None
    healthTags: List[str] = []
    reportHighlights: List[str] = []
    parserMode: str = "ocr"
    sourceType: Optional[str] = None
    reportKind: Optional[str] = None
    reviewRequired: bool = False
    pendingFields: List[str] = []
    fieldConfidences: Dict[str, float] = {}
    extractedSections: Dict[str, Any] = {}
    confidenceScore: Optional[float] = None


class HealthAdvice(BaseModel):
    """健康建议"""

    category: str
    priority: str
    title: str
    description: str
    actionItems: List[str]


def get_llm_config() -> Dict[str, str]:
    api_key = (os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY") or "").strip()
    base_url = (os.getenv("OPENAI_BASE_URL") or os.getenv("LLM_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
    model = (os.getenv("OPENAI_MODEL") or os.getenv("LLM_MODEL") or "gpt-4o-mini").strip()
    vision_model = (
        os.getenv("OPENAI_VISION_MODEL")
        or os.getenv("LLM_VISION_MODEL")
        or ""
    ).strip()
    return {
        "api_key": api_key,
        "base_url": base_url,
        "model": model,
        "vision_model": vision_model or model,
    }


def extract_json_content(content: Any) -> Optional[Dict[str, Any]]:
    if not content:
        return None

    if isinstance(content, list):
        content = "".join(
            item.get("text", "") for item in content if isinstance(item, dict)
        )

    text = str(content).strip()
    if not text:
        return None

    fence_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def post_chat_completion(
    *,
    base_url: str,
    api_key: str,
    payload: Dict[str, Any],
    timeout_seconds: float,
) -> Dict[str, Any]:
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    context = ssl.create_default_context()
    with urllib.request.urlopen(
        request,
        timeout=timeout_seconds,
        context=context,
    ) as response:
        body = response.read().decode()
        return json.loads(body)


def parse_int_safe(value: Any) -> Optional[int]:
    try:
        if value is None or value == "":
            return None
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def parse_bool_safe(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "y", "是"}


def normalize_severity(value: Any) -> str:
    mapping = {
        "normal": "normal",
        "low": "mild",
        "mild": "mild",
        "moderate": "moderate",
        "medium": "moderate",
        "high": "severe",
        "severe": "severe",
        "urgent": "severe",
    }
    return mapping.get(str(value or "").strip().lower(), "moderate")


def normalize_risk_level(value: Any) -> str:
    mapping = {
        "low": "low",
        "mild": "low",
        "medium": "medium",
        "moderate": "medium",
        "high": "high",
        "severe": "high",
        "urgent": "urgent",
    }
    return mapping.get(str(value or "").strip().lower(), "medium")


def infer_report_tags(abnormalities: List["AbnormalityItem"]) -> List[str]:
    tags = set()
    for item in abnormalities:
        if item.category == "血压":
            tags.add("高血压")
        elif item.category == "血糖":
            tags.add("血糖偏高")
        elif item.category == "血脂":
            tags.add("血脂异常")
        elif item.category == "肝功能":
            tags.add("肝功能异常")
        elif item.category == "肾功能":
            tags.add("肾功能异常")
    if any(item.followUpRequired for item in abnormalities):
        tags.add("待复查")
    return list(tags)


def build_json_schema_prompt(ocr_result: Dict[str, Any]) -> str:
    raw_text = ocr_result.get("rawText") or ""
    extracted_items = json.dumps(ocr_result.get("items") or [], ensure_ascii=False)
    return f"""
你是医疗体检报告结构化助手。请基于提供的 OCR 文本和候选指标，输出一个严格 JSON 对象，不要输出 Markdown，不要解释。

要求：
1. 只输出合法 JSON。
2. 字段必须包含：
- patientName: string | null
- patientAge: number | null
- patientSex: string | null
- reportDate: YYYY-MM-DD | null
- hospital: string | null
- reportType: string | null
- aiSummary: string
- healthTags: string[]
- reportHighlights: string[]
- abnormalities: Array<{{itemName, value, unit, referenceRange, severity, riskLevel, category, doctorAdvice, followUpRequired, followUpPeriod}}>
3. abnormalities 只保留异常或值得关注的项目；如果 OCR 提取不到，就根据全文推断能确认的异常项。
4. severity 只能是 normal/mild/moderate/severe。
5. riskLevel 只能是 low/medium/high/urgent。
6. category 优先使用：血压/血糖/血脂/肝功能/肾功能/肺部/心血管/尿常规/其他。
7. followUpPeriod 使用天数整数；没有就填 null。
8. aiSummary 必须适配家庭健康管理产品，要能直接用于“每天/健康”tab 展示。
9. 如果姓名、年龄、性别无法判断，返回 null，不要猜。

OCR全文：
{raw_text[:12000]}

候选指标：
{extracted_items[:4000]}
""".strip()


def build_vision_schema_prompt() -> str:
    return """
你是医疗体检报告结构化助手。请直接阅读上传的体检报告图片，输出一个严格 JSON 对象，不要输出 Markdown，不要解释。

字段必须包含：
- patientName: string | null
- patientAge: number | null
- patientSex: string | null
- reportDate: YYYY-MM-DD | null
- hospital: string | null
- reportType: string | null
- aiSummary: string
- healthTags: string[]
- reportHighlights: string[]
- abnormalities: Array<{
  itemName: string,
  value: string,
  unit: string,
  referenceRange: string,
  severity: "normal" | "mild" | "moderate" | "severe",
  riskLevel: "low" | "medium" | "high" | "urgent",
  category: string,
  doctorAdvice: string | null,
  followUpRequired: boolean,
  followUpPeriod: number | null
}>

要求：
1. 只输出合法 JSON。
2. 先优先阅读页眉/首页顶部区域，重点识别姓名、年龄、性别、医院、体检日期。
3. abnormalities 只保留异常或值得关注的项目。
4. category 优先使用：血压/血糖/血脂/肝功能/肾功能/肺部/心血管/尿常规/其他。
5. aiSummary 必须适合家庭健康管理产品直接展示，要简洁明确。
6. 如果看不清，就返回 null，不要猜。
7. 如果同一字段在多张图里出现冲突，优先采用页眉裁切图里的内容。
""".strip()


def build_identity_schema_prompt() -> str:
    return """
你是医疗体检报告身份信息提取助手。请只阅读体检报告页眉区域图片，输出一个严格 JSON 对象，不要输出 Markdown，不要解释。

字段必须包含：
- patientName: string | null
- patientAge: number | null
- patientSex: string | null
- reportDate: YYYY-MM-DD | null
- hospital: string | null
- reportType: string | null

要求：
1. 只输出合法 JSON。
2. 只能提取图片里明确出现的内容，不能猜，不能补全。
3. 不要根据化验值、参考范围、日期片段去推断年龄。
4. 如果不确定，返回 null。
""".strip()


def build_identity_text_prompt(header_text: str) -> str:
    return f"""
你是医疗体检报告身份信息提取助手。下面是一段从报告页眉区域 OCR 出来的原始文本，可能有错字、漏字、断行。请只根据这段文本输出一个严格 JSON 对象，不要输出 Markdown，不要解释。

字段必须包含：
- patientName: string | null
- patientAge: number | null
- patientSex: string | null
- reportDate: YYYY-MM-DD | null
- hospital: string | null
- reportType: string | null

要求：
1. 只输出合法 JSON。
2. 只能提取文本中明确出现的信息，不能猜。
3. 如果字段不确定，返回 null。
4. 不要根据检验值、参考范围去推断年龄或性别。

OCR页眉文本：
{header_text[:4000]}
""".strip()


def build_kind_aware_text_prompt(
    raw_text: str,
    candidate_items: List[Dict[str, Any]],
    report_kind: str,
    sections: Optional[Dict[str, str]] = None,
) -> str:
    sections = sections or {}
    extracted_items = json.dumps(candidate_items or [], ensure_ascii=False, indent=2)
    section_text = json.dumps(sections, ensure_ascii=False, indent=2)

    if report_kind == "imaging_report":
        instructions = """
你正在解析影像报告或器械检查报告。重点看“检查所见/影像所见/印象/结论/建议”。
1. abnormalities 中只保留需要关注的影像结论，如肺结节、斑块、囊肿、占位、钙化等。
2. 对叙述型结论，value 可以填“见结论”，unit/referenceRange 填“-”。
3. 如果报告整体正常，可以返回空 abnormalities，但 aiSummary 必须明确说明“未见明确异常”或“建议常规随访”。
4. followUpRequired 只在结论中出现“复查/随访/建议进一步检查”或存在明确异常时为 true。
"""
    elif report_kind == "summary_report":
        instructions = """
你正在解析体检总检结论/健康管理建议。重点看“总检结论/总结建议/综合意见/复查建议”。
1. abnormalities 中只保留总结中明确点名的异常或待复查项。
2. 如果总结里没有明确异常项，可以返回空 abnormalities，但 aiSummary 要准确概括风险和建议。
3. 不要凭空补化验值，不要把正常项目塞进 abnormalities。
"""
    elif report_kind == "non_report":
        instructions = """
这份文本可能不是有效体检报告。如果无法确认是报告，请返回空 abnormalities，并在 aiSummary 中明确说明“当前文件不像标准体检报告，建议人工确认”。
"""
    else:
        instructions = """
你正在解析检验类体检报告。优先根据候选指标和原文识别真正异常项。
1. abnormalities 只保留异常或值得关注的项目。
2. 数值、单位、参考范围尽量保持原文，不要猜。
3. 如果表格正常但结论有异常提示，也可以保留结论中的异常项。
"""

    return f"""
你是医疗体检报告结构化助手。请基于给定文本输出严格 JSON 对象，不要输出 Markdown，不要解释。

报告类型: {report_kind}

{instructions}

字段必须包含:
- patientName: string | null
- patientAge: number | null
- patientSex: string | null
- reportDate: YYYY-MM-DD | null
- hospital: string | null
- reportType: string | null
- aiSummary: string
- healthTags: string[]
- reportHighlights: string[]
- abnormalities: Array<{{
  itemName: string,
  value: string,
  unit: string,
  referenceRange: string,
  severity: "normal" | "mild" | "moderate" | "severe",
  riskLevel: "low" | "medium" | "high" | "urgent",
  category: string,
  doctorAdvice: string | null,
  followUpRequired: boolean,
  followUpPeriod: number | null
}}>

要求:
1. 只输出合法 JSON。
2. 看不清、看不全就返回 null，不要猜。
3. 若无明确异常，可返回空 abnormalities，但 aiSummary 必须说明原因。
4. category 优先使用：血压/血糖/血脂/肝功能/肾功能/肺部/心血管/尿常规/血常规/甲状腺/其他。

报告关键分段:
{section_text[:3000]}

OCR/文本全文:
{raw_text[:12000]}

候选指标:
{extracted_items[:4000]}
""".strip()


def image_file_to_data_url(path: str) -> str:
    mime_type = "image/png"
    ext = os.path.splitext(path)[1].lower()
    if ext in {".jpg", ".jpeg"}:
        mime_type = "image/jpeg"
    with open(path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime_type};base64,{encoded}"


def pil_image_to_data_url(image: Image.Image, format_name: str = "JPEG", quality: int = 90) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format=format_name, quality=quality)
    mime_type = "image/jpeg" if format_name.upper() == "JPEG" else "image/png"
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:{mime_type};base64,{encoded}"


def optimize_image_for_llm(
    image: Image.Image,
    *,
    max_dimension: int,
    quality: int,
) -> str:
    optimized = image.convert("RGB")
    width, height = optimized.size
    longest_edge = max(width, height)
    if longest_edge > max_dimension:
        scale = max_dimension / longest_edge
        optimized = optimized.resize(
            (max(int(width * scale), 1), max(int(height * scale), 1)),
            Image.Resampling.LANCZOS,
        )
    return pil_image_to_data_url(optimized, format_name="JPEG", quality=quality)


def build_header_crop(image: Image.Image) -> Image.Image:
    width, height = image.size
    header_bottom = max(int(height * 0.38), 1)
    header = image.crop((0, 0, width, header_bottom))
    enlarged = header.resize(
        (int(header.width * 1.6), int(header.height * 1.6)),
        Image.Resampling.LANCZOS,
    )
    return enlarged


def pdf_to_data_urls(path: str, max_pages: int = 5) -> List[str]:
    images = convert_from_path(path, dpi=160, first_page=1, last_page=max_pages)
    urls: List[str] = []
    for image in images:
        urls.append(
            optimize_image_for_llm(
                image,
                max_dimension=1400,
                quality=68,
            )
        )
    return urls


def pdf_to_header_data_urls(path: str, max_pages: int = 2) -> List[str]:
    images = convert_from_path(path, dpi=180, first_page=1, last_page=max_pages)
    urls: List[str] = []
    for image in images:
        urls.append(
            optimize_image_for_llm(
                build_header_crop(image),
                max_dimension=1200,
                quality=72,
            )
        )
    return urls


def image_to_header_data_url(path: str) -> str:
    image = Image.open(path)
    return optimize_image_for_llm(
        build_header_crop(image),
        max_dimension=1200,
        quality=72,
    )


def image_to_body_data_url(path: str) -> str:
    image = Image.open(path)
    return optimize_image_for_llm(
        image,
        max_dimension=1400,
        quality=68,
    )


def build_multimodal_content(file_path: str) -> List[Dict[str, Any]]:
    ext = os.path.splitext(file_path)[1].lower()
    content: List[Dict[str, Any]] = [
        {
            "type": "text",
            "text": build_vision_schema_prompt(),
        }
    ]
    if ext == ".pdf":
        for data_url in pdf_to_header_data_urls(file_path):
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": data_url},
                }
            )
        for data_url in pdf_to_data_urls(file_path):
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": data_url},
                }
            )
        return content

    content.append(
        {
            "type": "image_url",
            "image_url": {"url": image_to_header_data_url(file_path)},
        }
    )
    content.append(
        {
            "type": "image_url",
            "image_url": {"url": image_to_body_data_url(file_path)},
        }
    )
    return content


def build_identity_multimodal_content(file_path: str) -> List[Dict[str, Any]]:
    ext = os.path.splitext(file_path)[1].lower()
    content: List[Dict[str, Any]] = [
        {
            "type": "text",
            "text": build_identity_schema_prompt(),
        }
    ]
    if ext == ".pdf":
        for data_url in pdf_to_header_data_urls(file_path):
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": data_url},
                }
            )
        return content

    content.append(
        {
            "type": "image_url",
            "image_url": {"url": image_to_header_data_url(file_path)},
        }
    )
    return content


async def parse_report_text_with_llm(
    raw_text: str,
    candidate_items: Optional[List[Dict[str, Any]]] = None,
    report_kind: str = "lab_report",
    sections: Optional[Dict[str, str]] = None,
) -> Optional[Dict[str, Any]]:
    config = get_llm_config()
    if not config["api_key"]:
        return None

    payload = {
        "model": config["model"],
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "你只输出 JSON。你负责把体检报告文本解析成家庭健康管理产品可直接消费的结构化结果。",
            },
            {
                "role": "user",
                "content": build_kind_aware_text_prompt(
                    raw_text,
                    candidate_items or [],
                    report_kind,
                    sections,
                ),
            },
        ],
        "temperature": 0.2,
    }

    try:
        log_stage("text_llm.request", model=config["model"], timeoutSeconds=35)
        data = await asyncio.to_thread(
            post_chat_completion,
            base_url=config["base_url"],
            api_key=config["api_key"],
            payload=payload,
            timeout_seconds=35.0,
        )
        log_stage("text_llm.response", model=config["model"], statusCode=200)
        content = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        return extract_json_content(content)
    except Exception as exc:
        _logger.error("LLM结构化解析失败: %s", str(exc))
        return None


async def parse_report_with_llm(ocr_result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    return await parse_report_text_with_llm(
        ocr_result.get("rawText") or "",
        ocr_result.get("items") or [],
        "lab_report",
    )


async def parse_report_with_multimodal_llm(file_path: str) -> Optional[Dict[str, Any]]:
    """原有的视觉模型解析（保留兼容）"""
    config = get_llm_config()
    if not config["api_key"]:
        return None

    payload = {
        "model": config["vision_model"],
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "你只输出 JSON。你负责直接阅读体检报告图片并输出结构化结果。",
            },
            {
                "role": "user",
                "content": build_multimodal_content(file_path),
            },
        ],
        "temperature": 0.1,
    }

    try:
        log_stage("vision.primary.request", model=config["vision_model"], timeoutSeconds=45)
        data = await asyncio.to_thread(
            post_chat_completion,
            base_url=config["base_url"],
            api_key=config["api_key"],
            payload=payload,
            timeout_seconds=45.0,
        )
        log_stage("vision.primary.response", model=config["vision_model"], statusCode=200)
        content = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        parsed = extract_json_content(content)
        if not parsed:
            _logger.error("LLM多模态解析失败: invalid json content")
            return None
        return parsed
    except Exception as exc:
        _logger.error("LLM多模态解析失败: %s", str(exc))
        return None


async def parse_identity_with_multimodal_llm(file_path: str) -> Optional[Dict[str, Any]]:
    config = get_llm_config()
    if not config["api_key"]:
        return None

    payload = {
        "model": config["vision_model"],
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "你只输出 JSON。你只负责从报告页眉区域识别身份字段，不做推断。",
            },
            {
                "role": "user",
                "content": build_identity_multimodal_content(file_path),
            },
        ],
        "temperature": 0,
    }

    try:
        log_stage("identity.vision.request", model=config["vision_model"], timeoutSeconds=25)
        data = await asyncio.to_thread(
            post_chat_completion,
            base_url=config["base_url"],
            api_key=config["api_key"],
            payload=payload,
            timeout_seconds=25.0,
        )
        log_stage("identity.vision.response", model=config["vision_model"], statusCode=200)
        content = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        return extract_json_content(content)
    except Exception as exc:
        _logger.error("LLM身份字段解析失败: %s", str(exc))
        return None


async def parse_identity_from_text_with_llm(header_text: str) -> Optional[Dict[str, Any]]:
    config = get_llm_config()
    if not config["api_key"] or not header_text.strip():
        return None

    payload = {
        "model": config["model"],
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "你只输出 JSON。你负责把报告页眉 OCR 文本纠偏成身份字段。",
            },
            {
                "role": "user",
                "content": build_identity_text_prompt(header_text),
            },
        ],
        "temperature": 0,
    }

    try:
        log_stage("identity.text_llm.request", model=config["model"], timeoutSeconds=20)
        data = await asyncio.to_thread(
            post_chat_completion,
            base_url=config["base_url"],
            api_key=config["api_key"],
            payload=payload,
            timeout_seconds=20.0,
        )
        log_stage("identity.text_llm.response", model=config["model"], statusCode=200)
        content = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        return extract_json_content(content)
    except Exception as exc:
        _logger.error("LLM身份文本纠偏失败: %s", str(exc))
        return None


# ============================================
# 优化版本的解析函数
# ============================================

async def parse_report_with_multimodal_llm_v2(file_path: str) -> Optional[Dict[str, Any]]:
    """使用改进的 Prompt 解析报告（视觉模型 - 优化版）"""
    if not _optimization_enabled:
        return await parse_report_with_multimodal_llm(file_path)

    config = get_llm_config()
    if not config["api_key"]:
        return None

    # 优化图片
    _logger.info("优化图片...")
    optimized_path = image_optimizer.optimize_for_vision_model(file_path)

    payload = {
        "model": config["vision_model"],
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "你是专业的医疗体检报告分析专家。只输出 JSON，不要有任何额外文字。",
            },
            {
                "role": "user",
                "content": build_multimodal_content_v2(optimized_path),
            },
        ],
        "temperature": 0.1,
        "max_tokens": 4096,
    }

    try:
        log_stage("vision.v2.request", model=config["vision_model"], timeoutSeconds=60)
        data = await asyncio.to_thread(
            post_chat_completion,
            base_url=config["base_url"],
            api_key=config["api_key"],
            payload=payload,
            timeout_seconds=60.0,
        )
        log_stage("vision.v2.response", model=config["vision_model"], statusCode=200)

        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        parsed = extract_json_content(content)

        if not parsed:
            _logger.error("视觉模型返回的 JSON 无效")
            return None

        # 验证结果
        is_valid, score, issues = result_validator.validate(parsed)
        _logger.info(f"解析结果验证: 有效={is_valid}, 分数={score:.1f}")

        if issues:
            _logger.warning(f"发现 {len(issues)} 个问题: {issues[:3]}")

        return parsed

    except Exception as exc:
        _logger.error(f"视觉模型解析失败: {str(exc)}")
        return None


def build_multimodal_content_v2(file_path: str) -> List[Dict[str, Any]]:
    """构建多模态内容（使用改进的 Prompt）"""
    ext = os.path.splitext(file_path)[1].lower()
    content: List[Dict[str, Any]] = [
        {
            "type": "text",
            "text": build_vision_schema_prompt_v2(),  # 使用改进的 Prompt
        }
    ]

    if ext == ".pdf":
        for data_url in pdf_to_header_data_urls(file_path):
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": data_url},
                }
            )
        for data_url in pdf_to_data_urls(file_path):
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": data_url},
                }
            )
    else:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": image_to_header_data_url(file_path)},
            }
        )
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": image_to_data_url(file_path)},
            }
        )

    return content


async def parse_report_with_ocr_plus_llm_v2(file_path: str) -> Optional[Dict[str, Any]]:
    """OCR + 文本模型解析（优化版）"""
    if not _optimization_enabled:
        return None

    try:
        # 使用 OCR 提取文本
        ocr_result = process_report_file(file_path)
        if not ocr_result:
            return None

        config = get_llm_config()
        if not config["api_key"]:
            return None

        payload = {
            "model": config["model"],
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": "你是医疗体检报告结构化助手。只输出 JSON，不要有任何额外文字。",
                },
                {
                    "role": "user",
                    "content": build_json_schema_prompt_v2(ocr_result),
                },
            ],
            "temperature": 0.2,
            "max_tokens": 4096,
        }

        log_stage("text_llm.v2.request", model=config["model"], timeoutSeconds=35)
        data = await asyncio.to_thread(
            post_chat_completion,
            base_url=config["base_url"],
            api_key=config["api_key"],
            payload=payload,
            timeout_seconds=35.0,
        )
        log_stage("text_llm.v2.response", model=config["model"], statusCode=200)

        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        parsed = extract_json_content(content)

        if not parsed:
            _logger.error("文本模型返回的 JSON 无效")
            return None

        # 验证结果
        is_valid, score, issues = result_validator.validate(parsed)
        _logger.info(f"OCR+LLM 解析结果验证: 有效={is_valid}, 分数={score:.1f}")

        return parsed

    except Exception as exc:
        _logger.error(f"OCR+LLM 解析失败: {str(exc)}")
        return None


def merge_identity_fields(base: Dict[str, Any], identity: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not identity:
        return base

    merged = dict(base)
    for key in ("patientName", "patientAge", "patientSex", "reportDate", "hospital", "reportType"):
        value = identity.get(key)
        if value in (None, "", "未知医院"):
            continue
        merged[key] = value

    # 如果只有年龄被识别到，但姓名/性别/医院都为空，视为不可靠，直接清空
    if (
        merged.get("patientAge") is not None
        and not merged.get("patientName")
        and not merged.get("patientSex")
        and not merged.get("hospital")
    ):
        merged["patientAge"] = None

    return merged


def merge_identity_candidates(base: Dict[str, Any], *candidates: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    merged = dict(base)
    for candidate in candidates:
        merged = merge_identity_fields(merged, candidate)
    return merged


def has_core_identity_fields(data: Optional[Dict[str, Any]]) -> bool:
    if not data:
        return False
    return bool(
        data.get("patientName")
        and data.get("reportDate")
        and data.get("hospital")
    )


def normalize_llm_abnormality(item: Dict[str, Any]) -> Optional[AbnormalityItem]:
    item_name = str(item.get("itemName") or item.get("name") or "").strip()
    value = str(item.get("value") or "-").strip()
    unit = str(item.get("unit") or "-").strip()
    reference_range = str(item.get("referenceRange") or item.get("reference") or "-").strip()
    if not item_name:
        return None

    return AbnormalityItem(
        itemName=item_name,
        value=value or "-",
        unit=unit or "-",
        referenceRange=reference_range or "-",
        severity=normalize_severity(item.get("severity")),
        riskLevel=normalize_risk_level(item.get("riskLevel")),
        category=str(item.get("category") or "其他").strip() or "其他",
        doctorAdvice=(str(item.get("doctorAdvice")).strip() if item.get("doctorAdvice") else None),
        followUpRequired=parse_bool_safe(item.get("followUpRequired"), default=False),
        followUpPeriod=parse_int_safe(item.get("followUpPeriod")),
    )


def strengthen_ocr_result(ocr_result: dict) -> tuple[dict, bool]:
    """Keep low-confidence flagging, but never inject fabricated medical data."""
    raw_items = list(ocr_result.get("items") or [])
    raw_count = len(raw_items)
    strengthened = {
        **ocr_result,
        "rawItemsCount": raw_count,
    }
    return strengthened, raw_count < 3


def analyze_health_item(item: dict) -> AbnormalityItem:
    """分析单个健康指标"""
    name = item["name"]
    value = float(item["value"])
    ref_parts = item["reference"].split("-")
    ref_min = float(ref_parts[0])
    ref_max = float(ref_parts[1])

    # 判断是否异常
    is_abnormal = value < ref_min or value > ref_max

    # 确定严重程度
    if not is_abnormal:
        severity = "normal"
        risk_level = "low"
    else:
        deviation = max(abs(value - ref_min), abs(value - ref_max))
        relative_deviation = deviation / ((ref_max - ref_min) or 1)

        if relative_deviation < 0.1:
            severity = "mild"
            risk_level = "low"
        elif relative_deviation < 0.2:
            severity = "moderate"
            risk_level = "medium"
        else:
            severity = "severe"
            risk_level = "high"

    # 分类
    category_map = {
        "收缩压": "血压",
        "舒张压": "血压",
        "空腹血糖": "血糖",
        "餐后血糖": "血糖",
        "糖化血红蛋白": "血糖",
        "总胆固醇": "血脂",
        "甘油三酯": "血脂",
        "低密度脂蛋白": "血脂",
        "高密度脂蛋白": "血脂",
        "谷丙转氨酶": "肝功能",
        "谷草转氨酶": "肝功能",
        "肌酐": "肾功能",
        "尿酸": "肾功能",
        "尿素氮": "肾功能",
    }

    category = category_map.get(name, "其他")

    # 医生建议
    advice_map = {
        "血压": "建议连续7天早晚测量血压；若多次≥140/90，按医嘱调整用药。",
        "血糖": "建议控制饮食，1个月后复查空腹血糖和糖化血红蛋白。",
        "血脂": "建议低脂饮食，增加运动，3个月后复查。",
        "肝功能": "建议避免饮酒，规律作息，1个月后复查。",
        "肾功能": "建议多饮水，避免使用肾毒性药物，定期复查。",
    }

    doctor_advice = advice_map.get(category, "建议定期复查，关注变化趋势。")

    # 随访周期
    follow_up_map = {"severe": 7, "moderate": 30, "mild": 90, "normal": 365}

    return AbnormalityItem(
        itemName=name,
        value=item["value"],
        unit=item["unit"],
        referenceRange=item["reference"],
        severity=severity,
        riskLevel=risk_level,
        category=category,
        doctorAdvice=doctor_advice if is_abnormal else None,
        followUpRequired=is_abnormal,
        followUpPeriod=follow_up_map.get(severity, 90) if is_abnormal else None,
    )


def generate_tasks(abnormalities: List[AbnormalityItem]) -> List[dict]:
    """根据异常项生成跟进任务"""
    tasks = []

    for item in abnormalities:
        if item.severity == "normal":
            continue

        # 测量任务
        if item.category in ["血压", "血糖"]:
            tasks.append(
                {
                    "type": "measurement",
                    "title": f"测量{item.category}",
                    "description": f"记录{item.category}，观察变化趋势",
                    "recurrence": "daily",
                    "relatedItem": item.itemName,
                }
            )

        # 复查任务
        if item.followUpRequired:
            tasks.append(
                {
                    "type": "recheck",
                    "title": f"复查{item.itemName}",
                    "description": item.doctorAdvice or "按医生建议复查",
                    "dueDays": item.followUpPeriod,
                    "relatedItem": item.itemName,
                }
            )

        # 生活方式建议
        if item.category == "血压":
            tasks.append(
                {
                    "type": "lifestyle",
                    "title": "低盐饮食",
                    "description": "每日盐摄入量控制在6克以下",
                    "recurrence": "daily",
                }
            )
        elif item.category == "血糖":
            tasks.append(
                {
                    "type": "lifestyle",
                    "title": "低糖饮食",
                    "description": "控制碳水摄入，选择低GI食物",
                    "recurrence": "daily",
                }
            )

    return tasks


def generate_ai_summary(abnormalities: List[AbnormalityItem]) -> str:
    """生成AI健康总结"""
    abnormal_items = [item for item in abnormalities if item.severity != "normal"]

    if not abnormal_items:
        return "本次体检各项指标基本正常，建议继续保持健康的生活方式。"

    # 按类别分组
    categories = {}
    for item in abnormal_items:
        if item.category not in categories:
            categories[item.category] = []
        categories[item.category].append(item)

    summary_parts = []
    for category, items in categories.items():
        item_names = "、".join([item.itemName for item in items])
        severity_text = (
            "偏高" if items[0].severity in ["moderate", "severe"] else "轻度偏高"
        )
        summary_parts.append(f"{category}（{item_names}）{severity_text}")

    summary = "、".join(summary_parts)

    high_risk = [
        item for item in abnormal_items if item.riskLevel in ["high", "urgent"]
    ]
    if high_risk:
        summary += f"。其中{len(high_risk)}项需要重点关注，建议尽快就医咨询。"

    return summary


def build_text_preview(text: str) -> Optional[str]:
    normalized = " ".join((text or "").split())
    if not normalized:
        return None
    return normalized[:240]


def log_stage(stage: str, **kwargs: Any) -> None:
    details = " ".join(
        f"{key}={json.dumps(value, ensure_ascii=False)}" for key, value in kwargs.items()
    )
    if details:
        _logger.info("[parser] %s %s", stage, details)
    else:
        _logger.info("[parser] %s", stage)


def build_report_analysis_result(
    normalized_payload: Dict[str, Any],
    parser_mode: str,
    raw_items_count: int,
    extracted_text: str,
) -> ReportAnalysisResult:
    abnormalities: List[AbnormalityItem] = []
    for item in normalized_payload.get("abnormalities") or []:
        normalized_item = normalize_llm_abnormality(item)
        if normalized_item:
            abnormalities.append(normalized_item)

    ai_summary = normalized_payload.get("aiSummary") or generate_ai_summary(abnormalities)
    generated_tasks = generate_tasks(abnormalities)

    return ReportAnalysisResult(
        reportId=f"RPT-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        reportDate=normalized_payload.get("reportDate"),
        hospital=normalized_payload.get("hospital"),
        reportType=normalized_payload.get("reportType"),
        abnormalities=abnormalities,
        aiSummary=ai_summary,
        generatedTasks=generated_tasks,
        processedAt=datetime.now().isoformat(),
        lowConfidence=bool(normalized_payload.get("lowConfidence")),
        rawItemsCount=raw_items_count,
        textPreview=build_text_preview(extracted_text),
        patientName=normalized_payload.get("patientName"),
        patientAge=parse_int_safe(normalized_payload.get("patientAge")),
        patientSex=normalized_payload.get("patientSex"),
        healthTags=normalized_payload.get("healthTags") or infer_report_tags(abnormalities),
        reportHighlights=normalized_payload.get("reportHighlights") or [
            item.itemName for item in abnormalities[:3] if item.severity != "normal"
        ],
        parserMode=parser_mode,
        sourceType=normalized_payload.get("sourceType"),
        reportKind=normalized_payload.get("reportKind"),
        reviewRequired=bool(normalized_payload.get("reviewRequired")),
        pendingFields=list(normalized_payload.get("pendingFields") or []),
        fieldConfidences=dict(normalized_payload.get("fieldConfidences") or {}),
        extractedSections=dict(normalized_payload.get("extractedSections") or {}),
        confidenceScore=normalized_payload.get("confidenceScore"),
    )


async def run_layered_report_parser(
    file_path: str,
    *,
    prefer_v2: bool,
) -> ReportAnalysisResult:
    document_profile = classify_document(file_path)
    extracted_text = document_profile.extracted_text or ""
    raw_items_count = 0
    parser_mode = "layered"
    sections = dict(document_profile.sections or {})

    ocr_result: Dict[str, Any] = {}
    structured_result: Optional[Dict[str, Any]] = None

    if document_profile.source_type == "digital_pdf" and extracted_text.strip():
        ocr_result = parse_report_text(extracted_text)
        extracted_text = ocr_result.get("rawText") or extracted_text
        raw_items_count = len(ocr_result.get("items") or [])
        document_profile = reclassify_with_text(document_profile, extracted_text)
        sections = {**sections, **document_profile.sections}
        structured_result = await parse_report_text_with_llm(
            extracted_text,
            ocr_result.get("items") or [],
            document_profile.report_kind,
            sections,
        )
        identity_result = await parse_identity_from_text_with_llm(extracted_text)
        structured_result = merge_identity_candidates(
            structured_result or {},
            identity_result,
            ocr_result,
        )
        parser_mode = "digital_pdf_text"
    else:
        ocr_result = process_report_file(file_path)
        extracted_text = ocr_result.get("rawText") or extracted_text
        raw_items_count = len(ocr_result.get("items") or [])
        document_profile = reclassify_with_text(document_profile, extracted_text)
        sections = {**sections, **document_profile.sections}

        if document_profile.report_kind in {"imaging_report", "summary_report", "non_report"}:
            structured_result = await parse_report_text_with_llm(
                extracted_text,
                ocr_result.get("items") or [],
                document_profile.report_kind,
                sections,
            )
            parser_mode = f"{document_profile.report_kind}_text"
        else:
            hybrid_result = None
            if prefer_v2 and hybrid_parser:
                hybrid_result = await hybrid_parser.parse_with_hybrid_strategy(
                    file_path=file_path,
                    vision_parser=parse_report_with_multimodal_llm_v2,
                    ocr_parser=parse_report_with_ocr_plus_llm_v2,
                    fallback_data=None,
                )

            if hybrid_result and hybrid_result.is_success:
                structured_result = hybrid_result.data
                parser_mode = f"{hybrid_result.method.value}_v2"
            else:
                structured_result = await parse_report_text_with_llm(
                    extracted_text,
                    ocr_result.get("items") or [],
                    document_profile.report_kind,
                    sections,
                )
                parser_mode = "ocr_text"

        header_ocr_identity = process_identity_from_file(file_path)
        identity_text_result = await parse_identity_from_text_with_llm(
            header_ocr_identity.get("rawText") or extracted_text
        )
        structured_result = merge_identity_candidates(
            structured_result or {},
            identity_text_result,
            header_ocr_identity,
            ocr_result,
        )

    if not structured_result:
        structured_result = ocr_result

    if not structured_result and not extracted_text.strip():
        raise HTTPException(status_code=422, detail="未能从报告中提取到有效内容，请重新上传更清晰的文件")

    normalized_payload = normalize_analysis_payload(
        structured_result,
        source_type=document_profile.source_type,
        report_kind=document_profile.report_kind,
        extracted_text=extracted_text,
        sections=sections,
    )
    return build_report_analysis_result(
        normalized_payload,
        parser_mode,
        raw_items_count,
        extracted_text,
    )


# ============================================
# API 路由
# ============================================


@app.get("/")
async def root():
    """服务健康检查"""
    llm_config = get_llm_config()
    return {
        "service": "Health Guardian AI Service",
        "status": "running",
        "version": "1.0.0",
        "optimizationEnabled": _optimization_enabled,
        "llmConfigured": bool(llm_config["api_key"]),
    }


@app.post("/api/parse-report", response_model=ReportAnalysisResult)
async def parse_report(file: UploadFile = File(...)):
    """
    解析体检报告
    支持 JPG、PNG、PDF 格式

    参数:
    - file: 上传的报告文件
    """
    allowed_types = ["image/jpeg", "image/png", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="不支持的文件类型，请上传 JPG、PNG 或 PDF 格式的报告",
        )

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=os.path.splitext(file.filename)[1]
        ) as tmp:
            content = await file.read()
            if len(content) > 25 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="文件大小超过25MB限制")
            tmp.write(content)
            tmp_path = tmp.name

        request_started_at = time.perf_counter()
        log_stage(
            "request.start",
            filename=file.filename,
            contentType=file.content_type,
            size=len(content),
        )
        result = await run_layered_report_parser(
            tmp_path,
            prefer_v2=True,
        )
        log_stage(
            "request.success",
            parserMode=result.parserMode,
            elapsedMs=round((time.perf_counter() - request_started_at) * 1000, 1),
            abnormalityCount=len(result.abnormalities),
            reviewRequired=result.reviewRequired,
            sourceType=result.sourceType,
            reportKind=result.reportKind,
        )
        return result
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/api/analyze-health", response_model=List[HealthAdvice])
async def analyze_health(abnormalities: List[AbnormalityItem]):
    """
    根据异常项生成健康建议
    """
    advices = []

    # 血压相关建议
    bp_items = [
        item
        for item in abnormalities
        if item.category == "血压" and item.severity != "normal"
    ]
    if bp_items:
        advices.append(
            HealthAdvice(
                category="血压管理",
                priority="high"
                if any(item.riskLevel == "high" for item in bp_items)
                else "medium",
                title="控制血压",
                description="您的血压偏高，需要持续关注和管理",
                actionItems=[
                    "每天早晚测量血压并记录",
                    "按时服用降压药物",
                    "减少盐的摄入，每日不超过6克",
                    "保持规律运动，每周至少5次，每次30分钟",
                    "保持情绪稳定，避免过度紧张",
                ],
            )
        )

    # 血糖相关建议
    sugar_items = [
        item
        for item in abnormalities
        if item.category == "血糖" and item.severity != "normal"
    ]
    if sugar_items:
        advices.append(
            HealthAdvice(
                category="血糖管理",
                priority="high"
                if any(item.riskLevel == "high" for item in sugar_items)
                else "medium",
                title="控制血糖",
                description="您的血糖偏高，需要注意饮食和生活习惯",
                actionItems=[
                    "定期测量空腹血糖和餐后血糖",
                    "控制碳水化合物摄入，选择低GI食物",
                    "增加膳食纤维摄入，多吃蔬菜",
                    "餐后30分钟进行适度活动",
                    "定期复查糖化血红蛋白",
                ],
            )
        )

    # 血脂相关建议
    lipid_items = [
        item
        for item in abnormalities
        if item.category == "血脂" and item.severity != "normal"
    ]
    if lipid_items:
        advices.append(
            HealthAdvice(
                category="血脂管理",
                priority="medium",
                title="调节血脂",
                description="您的血脂指标需要关注",
                actionItems=[
                    "减少饱和脂肪和反式脂肪的摄入",
                    "增加富含Omega-3的食物（如深海鱼）",
                    "每周进行3-5次有氧运动",
                    "保持健康体重",
                    "3个月后复查血脂",
                ],
            )
        )

    return advices


@app.get("/api/reference-ranges")
async def get_reference_ranges():
    """获取常用指标参考范围"""
    return {
        "血压": {
            "收缩压": {"min": 90, "max": 140, "unit": "mmHg"},
            "舒张压": {"min": 60, "max": 90, "unit": "mmHg"},
        },
        "血糖": {
            "空腹血糖": {"min": 3.9, "max": 6.1, "unit": "mmol/L"},
            "餐后2小时血糖": {"min": 3.9, "max": 7.8, "unit": "mmol/L"},
            "糖化血红蛋白": {"min": 4.0, "max": 6.0, "unit": "%"},
        },
        "血脂": {
            "总胆固醇": {"min": 3.0, "max": 5.7, "unit": "mmol/L"},
            "甘油三酯": {"min": 0.5, "max": 1.7, "unit": "mmol/L"},
            "低密度脂蛋白": {"min": 0, "max": 3.4, "unit": "mmol/L"},
            "高密度脂蛋白": {"min": 1.0, "max": 1.9, "unit": "mmol/L"},
        },
        "肝功能": {
            "谷丙转氨酶": {"min": 0, "max": 40, "unit": "U/L"},
            "谷草转氨酶": {"min": 0, "max": 40, "unit": "U/L"},
        },
        "肾功能": {
            "肌酐": {"min": 44, "max": 133, "unit": "μmol/L"},
            "尿酸": {"min": 150, "max": 420, "unit": "μmol/L"},
            "尿素氮": {"min": 2.9, "max": 8.2, "unit": "mmol/L"},
        },
    }


@app.post("/api/parse-report-v2", response_model=ReportAnalysisResult)
async def parse_report_v2(file: UploadFile = File(...)):
    """
    解析体检报告 V2（优化版本）

    改进：
    1. 图片预处理优化
    2. 改进的 Prompt
    3. 结果验证
    4. 重试机制
    5. 混合策略
    """
    if not _optimization_enabled:
        _logger.warning("优化模块未启用，回退到分层解析")

    allowed_types = ["image/jpeg", "image/png", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="不支持的文件类型，请上传 JPG、PNG 或 PDF 格式的报告",
        )

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=os.path.splitext(file.filename)[1]
        ) as tmp:
            content = await file.read()
            if len(content) > 25 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="文件大小超过25MB限制")
            tmp.write(content)
            tmp_path = tmp.name

        _logger.info(f"开始解析报告 V2: {file.filename}")
        request_start = time.perf_counter()
        response_data = await run_layered_report_parser(
            tmp_path,
            prefer_v2=True,
        )
        elapsed_ms = (time.perf_counter() - request_start) * 1000
        _logger.info(
            "报告解析成功 V2: 方法=%s, 审核=%s, 异常项=%s, 耗时=%sms",
            response_data.parserMode,
            response_data.reviewRequired,
            len(response_data.abnormalities),
            round(elapsed_ms),
        )
        return response_data
    except HTTPException:
        raise
    except Exception as e:
        _logger.error(f"报告解析异常: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"服务器错误: {str(e)}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
                optimized_path = tmp_path.replace(".", "_optimized.")
                if os.path.exists(optimized_path):
                    os.unlink(optimized_path)
            except Exception:
                pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
