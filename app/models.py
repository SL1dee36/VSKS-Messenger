# app/models.py
import datetime
from sqlalchemy import (Boolean, Column, ForeignKey, Integer, String, Text,
                        DateTime, Table, MetaData)
from sqlalchemy.orm import relationship, Mapped, mapped_column # Используем новый синтаксис Mapped
from sqlalchemy.sql import func
from .database import Base

# --- Ассоциативные таблицы ---

# Связь Пользователь-Чат (без изменений)
user_chat_association = Table(
    'user_chat_association', Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id', ondelete="CASCADE"), primary_key=True),
    Column('chat_id', Integer, ForeignKey('chats.id', ondelete="CASCADE"), primary_key=True)
)

# Связь Пользователь-Пользователь (Дружба)
# Делаем ее однонаправленной для простоты (один пользователь подписывается на другого)
# Если нужна взаимная дружба, логику нужно усложнять (например, статусы: pending, accepted)
friendship_association = Table(
    'friendships', Base.metadata,
    # Тот, кто подписывается (фолловер)
    Column('follower_id', Integer, ForeignKey('users.id', ondelete="CASCADE"), primary_key=True),
    # Тот, на кого подписываются
    Column('followed_id', Integer, ForeignKey('users.id', ondelete="CASCADE"), primary_key=True)
)


# Связь Пользователь-Пост (Лайки)
post_likes_association = Table(
    'post_likes', Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id', ondelete="CASCADE"), primary_key=True),
    Column('post_id', Integer, ForeignKey('posts.id', ondelete="CASCADE"), primary_key=True)
)


# --- Основные Модели ---

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    nickname: Mapped[str | None] = mapped_column(String, index=True)
    avatar_url: Mapped[str | None] = mapped_column(String)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Связи
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="author")
    chats: Mapped[list["Chat"]] = relationship("Chat", secondary=user_chat_association, back_populates="participants")
    posts: Mapped[list["Post"]] = relationship("Post", back_populates="author", cascade="all, delete-orphan")
    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="author", cascade="all, delete-orphan")

    # Друзья (Те, на кого подписан текущий пользователь)
    following: Mapped[list["User"]] = relationship(
        "User",
        secondary=friendship_association,
        primaryjoin=(friendship_association.c.follower_id == id),
        secondaryjoin=(friendship_association.c.followed_id == id),
        back_populates="followers"
    )

    # Подписчики (Те, кто подписан на текущего пользователя)
    followers: Mapped[list["User"]] = relationship(
        "User",
        secondary=friendship_association,
        primaryjoin=(friendship_association.c.followed_id == id),
        secondaryjoin=(friendship_association.c.follower_id == id),
        back_populates="following"
    )

    # Посты, которые лайкнул пользователь
    liked_posts: Mapped[list["Post"]] = relationship("Post", secondary=post_likes_association, back_populates="liked_by_users")


class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str | None] = mapped_column(String, index=True)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False) # Флаг для личных чатов
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Связи
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="chat", order_by="Message.timestamp", cascade="all, delete-orphan")
    participants: Mapped[list["User"]] = relationship("User", secondary=user_chat_association, back_populates="chats")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    file_url: Mapped[str | None] = mapped_column(String)

    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    chat_id: Mapped[int] = mapped_column(Integer, ForeignKey("chats.id", ondelete="CASCADE"), nullable=False)

    # Связи
    author: Mapped["User"] = relationship("User", back_populates="messages")
    chat: Mapped["Chat"] = relationship("Chat", back_populates="messages")


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Связи
    author: Mapped["User"] = relationship("User", back_populates="posts")
    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="post", cascade="all, delete-orphan")
    liked_by_users: Mapped[list["User"]] = relationship("User", secondary=post_likes_association, back_populates="liked_posts")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)

    # Связи
    author: Mapped["User"] = relationship("User", back_populates="comments")
    post: Mapped["Post"] = relationship("Post", back_populates="comments")