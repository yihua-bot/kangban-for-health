from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Tuple


ITEM_METADATA: Dict[str, Dict[str, Any]] = {
    "收缩压": {"category": "血压", "unit": "mmHg", "reference": "90-140"},
    "舒张压": {"category": "血压", "unit": "mmHg", "reference": "60-90"},
    "空腹血糖": {"category": "血糖", "unit": "mmol/L", "reference": "3.9-6.1"},
    "餐后血糖": {"category": "血糖", "unit": "mmol/L", "reference": "3.9-7.8"},
    "糖化血红蛋白": {"category": "血糖", "unit": "%", "reference": "4.0-6.0"},
    "总胆固醇": {"category": "血脂", "unit": "mmol/L", "reference": "3.0-5.7"},
    "甘油三酯": {"category": "血脂", "unit": "mmol/L", "reference": "0.5-1.7"},
    "低密度脂蛋白": {"category": "血脂", "unit": "mmol/L", "reference": "0-3.4"},
    "高密度脂蛋白": {"category": "血脂", "unit": "mmol/L", "reference": "1.0-2.0"},
    "谷丙转氨酶": {"category": "肝功能", "unit": "U/L", "reference": "0-40"},
    "谷草转氨酶": {"category": "肝功能", "unit": "U/L", "reference": "0-40"},
    "肌酐": {"category": "肾功能", "unit": "μmol/L", "reference": "44-133"},
    "尿酸": {"category": "肾功能", "unit": "μmol/L", "reference": "150-420"},
    "尿素氮": {"category": "肾功能", "unit": "mmol/L", "reference": "2.9-8.2"},
    "白细胞": {"category": "血常规", "unit": "10^9/L", "reference": "3.5-9.5"},
    "血红蛋白": {"category": "血常规", "unit": "g/L", "reference": "115-150"},
}

ALIASES: Dict[str, str] = {
    "高压": "收缩压",
    "低压": "舒张压",
    "血糖": "空腹血糖",
    "葡萄糖": "空腹血糖",
    "glu": "空腹血糖",
    "fpg": "空腹血糖",
    "餐后2小时血糖": "餐后血糖",
    "餐后2h血糖": "餐后血糖",
    "hba1c": "糖化血红蛋白",
    "tc": "总胆固醇",
    "tg": "甘油三酯",
    "ldl": "低密度脂蛋白",
    "hdl": "高密度脂蛋白",
    "alt": "谷丙转氨酶",
    "ast": "谷草转氨酶",
    "wbc": "白细胞",
    "hb": "血红蛋白",
}

UNIT_ALIASES = {
    "mmol/l": "mmol/L",
    "mg/dl": "mg/dL",
    "umol/l": "μmol/L",
    "μmol/l": "μmol/L",
    "mmhg": "mmHg",
    "u/l": "U/L",
}


def normalize_analysis_payload(
    payload: Optional[Dict[str, Any]],
    *,
    source_type: str,
    report_kind: str,
    extracted_text: str = "",
    sections: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    payload = payload or {}
    sections = sections or {}

    normalized_items: List[Dict[str, Any]] = []
    item_confidences: List[Tuple[int, float]] = []
    for index, item in enumerate(payload.get("abnormalities") or []):
        normalized_item, confidence = normalize_abnormality(item, report_kind)
        if normalized_item:
            normalized_items.append(normalized_item)
            item_confidences.append((len(normalized_items) - 1, confidence))

    if not normalized_items:
        synthesized = synthesize_narrative_abnormalities(
            payload.get("aiSummary") or "",
            extracted_text,
            report_kind,
        )
        for item, confidence in synthesized:
            normalized_items.append(item)
            item_confidences.append((len(normalized_items) - 1, confidence))

    patient_name = clean_text(payload.get("patientName"))
    hospital = clean_text(payload.get("hospital"))
    report_type = normalize_report_type(clean_text(payload.get("reportType")), report_kind)
    report_date = normalize_date_text(payload.get("reportDate"))
    patient_sex = normalize_sex(clean_text(payload.get("patientSex")))
    patient_age = normalize_age(payload.get("patientAge"))

    summary = clean_text(payload.get("aiSummary")) or build_fallback_summary(
        normalized_items,
        report_kind,
        sections,
    )
    health_tags = list(dict.fromkeys((payload.get("healthTags") or []) + infer_tags(normalized_items, report_kind)))
    report_highlights = build_highlights(
        payload.get("reportHighlights") or [],
        normalized_items,
        sections,
    )

    field_confidences: Dict[str, float] = {
        "patientName": field_confidence(patient_name, strong=has_chinese_name(patient_name)),
        "patientAge": field_confidence(patient_age, strong=patient_age is not None and 0 < patient_age < 120),
        "patientSex": field_confidence(patient_sex, strong=patient_sex in {"男", "女"}),
        "reportDate": field_confidence(report_date, strong=report_date is not None),
        "hospital": field_confidence(hospital, strong=bool(hospital and len(hospital) >= 4)),
        "reportType": field_confidence(report_type, strong=bool(report_type)),
        "aiSummary": field_confidence(summary, strong=bool(summary and len(summary) >= 24)),
    }

    pending_fields: List[str] = []
    for field_name, confidence in field_confidences.items():
        if confidence < 0.62:
            pending_fields.append(field_name)

    for index, confidence in item_confidences:
        item = normalized_items[index]
        for field_name in ("itemName", "value", "unit", "referenceRange"):
            item_field_confidence = min(confidence, field_confidence(item.get(field_name)))
            key = f"abnormalities[{index}].{field_name}"
            field_confidences[key] = round(item_field_confidence, 2)
            if item_field_confidence < 0.68:
                pending_fields.append(key)

    review_required = (
        report_kind in {"non_report", "unknown"}
        or len(pending_fields) > 0
        or (report_kind == "lab_report" and not normalized_items)
    )

    confidence_values = list(field_confidences.values())
    average_confidence = sum(confidence_values) / max(len(confidence_values), 1)
    low_confidence = review_required or average_confidence < 0.72

    return {
        "patientName": patient_name,
        "patientAge": patient_age,
        "patientSex": patient_sex,
        "reportDate": report_date,
        "hospital": hospital,
        "reportType": report_type,
        "abnormalities": normalized_items,
        "aiSummary": summary,
        "healthTags": health_tags,
        "reportHighlights": report_highlights,
        "sourceType": source_type,
        "reportKind": report_kind,
        "reviewRequired": review_required,
        "pendingFields": sorted(set(pending_fields)),
        "fieldConfidences": {key: round(value, 2) for key, value in field_confidences.items()},
        "extractedSections": sections,
        "lowConfidence": low_confidence,
        "confidenceScore": round(average_confidence * 100, 1),
    }


def normalize_abnormality(
    item: Dict[str, Any],
    report_kind: str,
) -> Tuple[Optional[Dict[str, Any]], float]:
    raw_name = clean_text(item.get("itemName") or item.get("name"))
    item_name = canonicalize_item_name(raw_name)
    if not item_name:
        return None, 0.0

    metadata = ITEM_METADATA.get(item_name, {})
    raw_unit = normalize_unit(clean_text(item.get("unit")) or metadata.get("unit"))
    value_text = normalize_value_text(item.get("value"))
    reference_range = normalize_reference_range(
        clean_text(item.get("referenceRange") or item.get("reference")) or metadata.get("reference")
    )
    numeric_value = parse_float(value_text)

    converted_value, converted_unit = convert_unit_if_needed(item_name, numeric_value, raw_unit)
    if converted_value is not None:
        numeric_value = converted_value
        raw_unit = converted_unit
        value_text = strip_trailing_zeros(converted_value)

    category = clean_text(item.get("category")) or metadata.get("category") or infer_category(item_name, report_kind)
    severity, risk_level = normalize_severity_and_risk(
        item.get("severity"),
        item.get("riskLevel"),
        numeric_value,
        reference_range,
    )
    follow_up_required = bool(item.get("followUpRequired")) or severity != "normal" or bool(item.get("doctorAdvice"))
    follow_up_period = normalize_follow_up_period(item.get("followUpPeriod"), severity)

    confidence = 0.35
    if item_name in ITEM_METADATA:
        confidence += 0.22
    if numeric_value is not None:
        confidence += 0.18
    if raw_unit not in {"", "-"}:
        confidence += 0.1
    if reference_range not in {"", "-"}:
        confidence += 0.1
    if severity != "normal":
        confidence += 0.08
    if clean_text(item.get("doctorAdvice")):
        confidence += 0.07

    if report_kind in {"imaging_report", "summary_report"} and raw_unit == "-":
        confidence = min(confidence, 0.72)

    normalized_item = {
        "itemName": item_name,
        "value": value_text or "-",
        "unit": raw_unit or "-",
        "referenceRange": reference_range or "-",
        "severity": severity,
        "riskLevel": risk_level,
        "category": category or "其他",
        "doctorAdvice": clean_text(item.get("doctorAdvice")) or build_doctor_advice(item_name, category, severity),
        "followUpRequired": follow_up_required,
        "followUpPeriod": follow_up_period if follow_up_required else None,
    }
    return normalized_item, min(confidence, 0.98)


def synthesize_narrative_abnormalities(
    ai_summary: str,
    extracted_text: str,
    report_kind: str,
) -> List[Tuple[Dict[str, Any], float]]:
    if report_kind not in {"imaging_report", "summary_report"}:
        return []

    text = f"{ai_summary}\n{extracted_text}"
    rules = [
        ("肺结节", "肺部", "高风险", "建议按医嘱复查胸部影像"),
        ("斑块", "心血管", "中风险", "建议按医嘱复查血管相关检查"),
        ("脂肪肝", "肝功能", "中风险", "建议控制饮食并定期复查肝胆超声"),
        ("骨密度", "其他", "中风险", "建议结合骨密度检查结果继续评估"),
        ("甲状腺结节", "甲状腺", "中风险", "建议按医嘱复查甲状腺超声"),
    ]
    synthesized: List[Tuple[Dict[str, Any], float]] = []
    lowered = clean_text(text) or ""
    for keyword, category, risk_label, advice in rules:
        if keyword not in lowered:
            continue
        risk_level = "high" if risk_label == "高风险" else "medium"
        synthesized.append(
            (
                {
                    "itemName": keyword,
                    "value": "见结论",
                    "unit": "-",
                    "referenceRange": "-",
                    "severity": "moderate",
                    "riskLevel": risk_level,
                    "category": category,
                    "doctorAdvice": advice,
                    "followUpRequired": True,
                    "followUpPeriod": 90,
                },
                0.66,
            )
        )
    return synthesized


def infer_tags(abnormalities: List[Dict[str, Any]], report_kind: str) -> List[str]:
    tags: List[str] = []
    for item in abnormalities:
        category = item.get("category")
        if category == "血压":
            tags.append("血压关注")
        elif category == "血糖":
            tags.append("血糖关注")
        elif category == "血脂":
            tags.append("血脂关注")
        elif category == "肺部":
            tags.append("肺部关注")
        elif category == "心血管":
            tags.append("心血管关注")
    if any(item.get("followUpRequired") for item in abnormalities):
        tags.append("待复查")
    if report_kind == "summary_report":
        tags.append("总检结论")
    if report_kind == "imaging_report":
        tags.append("影像结果")
    return tags


def build_highlights(
    input_highlights: List[str],
    abnormalities: List[Dict[str, Any]],
    sections: Dict[str, str],
) -> List[str]:
    cleaned = [clean_text(item) for item in input_highlights if clean_text(item)]
    if cleaned:
        return cleaned[:4]

    highlights = []
    for item in abnormalities[:4]:
        value = item.get("value")
        unit = item.get("unit")
        if value and value not in {"-", "见结论"}:
            highlights.append(f"{item['itemName']} {value}{unit if unit not in {'', '-'} else ''}")
        else:
            highlights.append(item["itemName"])

    if not highlights and sections.get("conclusion"):
        highlights.append(sections["conclusion"][:40])

    return highlights[:4]


def build_fallback_summary(
    abnormalities: List[Dict[str, Any]],
    report_kind: str,
    sections: Dict[str, str],
) -> str:
    if abnormalities:
        top_items = "、".join(item["itemName"] for item in abnormalities[:3])
        return f"已完成报告解析，当前重点关注 {top_items}，建议结合原始报告继续确认后续复查安排。"

    if report_kind == "imaging_report" and sections.get("conclusion"):
        return f"已提取影像结论，请重点核对结论区内容：{sections['conclusion'][:80]}"
    if report_kind == "summary_report" and sections.get("conclusion"):
        return f"已提取总检结论，请优先核对总结建议：{sections['conclusion'][:80]}"

    return "已完成报告解析，但部分字段仍需人工确认后再生成最终健康建议。"


def build_doctor_advice(item_name: str, category: str, severity: str) -> Optional[str]:
    if severity == "normal":
        return None

    advice_map = {
        "血压": "建议连续监测血压，必要时按医嘱复查并调整生活方式。",
        "血糖": "建议控制饮食和运动，按医嘱复查血糖相关指标。",
        "血脂": "建议控制油脂摄入并复查血脂。",
        "肝功能": "建议避免饮酒和熬夜，按医嘱复查肝功能。",
        "肾功能": "建议补充水分并按医嘱复查肾功能。",
        "肺部": "建议结合影像结论按医嘱定期复查。",
        "心血管": "建议结合医生意见尽快安排复查或随诊。",
    }
    return advice_map.get(category) or f"建议结合 {item_name} 的原始报告内容进一步确认。"


def normalize_report_type(report_type: Optional[str], report_kind: str) -> str:
    if report_type:
        return report_type
    mapping = {
        "lab_report": "检验报告",
        "imaging_report": "影像报告",
        "summary_report": "体检总结",
        "non_report": "待人工确认",
        "unknown": "待人工确认",
    }
    return mapping.get(report_kind, "待人工确认")


def infer_category(item_name: str, report_kind: str) -> str:
    metadata = ITEM_METADATA.get(item_name)
    if metadata:
        return metadata["category"]
    if "肺" in item_name:
        return "肺部"
    if "甲状腺" in item_name:
        return "甲状腺"
    if "斑块" in item_name or "心" in item_name:
        return "心血管"
    if report_kind == "imaging_report":
        return "其他"
    return "其他"


def normalize_severity_and_risk(
    severity: Any,
    risk_level: Any,
    numeric_value: Optional[float],
    reference_range: str,
) -> Tuple[str, str]:
    severity_value = normalize_severity_text(severity)
    risk_value = normalize_risk_text(risk_level)

    if severity_value != "normal":
        return severity_value, risk_value

    if numeric_value is None or reference_range in {"", "-"}:
        return severity_value, risk_value

    parsed_range = parse_reference_range(reference_range)
    if not parsed_range:
        return severity_value, risk_value

    lower, upper, mode = parsed_range
    if mode == "between" and lower is not None and upper is not None:
        if lower <= numeric_value <= upper:
            return "normal", "low"
        deviation = max(abs(numeric_value - lower), abs(numeric_value - upper))
        base = max(abs(upper - lower), 1e-6)
        ratio = deviation / base
    elif mode == "lt" and upper is not None:
        if numeric_value < upper:
            return "normal", "low"
        ratio = abs(numeric_value - upper) / max(abs(upper), 1e-6)
    elif mode == "gt" and lower is not None:
        if numeric_value > lower:
            return "normal", "low"
        ratio = abs(lower - numeric_value) / max(abs(lower), 1e-6)
    else:
        return severity_value, risk_value

    if ratio < 0.15:
        return "mild", "low"
    if ratio < 0.4:
        return "moderate", "medium"
    return "severe", "high"


def normalize_follow_up_period(value: Any, severity: str) -> int:
    try:
        parsed = int(str(value).strip()) if value is not None else 0
    except (TypeError, ValueError):
        parsed = 0
    if parsed > 0:
        return parsed

    mapping = {
        "severe": 7,
        "moderate": 30,
        "mild": 90,
        "normal": 180,
    }
    return mapping.get(severity, 30)


def convert_unit_if_needed(
    item_name: str,
    numeric_value: Optional[float],
    unit: str,
) -> Tuple[Optional[float], str]:
    if numeric_value is None:
        return None, unit

    if item_name in {"空腹血糖", "餐后血糖"} and unit == "mg/dL":
        return numeric_value / 18.0, "mmol/L"
    if item_name in {"总胆固醇", "低密度脂蛋白", "高密度脂蛋白"} and unit == "mg/dL":
        return numeric_value / 38.67, "mmol/L"
    if item_name == "甘油三酯" and unit == "mg/dL":
        return numeric_value / 88.57, "mmol/L"
    return numeric_value, unit


def normalize_reference_range(reference_range: Optional[str]) -> str:
    reference_range = clean_text(reference_range)
    if not reference_range:
        return "-"

    normalized = reference_range.replace("~", "-").replace("—", "-").replace("－", "-")
    normalized = normalized.replace("至", "-")
    normalized = normalized.replace("＜", "<").replace("≤", "<=").replace("＞", ">").replace("≥", ">=")
    normalized = re.sub(r"\s+", "", normalized)

    if re.match(r"^[<>]=?\d+(\.\d+)?$", normalized):
        return normalized

    match = re.search(r"(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)", normalized)
    if match:
        return f"{strip_trailing_zeros(float(match.group(1)))}-{strip_trailing_zeros(float(match.group(3)))}"
    return normalized


def parse_reference_range(reference_range: str) -> Optional[Tuple[Optional[float], Optional[float], str]]:
    if not reference_range or reference_range == "-":
        return None

    between = re.match(r"^(\d+(\.\d+)?)\-(\d+(\.\d+)?)$", reference_range)
    if between:
        return float(between.group(1)), float(between.group(3)), "between"

    less_than = re.match(r"^<=?(\d+(\.\d+)?)$", reference_range)
    if less_than:
        return None, float(less_than.group(1)), "lt"

    greater_than = re.match(r"^>=?(\d+(\.\d+)?)$", reference_range)
    if greater_than:
        return float(greater_than.group(1)), None, "gt"

    return None


def canonicalize_item_name(item_name: Optional[str]) -> str:
    item_name = clean_text(item_name)
    if not item_name:
        return ""

    lowered = item_name.lower()
    if lowered in ALIASES:
        return ALIASES[lowered]
    if item_name in ITEM_METADATA:
        return item_name

    for alias, canonical in ALIASES.items():
        if alias and alias in lowered:
            return canonical
    return item_name


def normalize_unit(unit: Optional[str]) -> str:
    unit = clean_text(unit)
    if not unit:
        return "-"
    lowered = unit.lower()
    return UNIT_ALIASES.get(lowered, unit)


def normalize_value_text(value: Any) -> str:
    if value is None:
        return "-"
    text = clean_text(str(value))
    if not text:
        return "-"
    text = text.replace(",", ".")
    numeric = parse_float(text)
    if numeric is None:
        return text
    return strip_trailing_zeros(numeric)


def normalize_severity_text(value: Any) -> str:
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
    normalized = clean_text(str(value or "")).lower()
    return mapping.get(normalized, "normal")


def normalize_risk_text(value: Any) -> str:
    mapping = {
        "low": "low",
        "mild": "low",
        "medium": "medium",
        "moderate": "medium",
        "high": "high",
        "severe": "high",
        "urgent": "urgent",
    }
    normalized = clean_text(str(value or "")).lower()
    return mapping.get(normalized, "low")


def normalize_sex(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    lowered = value.lower()
    if lowered in {"male", "m", "男"}:
        return "男"
    if lowered in {"female", "f", "女"}:
        return "女"
    return value


def normalize_age(value: Any) -> Optional[int]:
    try:
        age = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return age if 0 < age < 120 else None


def normalize_date_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = clean_text(str(value))
    match = re.search(r"(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})", text)
    if not match:
        return None
    return f"{match.group(1)}-{match.group(2).zfill(2)}-{match.group(3).zfill(2)}"


def field_confidence(value: Any, *, strong: bool = False) -> float:
    if value in (None, "", [], {}, "-"):
        return 0.0
    if strong:
        return 0.92
    return 0.7


def parse_float(value: Any) -> Optional[float]:
    try:
        if value in (None, ""):
            return None
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def strip_trailing_zeros(value: float) -> str:
    if math.isfinite(value) and value.is_integer():
        return str(int(value))
    return f"{value:.4f}".rstrip("0").rstrip(".")


def clean_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = re.sub(r"\s+", " ", text)
    return text


def has_chinese_name(value: Optional[str]) -> bool:
    if not value:
        return False
    return bool(re.match(r"^[\u4e00-\u9fa5·]{2,20}$", value))
