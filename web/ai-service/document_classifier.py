from __future__ import annotations

import os
import re
import zlib
from dataclasses import dataclass, field
from typing import Dict, List


PDF_TEXT_MIN_LENGTH = 160


@dataclass
class DocumentProfile:
    source_type: str
    report_kind: str
    page_count: int = 1
    extracted_text: str = ""
    text_length: int = 0
    sections: Dict[str, str] = field(default_factory=dict)


def classify_document(file_path: str) -> DocumentProfile:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        embedded_text = extract_embedded_pdf_text(file_path)
        page_count = count_pdf_pages(file_path)
        source_type = "digital_pdf" if looks_like_digital_pdf(embedded_text) else "scanned_pdf"
        report_kind = detect_report_kind(embedded_text)
        return DocumentProfile(
            source_type=source_type,
            report_kind=report_kind,
            page_count=page_count,
            extracted_text=embedded_text,
            text_length=len(embedded_text.strip()),
            sections=extract_sections(embedded_text, report_kind),
        )

    return DocumentProfile(
        source_type="mobile_photo",
        report_kind="unknown",
        page_count=1,
        extracted_text="",
        text_length=0,
        sections={},
    )


def reclassify_with_text(profile: DocumentProfile, text: str) -> DocumentProfile:
    merged_text = (text or "").strip()
    report_kind = detect_report_kind(merged_text)
    if report_kind == "unknown":
        report_kind = profile.report_kind

    return DocumentProfile(
        source_type=profile.source_type,
        report_kind=report_kind,
        page_count=profile.page_count,
        extracted_text=profile.extracted_text or merged_text,
        text_length=max(profile.text_length, len(merged_text)),
        sections=extract_sections(merged_text or profile.extracted_text, report_kind),
    )


def looks_like_digital_pdf(text: str) -> bool:
    normalized = normalize_text(text)
    if len(normalized) < PDF_TEXT_MIN_LENGTH:
        return False

    visible_chars = sum(1 for char in normalized if char.isalnum() or "\u4e00" <= char <= "\u9fff")
    return visible_chars / max(len(normalized), 1) > 0.45


def count_pdf_pages(file_path: str) -> int:
    try:
        with open(file_path, "rb") as handle:
            raw = handle.read().decode("latin-1", errors="ignore")
        matches = re.findall(r"/Type\s*/Page\b", raw)
        return max(len(matches), 1)
    except Exception:
        return 1


def detect_report_kind(text: str) -> str:
    normalized = normalize_text(text)
    if not normalized:
        return "unknown"

    imaging_keywords = (
        "影像所见",
        "检查所见",
        "影像诊断",
        "诊断意见",
        "印象",
        "ct",
        "mr",
        "mri",
        "超声",
        "彩超",
        "x线",
        "肺结节",
        "结节",
        "斑块",
    )
    summary_keywords = (
        "总检结论",
        "总结建议",
        "健康建议",
        "总评",
        "综合意见",
        "异常结果汇总",
        "复查建议",
        "健康管理建议",
    )
    lab_keywords = (
        "参考范围",
        "检验结果",
        "项目名称",
        "单位",
        "mmol/l",
        "mg/dl",
        "umol/l",
        "μmol/l",
        "u/l",
        "白细胞",
        "红细胞",
        "谷丙转氨酶",
        "空腹血糖",
        "甘油三酯",
        "胆固醇",
        "肌酐",
    )

    imaging_score = sum(1 for keyword in imaging_keywords if keyword in normalized)
    summary_score = sum(1 for keyword in summary_keywords if keyword in normalized)
    lab_score = sum(1 for keyword in lab_keywords if keyword in normalized)

    if imaging_score >= max(summary_score, lab_score, 1):
        return "imaging_report"
    if summary_score >= max(imaging_score, lab_score, 1):
        return "summary_report"
    if lab_score > 0:
        return "lab_report"

    if any(keyword in normalized for keyword in ("报告", "体检", "检查", "医院", "诊断")):
        return "summary_report"

    return "non_report"


def extract_sections(text: str, report_kind: str) -> Dict[str, str]:
    normalized = normalize_text(text)
    if not normalized:
        return {}

    sections: Dict[str, str] = {
        "header": normalized[:500],
    }

    if report_kind == "imaging_report":
        sections["conclusion"] = first_matching_block(
            normalized,
            ("印象", "影像诊断", "诊断意见", "结论", "建议"),
        )
    elif report_kind == "summary_report":
        sections["conclusion"] = first_matching_block(
            normalized,
            ("总检结论", "总结建议", "综合意见", "健康建议", "复查建议"),
        )
    else:
        sections["tablePreview"] = normalized[:2000]

    return {key: value for key, value in sections.items() if value}


def first_matching_block(text: str, anchors: tuple[str, ...]) -> str:
    for anchor in anchors:
        index = text.find(anchor)
        if index == -1:
            continue
        snippet = text[index : index + 320]
        return snippet.strip()
    return text[:320].strip()


def extract_embedded_pdf_text(file_path: str) -> str:
    text = extract_with_python_pdf_readers(file_path)
    if text.strip():
        return normalize_text(text)

    return normalize_text(extract_from_pdf_streams(file_path))


def extract_with_python_pdf_readers(file_path: str) -> str:
    for module_name in ("pypdf", "PyPDF2"):
        try:
            module = __import__(module_name)
            reader_cls = getattr(module, "PdfReader", None)
            if reader_cls is None:
                continue
            reader = reader_cls(file_path)
            pages: List[str] = []
            for page in reader.pages:
                page_text = page.extract_text() or ""
                if page_text.strip():
                    pages.append(page_text)
            if pages:
                return "\n".join(pages)
        except Exception:
            continue
    return ""


def extract_from_pdf_streams(file_path: str) -> str:
    try:
        with open(file_path, "rb") as handle:
            raw = handle.read()
    except Exception:
        return ""

    texts: List[str] = []
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", raw, re.DOTALL):
        stream = match.group(1)
        prefix = raw[max(0, match.start() - 160) : match.start()]
        payload = stream
        if b"FlateDecode" in prefix:
            try:
                payload = zlib.decompress(stream)
            except Exception:
                payload = stream

        decoded = payload.decode("latin-1", errors="ignore")
        texts.extend(extract_pdf_string_literals(decoded))

    if texts:
        return "\n".join(texts)

    decoded_raw = raw.decode("latin-1", errors="ignore")
    candidates = re.findall(r"[\u4e00-\u9fffA-Za-z0-9%./()\-]{6,}", decoded_raw)
    return "\n".join(candidates[:400])


def extract_pdf_string_literals(content: str) -> List[str]:
    values: List[str] = []

    for match in re.finditer(r"\((.*?)\)\s*Tj", content, re.DOTALL):
        value = decode_pdf_literal(match.group(1))
        if len(value.strip()) >= 2:
            values.append(value)

    for match in re.finditer(r"\[(.*?)\]\s*TJ", content, re.DOTALL):
        chunks = re.findall(r"\((.*?)\)", match.group(1), re.DOTALL)
        value = decode_pdf_literal("".join(chunks))
        if len(value.strip()) >= 2:
            values.append(value)

    return values


def decode_pdf_literal(value: str) -> str:
    decoded = value
    replacements = {
        r"\(": "(",
        r"\)": ")",
        r"\n": "\n",
        r"\r": "\n",
        r"\t": "\t",
        r"\/": "/",
        r"\\": "\\",
    }
    for source, target in replacements.items():
        decoded = decoded.replace(source, target)
    decoded = re.sub(r"\\([0-7]{3})", lambda match: chr(int(match.group(1), 8)), decoded)
    return decoded


def normalize_text(text: str) -> str:
    normalized = text.replace("\x00", " ")
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\n{2,}", "\n", normalized)
    return normalized.strip()
