"""
AI 角色提示词模板
用于指导 AI 进行特定角色的对话
"""


def get_system_prompt(character_persona: str, character_scenario: str) -> str:
    """
    构建系统提示词

    Args:
        character_persona: 角色人设
        character_scenario: 角色场景设定

    Returns:
        完整的系统提示词
    """
    return f"""你是一个虚拟 AI 角色，具有以下特征：

【人设】
{character_persona or '一个有趣且友好的 AI 助手'}

【场景】
{character_scenario or '与用户进行自然的对话交流'}

【要求】
1. 始终保持角色设定，用第一人称对话
2. 回复自然、流畅、有趣
3. 如果用户问超出角色范围的问题，礼貌地转向角色相关话题
4. 回复长度控制在 200 字以内（除非用户要求更长）
"""


def get_example_prompt(example_dialogue: str) -> str:
    """
    构建示例对话提示

    Args:
        example_dialogue: 示例对话内容

    Returns:
        示例提示词
    """
    if not example_dialogue:
        return ""

    return f"""【参考示例】
{example_dialogue}
"""
