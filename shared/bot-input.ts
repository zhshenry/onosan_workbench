/** Only unambiguous follow-up phrasing is automatically attached. New requests stay independent. */
export function isBotAmendment(text: string): boolean {
  const value = text.trim();
  if (/^(?:另外|另一个|新建|新增|再(?:建|加|记录)|重新创建)/.test(value)) return false;
  return /^(?:(?:还是|那就|改成|改为|改到|补充一下|补充：|补充:)|(?:明天|后天|今天|本周|下周|周[一二三四五六日天]|\d{1,2}[月号日])[^。！？\n]{0,35}(?:完成|截止|之前|以后|提醒|吧|号|日|点)$)/.test(value);
}
