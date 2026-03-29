"""
结果验证和重试逻辑
确保解析结果的质量和准确性
"""

import logging
from typing import Dict, List, Optional, Any
import re

_logger = logging.getLogger("result-validator")


class ResultValidator:
    """结果验证器"""

    def __init__(
        self,
        min_abnormalities: int = 0,
        max_abnormalities: int = 30,
        require_basic_info: bool = False,
    ):
        """
        初始化验证器

        Args:
            min_abnormalities: 最少异常项数量
            max_abnormalities: 最多异常项数量
            require_basic_info: 是否要求必须有基本信息
        """
        self.min_abnormalities = min_abnormalities
        self.max_abnormalities = max_abnormalities
        self.require_basic_info = require_basic_info

    def validate(self, result: Optional[Dict]) -> tuple[bool, float, List[str]]:
        """
        验证解析结果

        Args:
            result: 解析结果

        Returns:
            (是否有效, 质量分数, 问题列表)
        """
        if not result:
            return False, 0.0, ["结果为空"]

        issues = []
        score = 0.0

        # 1. 验证基本结构
        if not isinstance(result, dict):
            return False, 0.0, ["结果不是字典类型"]

        # 2. 验证必需字段
        required_fields = ["abnormalities", "aiSummary"]
        for field in required_fields:
            if field not in result:
                issues.append(f"缺少必需字段: {field}")

        # 3. 验证基本信息
        basic_info_score = self._validate_basic_info(result, issues)
        score += basic_info_score

        # 4. 验证异常项
        abnormalities_score = self._validate_abnormalities(result, issues)
        score += abnormalities_score

        # 5. 验证 AI 总结
        summary_score = self._validate_summary(result, issues)
        score += summary_score

        # 6. 验证健康标签
        tags_score = self._validate_health_tags(result, issues)
        score += tags_score

        # 判断是否有效
        is_valid = len(issues) == 0 or (score >= 60 and not self._has_critical_issues(issues))

        _logger.info(
            f"验证结果: 有效={is_valid}, 分数={score:.1f}, 问题数={len(issues)}"
        )
        if issues:
            _logger.warning(f"发现问题: {', '.join(issues[:5])}")

        return is_valid, score, issues

    def _validate_basic_info(self, result: Dict, issues: List[str]) -> float:
        """验证基本信息（满分30分）"""
        score = 0.0

        # 患者姓名 (5分)
        if result.get("patientName"):
            name = result["patientName"]
            if self._is_valid_name(name):
                score += 5
            else:
                issues.append(f"患者姓名格式异常: {name}")
        elif self.require_basic_info:
            issues.append("缺少患者姓名")

        # 年龄 (5分)
        if result.get("patientAge"):
            age = result["patientAge"]
            if self._is_valid_age(age):
                score += 5
            else:
                issues.append(f"年龄不合理: {age}")
        elif self.require_basic_info:
            issues.append("缺少年龄")

        # 性别 (3分)
        if result.get("patientSex"):
            sex = result["patientSex"]
            if sex in ["男", "女", "Male", "Female", "M", "F"]:
                score += 3
            else:
                issues.append(f"性别格式异常: {sex}")

        # 医院 (7分)
        if result.get("hospital"):
            hospital = result["hospital"]
            if len(hospital) >= 3:
                score += 7
            else:
                issues.append(f"医院名称过短: {hospital}")
        elif self.require_basic_info:
            issues.append("缺少医院名称")

        # 报告日期 (5分)
        if result.get("reportDate"):
            date = result["reportDate"]
            if self._is_valid_date(date):
                score += 5
            else:
                issues.append(f"日期格式错误: {date}")

        # 报告类型 (5分)
        if result.get("reportType"):
            score += 5

        return score

    def _validate_abnormalities(self, result: Dict, issues: List[str]) -> float:
        """验证异常项（满分40分）"""
        score = 0.0

        abnormalities = result.get("abnormalities", [])

        if not isinstance(abnormalities, list):
            issues.append("abnormalities 不是列表类型")
            return 0.0

        # 数量检查 (10分)
        count = len(abnormalities)
        if count < self.min_abnormalities:
            issues.append(f"异常项过少: {count} < {self.min_abnormalities}")
        elif count > self.max_abnormalities:
            issues.append(f"异常项过多: {count} > {self.max_abnormalities}")
        else:
            score += 10

        if count == 0:
            return score

        # 逐项检查 (30分)
        valid_items = 0
        for i, item in enumerate(abnormalities[:20]):  # 最多检查20项
            item_issues = []

            # 检查必需字段
            if not item.get("itemName"):
                item_issues.append("缺少项目名称")
            if not item.get("value"):
                item_issues.append("缺少检测值")
            if not item.get("unit"):
                item_issues.append("缺少单位")

            # 检查数值格式
            value = str(item.get("value", ""))
            if value and not self._is_valid_value(value):
                item_issues.append(f"数值格式异常: {value}")

            # 检查严重程度
            severity = item.get("severity")
            if severity not in ["normal", "mild", "moderate", "severe"]:
                item_issues.append(f"严重程度无效: {severity}")

            # 检查风险等级
            risk_level = item.get("riskLevel")
            if risk_level not in ["low", "medium", "high", "urgent"]:
                item_issues.append(f"风险等级无效: {risk_level}")

            # 检查分类
            category = item.get("category")
            valid_categories = [
                "血压", "血糖", "血脂", "肝功能", "肾功能",
                "肺部", "心血管", "尿常规", "血常规", "甲状腺", "其他"
            ]
            if category and category not in valid_categories:
                item_issues.append(f"分类无效: {category}")

            # 检查复查周期
            follow_up_period = item.get("followUpPeriod")
            if follow_up_period is not None:
                if not isinstance(follow_up_period, (int, float)) or follow_up_period < 0:
                    item_issues.append(f"复查周期无效: {follow_up_period}")

            if not item_issues:
                valid_items += 1
            else:
                issues.append(f"异常项 {i+1} ({item.get('itemName', '未知')}): {', '.join(item_issues)}")

        # 根据有效项比例计分
        if count > 0:
            valid_ratio = valid_items / min(count, 20)
            score += 30 * valid_ratio

        return score

    def _validate_summary(self, result: Dict, issues: List[str]) -> float:
        """验证 AI 总结（满分20分）"""
        score = 0.0

        summary = result.get("aiSummary", "")

        if not summary:
            issues.append("缺少 AI 总结")
            return 0.0

        if not isinstance(summary, str):
            issues.append("AI 总结不是字符串类型")
            return 0.0

        # 长度检查 (10分)
        length = len(summary)
        if length < 20:
            issues.append(f"AI 总结过短: {length} 字符")
        elif length > 1000:
            issues.append(f"AI 总结过长: {length} 字符")
        else:
            score += 10

        # 内容质量检查 (10分)
        quality_score = 0

        # 包含关键词
        keywords = ["体检", "检查", "指标", "正常", "异常", "建议", "复查"]
        keyword_count = sum(1 for kw in keywords if kw in summary)
        if keyword_count >= 2:
            quality_score += 5

        # 不包含无意义内容
        bad_patterns = [
            r"无法识别",
            r"图片不清晰",
            r"OCR.*失败",
            r"解析.*错误",
        ]
        has_bad_content = any(re.search(pattern, summary) for pattern in bad_patterns)
        if not has_bad_content:
            quality_score += 5

        score += quality_score

        return score

    def _validate_health_tags(self, result: Dict, issues: List[str]) -> float:
        """验证健康标签（满分10分）"""
        score = 0.0

        tags = result.get("healthTags", [])

        if not isinstance(tags, list):
            issues.append("healthTags 不是列表类型")
            return 0.0

        # 数量检查 (5分)
        if 1 <= len(tags) <= 10:
            score += 5
        elif len(tags) > 10:
            issues.append(f"健康标签过多: {len(tags)}")

        # 内容检查 (5分)
        if tags:
            valid_tags = [tag for tag in tags if isinstance(tag, str) and 1 <= len(tag) <= 20]
            if len(valid_tags) == len(tags):
                score += 5
            else:
                issues.append("部分健康标签格式异常")

        return score

    def _is_valid_name(self, name: str) -> bool:
        """验证姓名格式"""
        if not isinstance(name, str):
            return False
        # 中文姓名通常2-4个字，英文姓名可能更长
        return 2 <= len(name) <= 20

    def _is_valid_age(self, age: Any) -> bool:
        """验证年龄"""
        try:
            age_int = int(age)
            return 0 <= age_int <= 150
        except (ValueError, TypeError):
            return False

    def _is_valid_date(self, date: str) -> bool:
        """验证日期格式"""
        if not isinstance(date, str):
            return False
        # YYYY-MM-DD 格式
        pattern = r"^\d{4}-\d{2}-\d{2}$"
        return bool(re.match(pattern, date))

    def _is_valid_value(self, value: str) -> bool:
        """验证检测值格式"""
        # 应该是数字或数字范围
        # 允许: "5.2", "120", "5.2-6.1", "<5.7", ">140"
        pattern = r"^[<>]?\d+\.?\d*(-\d+\.?\d*)?$"
        return bool(re.match(pattern, str(value).strip()))

    def _has_critical_issues(self, issues: List[str]) -> bool:
        """判断是否有严重问题"""
        critical_keywords = [
            "结果为空",
            "不是字典类型",
            "缺少必需字段",
            "abnormalities 不是列表类型",
        ]
        return any(
            any(keyword in issue for keyword in critical_keywords)
            for issue in issues
        )


class RetryStrategy:
    """重试策略"""

    def __init__(
        self,
        max_retries: int = 3,
        min_score_threshold: float = 60.0,
        retry_delay: float = 1.0,
    ):
        """
        初始化重试策略

        Args:
            max_retries: 最大重试次数
            min_score_threshold: 最低分数阈值
            retry_delay: 重试延迟（秒）
        """
        self.max_retries = max_retries
        self.min_score_threshold = min_score_threshold
        self.retry_delay = retry_delay
        self.validator = ResultValidator()

    async def execute_with_retry(
        self,
        parse_func,
        *args,
        **kwargs
    ) -> Optional[Dict]:
        """
        执行解析函数，带重试逻辑

        Args:
            parse_func: 解析函数（async）
            *args, **kwargs: 传递给解析函数的参数

        Returns:
            解析结果或 None
        """
        import asyncio

        best_result = None
        best_score = 0.0

        for attempt in range(1, self.max_retries + 1):
            _logger.info(f"第 {attempt}/{self.max_retries} 次尝试解析...")

            try:
                # 执行解析
                result = await parse_func(*args, **kwargs)

                # 验证结果
                is_valid, score, issues = self.validator.validate(result)

                _logger.info(
                    f"第 {attempt} 次解析完成: 有效={is_valid}, 分数={score:.1f}"
                )

                # 更新最佳结果
                if score > best_score:
                    best_score = score
                    best_result = result

                # 如果结果足够好，直接返回
                if is_valid and score >= self.min_score_threshold:
                    _logger.info(f"解析成功，分数 {score:.1f} 达到阈值")
                    return result

                # 如果还有重试机会，等待后重试
                if attempt < self.max_retries:
                    _logger.warning(
                        f"分数 {score:.1f} 未达到阈值 {self.min_score_threshold}，"
                        f"{self.retry_delay}秒后重试..."
                    )
                    await asyncio.sleep(self.retry_delay)

            except Exception as e:
                _logger.error(f"第 {attempt} 次解析失败: {str(e)}")
                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_delay * 2)

        # 所有重试都失败，返回最佳结果
        if best_result:
            _logger.warning(
                f"所有重试完成，返回最佳结果（分数 {best_score:.1f}）"
            )
            return best_result

        _logger.error("所有重试都失败，无有效结果")
        return None


def calculate_result_score(result: Optional[Dict]) -> float:
    """
    计算结果质量分数（快速版本，用于比较）

    Args:
        result: 解析结果

    Returns:
        质量分数 (0-100)
    """
    if not result:
        return 0.0

    validator = ResultValidator()
    _, score, _ = validator.validate(result)
    return score
