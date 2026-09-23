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
    # speaking_style / catchphrase 是 Character 模型后续新增的字段，
    # 用 getattr 兼容数据库还没加上这两列的情况（此时视为未填写）
    speaking_style = getattr(character, "speaking_style", None)
    catchphrase = getattr(character, "catchphrase", None)

    lines = [
        "【角色设定】",
        f"你正在扮演 {character.name}。",
        f"人设：{persona}",
        f"场景：{scenario}",
    ]
    if speaking_style:
        lines.append(f"说话风格：{speaking_style}")
    if catchphrase:
        lines.append(f"口头禅：{catchphrase}")

    requirements = [
        "",
        "【回复要求】",
        "1. 始终以角色身份说话，绝不跳出角色。",
        "2. 回复要有画面感和情绪，至少 2-4 句话，除非用户明确要求简短。",
        "3. 适当使用动作描写和心理描写，用 *星号* 表示，例如 *歪着头看你*、*轻轻笑了一下*。",
        "4. 保持角色的口头禅、语气、性格。",
        "5. 如果用户的问题与你的世界观不符，用角色身份委婉回应。",
        "6. 不要提及“我是 AI”“我是语言模型”之类的话。",
        "7. 不要输出“好的”“是的”这类干巴巴的短句。",
    ]

    return "\n".join(lines + requirements)


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

    return f"""【对话示例】
{example_dialogue}
"""
