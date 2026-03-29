"""
混合策略实现
结合多种解析方法，选择最佳结果
"""

import logging
import asyncio
import time
from typing import Dict, List, Optional, Any, Callable
from enum import Enum

_logger = logging.getLogger("hybrid-strategy")


class ParserMethod(Enum):
    """解析方法枚举"""
    VISION_PRIMARY = "vision_primary"  # 主视觉模型
    VISION_RETRY = "vision_retry"  # 视觉模型重试
    OCR_PLUS_LLM = "ocr_plus_llm"  # OCR + 文本模型
    FALLBACK = "fallback"  # 降级方案


class ParseResult:
    """解析结果封装"""

    def __init__(
        self,
        method: ParserMethod,
        data: Optional[Dict],
        score: float,
        elapsed_ms: float,
        error: Optional[str] = None,
    ):
        self.method = method
        self.data = data
        self.score = score
        self.elapsed_ms = elapsed_ms
        self.error = error
        self.is_success = data is not None and error is None

    def __repr__(self):
        return (
            f"ParseResult(method={self.method.value}, "
            f"score={self.score:.1f}, "
            f"elapsed={self.elapsed_ms:.0f}ms, "
            f"success={self.is_success})"
        )


class HybridParser:
    """混合解析器"""

    def __init__(
        self,
        validator,
        enable_parallel: bool = True,
        enable_retry: bool = True,
        max_retries: int = 2,
        retry_delay: float = 1.0,
    ):
        """
        初始化混合解析器

        Args:
            validator: 结果验证器
            enable_parallel: 是否启用并行解析
            enable_retry: 是否启用重试
            max_retries: 最大重试次数
            retry_delay: 重试延迟（秒）
        """
        self.validator = validator
        self.enable_parallel = enable_parallel
        self.enable_retry = enable_retry
        self.max_retries = max_retries
        self.retry_delay = retry_delay

    async def parse_with_hybrid_strategy(
        self,
        file_path: str,
        vision_parser: Callable,
        ocr_parser: Optional[Callable] = None,
        fallback_data: Optional[Dict] = None,
    ) -> ParseResult:
        """
        使用混合策略解析报告

        Args:
            file_path: 文件路径
            vision_parser: 视觉模型解析函数
            ocr_parser: OCR解析函数（可选）
            fallback_data: 降级数据（可选）

        Returns:
            最佳解析结果
        """
        _logger.info(f"开始混合策略解析: {file_path}")
        start_time = time.perf_counter()

        results: List[ParseResult] = []

        # 策略1: 主视觉模型解析
        primary_result = await self._parse_with_vision_primary(
            file_path, vision_parser
        )
        results.append(primary_result)

        # 如果主解析成功且质量高，直接返回
        if primary_result.is_success and primary_result.score >= 80:
            _logger.info(
                f"主视觉模型解析成功，质量高 (score={primary_result.score:.1f})，直接返回"
            )
            return primary_result

        # 策略2: 并行执行多种方法
        if self.enable_parallel:
            parallel_results = await self._parse_with_parallel_methods(
                file_path, vision_parser, ocr_parser
            )
            results.extend(parallel_results)

        # 策略3: 重试机制
        if self.enable_retry and not any(r.score >= 70 for r in results):
            retry_result = await self._parse_with_retry(file_path, vision_parser)
            if retry_result:
                results.append(retry_result)

        # 策略4: 降级方案
        if not any(r.is_success for r in results) and fallback_data:
            fallback_result = self._create_fallback_result(fallback_data)
            results.append(fallback_result)

        # 选择最佳结果
        best_result = self._select_best_result(results)

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        _logger.info(
            f"混合策略解析完成: 方法={best_result.method.value}, "
            f"分数={best_result.score:.1f}, "
            f"总耗时={elapsed_ms:.0f}ms, "
            f"尝试次数={len(results)}"
        )

        return best_result

    async def _parse_with_vision_primary(
        self, file_path: str, vision_parser: Callable
    ) -> ParseResult:
        """主视觉模型解析"""
        _logger.info("执行主视觉模型解析...")
        start_time = time.perf_counter()

        try:
            data = await asyncio.wait_for(vision_parser(file_path), timeout=60.0)
            elapsed_ms = (time.perf_counter() - start_time) * 1000

            if data:
                is_valid, score, issues = self.validator.validate(data)
                _logger.info(
                    f"主视觉模型解析完成: 有效={is_valid}, 分数={score:.1f}, "
                    f"耗时={elapsed_ms:.0f}ms"
                )
                return ParseResult(
                    method=ParserMethod.VISION_PRIMARY,
                    data=data,
                    score=score,
                    elapsed_ms=elapsed_ms,
                )
            else:
                _logger.warning("主视觉模型返回空结果")
                return ParseResult(
                    method=ParserMethod.VISION_PRIMARY,
                    data=None,
                    score=0.0,
                    elapsed_ms=elapsed_ms,
                    error="返回空结果",
                )

        except asyncio.TimeoutError:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            _logger.error("主视觉模型解析超时")
            return ParseResult(
                method=ParserMethod.VISION_PRIMARY,
                data=None,
                score=0.0,
                elapsed_ms=elapsed_ms,
                error="超时",
            )
        except Exception as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            _logger.error(f"主视觉模型解析失败: {str(e)}")
            return ParseResult(
                method=ParserMethod.VISION_PRIMARY,
                data=None,
                score=0.0,
                elapsed_ms=elapsed_ms,
                error=str(e),
            )

    async def _parse_with_parallel_methods(
        self,
        file_path: str,
        vision_parser: Callable,
        ocr_parser: Optional[Callable],
    ) -> List[ParseResult]:
        """并行执行多种解析方法"""
        _logger.info("执行并行解析...")
        tasks = []

        # 任务1: 视觉模型（不同参数）
        tasks.append(self._parse_with_vision_variant(file_path, vision_parser))

        # 任务2: OCR + 文本模型
        if ocr_parser:
            tasks.append(self._parse_with_ocr(file_path, ocr_parser))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        valid_results = []
        for result in results:
            if isinstance(result, ParseResult):
                valid_results.append(result)
            elif isinstance(result, Exception):
                _logger.error(f"并行任务失败: {str(result)}")

        return valid_results

    async def _parse_with_vision_variant(
        self, file_path: str, vision_parser: Callable
    ) -> ParseResult:
        """使用不同参数的视觉模型解析"""
        _logger.info("执行视觉模型变体解析...")
        start_time = time.perf_counter()

        try:
            # 这里可以调整温度等参数
            data = await asyncio.wait_for(vision_parser(file_path), timeout=50.0)
            elapsed_ms = (time.perf_counter() - start_time) * 1000

            if data:
                is_valid, score, issues = self.validator.validate(data)
                return ParseResult(
                    method=ParserMethod.VISION_PRIMARY,
                    data=data,
                    score=score * 0.95,  # 略微降低分数，优先主方法
                    elapsed_ms=elapsed_ms,
                )
            else:
                return ParseResult(
                    method=ParserMethod.VISION_PRIMARY,
                    data=None,
                    score=0.0,
                    elapsed_ms=elapsed_ms,
                    error="返回空结果",
                )

        except Exception as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            return ParseResult(
                method=ParserMethod.VISION_PRIMARY,
                data=None,
                score=0.0,
                elapsed_ms=elapsed_ms,
                error=str(e),
            )

    async def _parse_with_ocr(
        self, file_path: str, ocr_parser: Callable
    ) -> ParseResult:
        """使用 OCR + 文本模型解析"""
        _logger.info("执行 OCR + 文本模型解析...")
        start_time = time.perf_counter()

        try:
            data = await asyncio.wait_for(ocr_parser(file_path), timeout=40.0)
            elapsed_ms = (time.perf_counter() - start_time) * 1000

            if data:
                is_valid, score, issues = self.validator.validate(data)
                _logger.info(
                    f"OCR + 文本模型解析完成: 有效={is_valid}, 分数={score:.1f}"
                )
                return ParseResult(
                    method=ParserMethod.OCR_PLUS_LLM,
                    data=data,
                    score=score * 0.9,  # OCR方法分数打折
                    elapsed_ms=elapsed_ms,
                )
            else:
                return ParseResult(
                    method=ParserMethod.OCR_PLUS_LLM,
                    data=None,
                    score=0.0,
                    elapsed_ms=elapsed_ms,
                    error="返回空结果",
                )

        except Exception as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            _logger.error(f"OCR + 文本模型解析失败: {str(e)}")
            return ParseResult(
                method=ParserMethod.OCR_PLUS_LLM,
                data=None,
                score=0.0,
                elapsed_ms=elapsed_ms,
                error=str(e),
            )

    async def _parse_with_retry(
        self, file_path: str, vision_parser: Callable
    ) -> Optional[ParseResult]:
        """重试解析"""
        _logger.info(f"开始重试解析，最多 {self.max_retries} 次...")

        for attempt in range(self.max_retries):
            _logger.info(f"第 {attempt + 1} 次重试...")

            # 等待一段时间再重试
            if attempt > 0:
                await asyncio.sleep(self.retry_delay * attempt)

            start_time = time.perf_counter()

            try:
                data = await asyncio.wait_for(vision_parser(file_path), timeout=50.0)
                elapsed_ms = (time.perf_counter() - start_time) * 1000

                if data:
                    is_valid, score, issues = self.validator.validate(data)

                    # 如果质量足够好，返回结果
                    if score >= 60:
                        _logger.info(f"重试成功: 分数={score:.1f}")
                        return ParseResult(
                            method=ParserMethod.VISION_RETRY,
                            data=data,
                            score=score,
                            elapsed_ms=elapsed_ms,
                        )
                    else:
                        _logger.warning(f"重试质量不佳: 分数={score:.1f}")

            except Exception as e:
                _logger.error(f"第 {attempt + 1} 次重试失败: {str(e)}")

        _logger.warning("所有重试均失败")
        return None

    def _create_fallback_result(self, fallback_data: Dict) -> ParseResult:
        """创建降级结果"""
        _logger.info("使用降级方案")
        is_valid, score, issues = self.validator.validate(fallback_data)
        return ParseResult(
            method=ParserMethod.FALLBACK,
            data=fallback_data,
            score=score * 0.5,  # 降级方案分数大幅打折
            elapsed_ms=0.0,
        )

    def _select_best_result(self, results: List[ParseResult]) -> ParseResult:
        """选择最佳结果"""
        if not results:
            _logger.error("没有任何解析结果")
            return ParseResult(
                method=ParserMethod.FALLBACK,
                data=None,
                score=0.0,
                elapsed_ms=0.0,
                error="没有任何解析结果",
            )

        # 按分数排序
        results.sort(key=lambda r: r.score, reverse=True)

        # 记录所有结果
        _logger.info("所有解析结果:")
        for i, result in enumerate(results):
            _logger.info(f"  {i + 1}. {result}")

        # 返回最高分的结果
        best = results[0]
        _logger.info(f"选择最佳结果: {best}")
        return best


class ResultMerger:
    """结果合并器"""

    @staticmethod
    def merge_results(results: List[Dict]) -> Dict:
        """
        合并多个解析结果，取最可信的字段

        Args:
            results: 多个解析结果

        Returns:
            合并后的结果
        """
        if not results:
            return {}

        if len(results) == 1:
            return results[0]

        _logger.info(f"合并 {len(results)} 个解析结果...")

        merged = {}

        # 基本信息：优先选择非空且最常见的值
        for field in ["patientName", "patientAge", "patientSex", "hospital", "reportDate", "reportType"]:
            values = [r.get(field) for r in results if r.get(field)]
            if values:
                # 选择出现最多的值
                merged[field] = max(set(values), key=values.count)

        # 异常项：合并所有结果，去重
        all_abnormalities = []
        seen_items = set()

        for result in results:
            for item in result.get("abnormalities", []):
                item_key = f"{item.get('itemName')}_{item.get('value')}"
                if item_key not in seen_items:
                    all_abnormalities.append(item)
                    seen_items.add(item_key)

        merged["abnormalities"] = all_abnormalities

        # AI 总结：选择最长的
        summaries = [r.get("aiSummary", "") for r in results]
        merged["aiSummary"] = max(summaries, key=len) if summaries else ""

        # 健康标签：合并去重
        all_tags = []
        for result in results:
            all_tags.extend(result.get("healthTags", []))
        merged["healthTags"] = list(set(all_tags))

        # 报告亮点：合并去重
        all_highlights = []
        for result in results:
            all_highlights.extend(result.get("reportHighlights", []))
        merged["reportHighlights"] = list(set(all_highlights))

        _logger.info(
            f"合并完成: 异常项={len(merged.get('abnormalities', []))}, "
            f"标签={len(merged.get('healthTags', []))}"
        )

        return merged
