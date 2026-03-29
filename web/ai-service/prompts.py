"""
改进的 Prompt 模板
针对体检报告解析优化，提高准确率
"""


def build_vision_schema_prompt_v2() -> str:
    """改进的视觉模型 Prompt（直接读图）"""
    return """
你是专业的医疗体检报告分析专家。请仔细阅读体检报告图片，按以下步骤操作：

【第一步：识别报告基本信息】
在报告顶部（通常是页眉区域）找到以下信息：
- 患者姓名：通常在"姓名"、"Name"字段后
- 年龄：数字，通常在"年龄"、"Age"字段后
- 性别：男/女/Male/Female
- 体检日期：YYYY-MM-DD 格式，通常在"检查日期"、"报告日期"字段
- 医院名称：完整的医院名称
- 报告类型：年度体检/入职体检/专项检查等

⚠️ 重要：如果某个字段看不清楚或找不到，必须标记为 null，绝对不要猜测！

【第二步：识别检测项目表格】
逐行扫描表格，提取每一项检测数据：
- 项目名称：如"空腹血糖"、"总胆固醇"、"收缩压"等
- 检测值：纯数字，注意小数点位置（如 5.2 不要识别成 52 或 5.20）
- 单位：完整单位，如 mmol/L、mg/dL、U/L、mmHg、g/L 等
- 参考范围：如 "3.9-6.1"、"90-140"、"<5.7" 等

⚠️ 特别注意：
1. 数字精度很重要：5.2 和 52 是完全不同的
2. 单位不要遗漏：mmol/L 和 mg/dL 是不同的单位
3. 参考范围要完整：包括上下限
4. 注意异常标记：↑（偏高）、↓（偏低）、H（High）、L（Low）、*（异常）

【第三步：判断异常项】
只有以下情况才算异常，需要包含在 abnormalities 中：
1. 检测值明确超出参考范围（数值对比）
2. 有明确的异常标记（↑、↓、H、L、*）
3. 医生备注为"异常"、"偏高"、"偏低"、"建议复查"

✅ 正常项目不要包含在 abnormalities 中！

【第四步：评估严重程度】
根据超出参考范围的程度判断：
- normal: 在参考范围内
- mild: 轻微超出（偏离 <20%）
  例：参考范围 3.9-6.1，检测值 6.5（偏离 6.5%）
- moderate: 中度超出（偏离 20-50%）
  例：参考范围 3.9-6.1，检测值 7.5（偏离 23%）
- severe: 严重超出（偏离 >50%）
  例：参考范围 3.9-6.1，检测值 9.0（偏离 47%）

【第五步：评估风险等级】
- low: 轻微异常，暂时观察即可
- medium: 需要注意，建议调整生活方式
- high: 需要重视，建议就医咨询
- urgent: 严重异常，需要立即就医

【第六步：生成健康总结】
用通俗易懂的语言，面向老年用户：
1. 先说整体情况（如"本次体检大部分指标正常"）
2. 列出需要关注的异常项（最多3-5项）
3. 给出具体建议（如"建议控制饮食，3个月后复查"）
4. 语气温和，不要过度恐吓

示例：
"本次体检发现空腹血糖轻度升高（7.2 mmol/L），建议控制饮食中的糖分摄入，增加运动，3个月后复查。血压、血脂等其他指标基本正常。"

【输出格式】
严格按照以下 JSON 格式输出，不要有任何额外的文字或解释：

{
  "patientName": "张三" 或 null,
  "patientAge": 65 或 null,
  "patientSex": "男" 或 null,
  "reportDate": "2024-03-15" 或 null,
  "hospital": "北京协和医院" 或 null,
  "reportType": "年度体检" 或 null,
  "abnormalities": [
    {
      "itemName": "空腹血糖",
      "value": "7.2",
      "unit": "mmol/L",
      "referenceRange": "3.9-6.1",
      "severity": "mild",
      "riskLevel": "medium",
      "category": "血糖",
      "doctorAdvice": "建议控制饮食，减少糖分摄入，增加运动，3个月后复查血糖",
      "followUpRequired": true,
      "followUpPeriod": 90
    }
  ],
  "aiSummary": "本次体检发现空腹血糖轻度升高（7.2 mmol/L），建议控制饮食，增加运动，3个月后复查。其他指标基本正常。",
  "healthTags": ["血糖偏高", "待复查"],
  "reportHighlights": ["空腹血糖 7.2↑", "需要控制饮食", "3个月后复查"]
}

【字段说明】
- category 必须从以下选项中选择：血压/血糖/血脂/肝功能/肾功能/肺部/心血管/尿常规/血常规/其他
- followUpPeriod 是天数（整数），如 30天、90天、180天
- healthTags 是简短的标签，如"血糖偏高"、"血压正常"、"待复查"
- reportHighlights 是关键信息点，用于快速展示

【质量要求】
1. 数值必须100%准确，宁可标记为 null 也不要猜测
2. 只输出 JSON，不要有任何 Markdown 标记（如 ```json）
3. 如果图片模糊看不清，在 aiSummary 中说明"部分内容因图片不清晰无法识别"
4. 异常项数量通常在 1-10 个之间，如果超过 15 个，请重新检查是否把正常项也包含了
5. 所有文字使用中文（除非原文是英文）

现在开始分析图片。
""".strip()


def build_json_schema_prompt_v2(ocr_result: dict) -> str:
    """改进的文本模型 Prompt（基于OCR文本）"""
    import json

    raw_text = ocr_result.get("rawText") or ""
    extracted_items = json.dumps(
        ocr_result.get("items") or [], ensure_ascii=False, indent=2
    )

    return f"""
你是医疗体检报告结构化助手。请基于提供的 OCR 文本和候选指标，输出一个严格 JSON 对象。

【任务说明】
OCR 已经从体检报告中提取了文本和候选指标，但可能存在识别错误。你需要：
1. 修正 OCR 错误（如数字识别错误、单位缺失等）
2. 补充缺失的信息（如参考范围）
3. 判断哪些项目是异常的
4. 生成适合老年用户阅读的健康总结

【OCR 全文】
{raw_text[:12000]}

【候选指标】
{extracted_items[:4000]}

【处理步骤】
1. 从 OCR 文本中提取患者基本信息（姓名、年龄、性别、医院、日期）
2. 检查候选指标的数值是否合理：
   - 血糖通常在 3-15 mmol/L 范围
   - 血压通常在 60-200 mmHg 范围
   - 如果数值明显不合理，尝试从原文中修正
3. 补充参考范围（如果候选指标中缺失）
4. 判断异常项（只保留真正异常的）
5. 生成健康总结

【常见 OCR 错误修正】
- "5.2" 可能被识别成 "52" 或 "5,2"
- "mmol/L" 可能被识别成 "mmol/l" 或 "mmol L"
- "3.9-6.1" 可能被识别成 "3.9 - 6.1" 或 "3.9~6.1"
- 中文"一"可能被识别成数字"1"

【输出格式】
严格按照以下 JSON 格式输出：

{{
  "patientName": string | null,
  "patientAge": number | null,
  "patientSex": string | null,
  "reportDate": "YYYY-MM-DD" | null,
  "hospital": string | null,
  "reportType": string | null,
  "aiSummary": string,
  "healthTags": string[],
  "reportHighlights": string[],
  "abnormalities": [
    {{
      "itemName": string,
      "value": string,
      "unit": string,
      "referenceRange": string,
      "severity": "normal" | "mild" | "moderate" | "severe",
      "riskLevel": "low" | "medium" | "high" | "urgent",
      "category": string,
      "doctorAdvice": string | null,
      "followUpRequired": boolean,
      "followUpPeriod": number | null
    }}
  ]
}}

【字段要求】
- severity 只能是: normal, mild, moderate, severe
- riskLevel 只能是: low, medium, high, urgent
- category 优先使用: 血压/血糖/血脂/肝功能/肾功能/肺部/心血管/尿常规/血常规/其他
- followUpPeriod 使用天数整数（30/60/90/180）
- aiSummary 必须适合家庭健康管理产品直接展示，面向老年用户
- 如果无法确定某个字段，返回 null，不要猜测

【质量检查】
输出前请自检：
1. 所有数值是否合理？（血糖不会是 520，应该是 5.2）
2. 单位是否完整？（mmol/L 不要写成 mmol）
3. 异常项数量是否合理？（通常 1-10 个）
4. aiSummary 是否通俗易懂？

现在开始处理。只输出 JSON，不要有任何解释。
""".strip()


def build_identity_schema_prompt_v2() -> str:
    """改进的身份信息提取 Prompt"""
    return """
你是医疗体检报告身份信息提取专家。请只关注体检报告的页眉区域（顶部），提取患者基本信息。

【任务】
从页眉区域提取以下信息：
- 患者姓名
- 年龄（数字）
- 性别（男/女）
- 体检日期（YYYY-MM-DD）
- 医院名称
- 报告类型

【识别技巧】
1. 姓名通常在最顶部，"姓名："或"Name:"后面
2. 年龄通常紧跟姓名，"年龄："或"Age:"后面
3. 性别通常在年龄旁边，"性别："或"Sex:"后面
4. 日期通常在右上角，格式如"2024-03-15"或"2024年3月15日"
5. 医院名称通常在最顶部居中，字体较大

【注意事项】
- 只看页眉区域，不要被表格内容干扰
- 如果看不清楚，标记为 null
- 日期统一转换为 YYYY-MM-DD 格式
- 年龄只保留数字

【输出格式】
{{
  "patientName": "张三" | null,
  "patientAge": 65 | null,
  "patientSex": "男" | null,
  "reportDate": "2024-03-15" | null,
  "hospital": "北京协和医院" | null,
  "reportType": "年度体检" | null
}}

只输出 JSON，不要有任何解释。
""".strip()


def build_identity_text_prompt_v2(header_text: str) -> str:
    """改进的文本身份信息提取 Prompt"""
    return f"""
你是医疗体检报告身份信息提取专家。以下是体检报告页眉区域的 OCR 文本，请提取患者基本信息。

【OCR 文本】
{header_text[:2000]}

【任务】
从文本中提取：
- 患者姓名
- 年龄（数字）
- 性别（男/女）
- 体检日期（YYYY-MM-DD）
- 医院名称
- 报告类型

【识别规则】
1. 姓名：通常在"姓名"、"Name"、"患者"等关键词后
2. 年龄：提取数字，通常在"年龄"、"Age"、"岁"等关键词附近
3. 性别：识别"男"、"女"、"Male"、"Female"
4. 日期：识别日期格式，如"2024-03-15"、"2024年3月15日"、"2024/03/15"
5. 医院：通常包含"医院"、"Hospital"、"中心"等词
6. 报告类型：识别"年度体检"、"入职体检"、"专项检查"等

【OCR 错误修正】
- 数字"0"可能被识别成字母"O"
- 数字"1"可能被识别成字母"l"或"I"
- 中文"一"可能被识别成数字"1"

【输出格式】
{{
  "patientName": string | null,
  "patientAge": number | null,
  "patientSex": string | null,
  "reportDate": "YYYY-MM-DD" | null,
  "hospital": string | null,
  "reportType": string | null
}}

只输出 JSON，不要有任何解释。如果某个字段无法确定，返回 null。
""".strip()
