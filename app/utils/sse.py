"""
SSE（Server-Sent Events）编码工具
"""


def sse_data(text: str) -> str:
    """
    把一段文字编码成一个 SSE 事件。
    文字里有换行时，每一行都要单独加 "data: " 前缀（SSE 规范），浏览器端会把这些行用换行拼回去；
    直接写成 f"data: {text}\\n\\n" 的话，换行之后的内容会被当成无效字段丢掉。
    """
    return "".join(f"data: {line}\n" for line in text.split("\n")) + "\n"
