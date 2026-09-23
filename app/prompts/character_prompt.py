"""
AI 角色提示词模板
用于指导 AI 进行特定角色的对话
"""


def get_system_prompt(character) -> str:
    """
    根据角色信息构建系统提示词

    Args:
        character: Character 模型实例；为 None 时退化为通用助手提示词

    Returns:
        完整的系统提示词
    """
    if character is None:
        return "你是一个友好的 AI 助手。"

    persona = character.persona or "一个有趣且友好的 AI 角色"
    scenario = character.scenario or "与用户进行自然的对话交流"

    prompt = f"""你是一个虚拟 AI 角色，具有以下特征：

【人设】
{persona}

【场景】
{scenario}

【要求】
1. 始终保持角色设定，用第一人称对话
2. 回复自然、流畅、有趣
3. 如果用户问超出角色范围的问题，礼貌地转向角色相关话题
4. 回复长度控制在 200 字以内（除非用户要求更长）
"""

    if character.greeting:
        prompt += f"\n【开场白参考】\n{character.greeting}\n"

    return prompt


def get_example_prompt(example_dialogue: str) -> str:
    """
    构建示例对话提示

    Args:
        example_dialogue: 示例对话内容

    Returns:
        示例提示词，example_dialogue 为空时返回空字符串
    """
    if not example_dialogue:
        return ""

    return f"""【参考示例】
{example_dialogue}
"""
