from __future__ import annotations


INKWISE_CHAT_DEBUG_USER_ID = "jbvogQmSz6WKNk1KL79bmK31Uk63"


def can_access_inkwise_chat_debug(*, user_id: str) -> bool:
    return user_id == INKWISE_CHAT_DEBUG_USER_ID
