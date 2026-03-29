function getSupportEmail(): string {
  return (
    process.env.SUPPORT_EMAIL ||
    process.env.EMAIL_OTP_REPLY_TO ||
    'support@example.com'
  );
}

export function getComplianceDefaults() {
  const supportEmail = getSupportEmail();
  return {
    privacy:
      `我们仅收集实现健康管理功能所需的最小信息，包括账号、报告文件和健康数据。\n上传报告和健康数据用于生成提醒与复查建议，不会用于未授权的商业用途。\n你可以在设置中申请数据删除与账号注销，处理完成后会清除可识别个人信息。\n如需隐私相关支持，请联系运营团队邮箱 ${supportEmail}。`,
    terms:
      '你应保证上传信息真实、完整，并对账号下所有操作负责。\n本产品提供健康管理辅助功能，包含提醒、趋势分析和任务建议。\n你同意遵守平台使用规范，不得上传违法、侵权或虚假内容。\n平台可在必要时更新功能与协议条款，重大调整将通过应用内提示。',
    medical:
      '本应用不提供医疗诊断服务，不替代医生面诊、检验和治疗建议。\n系统识别结果可能存在误差，任何异常指标请以医院正式报告和医生意见为准。\n若出现胸闷胸痛、呼吸困难、意识障碍等急症，请立即就医或拨打急救电话。\n你理解并同意自行承担基于应用内容做出决策的风险。',
    dataDeletion:
      `你可在 App 内通过「我的 -> 注销账号」发起删除申请，系统会删除账号及其关联报告、指标、任务、复查、家属协同和推送标识数据。\n处理时效通常为即时，若遇到系统延迟会在 15 分钟内完成。\n删除后数据不可恢复，请在提交前确认。\n如需人工协助，请联系 ${supportEmail}。`,
  };
}
