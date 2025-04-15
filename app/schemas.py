# app/schemas.py
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime

# --- Базовые схемы для вложенности (избегаем рекурсии) ---
class UserInfo(BaseModel):
    """Базовая информация о пользователе для вложенных схем."""
    id: int
    username: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True # Pydantic V2+

# --- Схемы для Комментариев ---
class CommentBase(BaseModel):
    """Базовая схема для комментария (данные для создания)."""
    content: str

class CommentCreate(CommentBase):
    """Схема для создания комментария (post_id берется из URL)."""
    pass

class Comment(CommentBase):
    """Схема для отображения комментария."""
    id: int
    author: UserInfo # Используем простую схему автора
    post_id: int
    timestamp: datetime

    class Config:
        from_attributes = True # Pydantic V2+

# --- Схемы для Постов ---
class PostBase(BaseModel):
    """Базовая схема для поста."""
    content: str
    image_url: Optional[str] = None # Пока опционально, т.к. загрузка не реализована

class PostCreate(PostBase):
    """Схема для создания поста (author_id берется из токена)."""
    pass

class Post(PostBase):
    """Схема для отображения поста."""
    id: int
    author: UserInfo # Используем простую схему автора
    timestamp: datetime
    # Включаем список лайкнувших (простая инфа) и комментарии
    liked_by_users: List[UserInfo] = Field(default_factory=list)
    comments: List[Comment] = Field(default_factory=list)
    # Добавим поле для количества лайков (рассчитывается в CRUD или роутере)
    likes_count: int = 0

    class Config:
        from_attributes = True # Pydantic V2+

# --- Схемы для Пользователей ---
class UserBase(BaseModel):
    """Базовая схема пользователя."""
    username: str
    email: EmailStr
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None

class UserCreate(UserBase):
    """Схема для регистрации пользователя."""
    password: str # Пароль получаем при создании

class UserUpdate(BaseModel):
    """Схема для обновления данных пользователя (через PUT /api/users/me)."""
    email: Optional[EmailStr] = None
    nickname: Optional[str] = None
    password: Optional[str] = None # Позволяем менять пароль
    # avatar_url обновляется через отдельный эндпоинт /api/users/me/avatar

class User(UserBase):
    """Полная схема пользователя для ответа (например, для /api/users/me)."""
    id: int
    is_active: bool
    is_admin: bool
    created_at: datetime
    # Не включаем все посты/чаты/сообщения/лайки по умолчанию
    # Добавим счетчики и списки друзей/подписчиков (рассчитываются в роутере)
    following: List[UserInfo] = Field(default_factory=list) # На кого подписан
    followers: List[UserInfo] = Field(default_factory=list) # Кто подписан
    posts_count: int = 0
    followers_count: int = 0
    following_count: int = 0

    class Config:
        from_attributes = True # Pydantic V2+

class UserPublicProfile(BaseModel):
    """Схема для публичного профиля пользователя (GET /api/users/{username})."""
    id: int
    username: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    posts: List[Post] = Field(default_factory=list) # Посты пользователя для его страницы
    posts_count: int = 0
    followers_count: int = 0
    following_count: int = 0
    # Флаг, подписан ли текущий пользователь на этого (устанавливается в роутере)
    is_following: bool = False

    class Config:
        from_attributes = True # Pydantic V2+


# --- Схемы для Сообщений ---
class MessageBase(BaseModel):
    """Базовая схема сообщения."""
    content: str
    file_url: Optional[str] = None # Пока не используется активно

class MessageCreate(MessageBase):
    """Схема для создания сообщения (используется в CRUD)."""
    chat_id: int

class Message(MessageBase):
    """Схема для отображения сообщения."""
    id: int
    author: UserInfo
    chat_id: int
    timestamp: datetime

    class Config:
        from_attributes = True # Pydantic V2+

# --- Схемы для Чатов ---
class ChatBase(BaseModel):
    """Базовая схема чата."""
    name: Optional[str] = None # Имя обязательно для групповых чатов

class ChatCreate(ChatBase):
    """Схема для создания группового чата."""
    # При создании группового чата можно сразу добавить участников (кроме создателя)
    participant_ids: Optional[List[int]] = None

# Схема для информации о чате в списке (GET /api/chats/)
class ChatInfo(BaseModel):
    id: int
    name: Optional[str] = None
    is_private: bool
    # Последнее сообщение для превью (устанавливается в CRUD/роутере)
    last_message: Optional[Message] = None
    # Участники для отображения в списке (простая инфа)
    participants: List[UserInfo] = Field(default_factory=list)

    class Config:
        from_attributes = True # Pydantic V2+

class Chat(ChatBase):
    """Полная информация о чате (GET /api/chats/{chat_id})."""
    id: int
    created_at: datetime
    is_private: bool
    # Участники (простая инфа)
    participants: List[UserInfo] = Field(default_factory=list)
    # Сообщения загружаются отдельно или включаются при запросе
    messages: List[Message] = Field(default_factory=list) # Для инициализации или при запросе деталей

    class Config:
        from_attributes = True # Pydantic V2+


# --- Схемы для Аутентификации ---
class Token(BaseModel):
    """Схема для ответа с JWT токеном."""
    access_token: str
    token_type: str

class TokenData(BaseModel):
    """Схема для данных, извлекаемых из JWT токена."""
    username: Optional[str] = None