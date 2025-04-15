# app/crud.py
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import select, func, and_
from . import models, schemas
from .auth import get_password_hash
from typing import List, Optional

# --- Пользователи ---
def get_user(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email).first()

def get_user_by_username(db: Session, username: str) -> Optional[models.User]:
    # Загружаем связи для подсчета
    return db.query(models.User).options(
        selectinload(models.User.following),
        selectinload(models.User.followers),
        selectinload(models.User.posts) # Посты для профиля
    ).filter(models.User.username == username).first()


def get_users(db: Session, skip: int = 0, limit: int = 100) -> List[models.User]:
    return db.query(models.User).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate) -> models.User:
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        nickname=user.nickname or user.username,
        avatar_url=user.avatar_url # Может быть None
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, db_user: models.User, user_update: schemas.UserUpdate) -> models.User:
    update_data = user_update.dict(exclude_unset=True) # Берем только переданные поля
    if "password" in update_data:
        hashed_password = get_password_hash(update_data["password"])
        db_user.hashed_password = hashed_password
    if "email" in update_data:
        db_user.email = update_data["email"]
    if "nickname" in update_data:
        db_user.nickname = update_data["nickname"]
    # Аватар обновляется отдельно
    db.commit()
    db.refresh(db_user)
    return db_user

def update_avatar(db: Session, db_user: models.User, avatar_url: str) -> models.User:
     db_user.avatar_url = avatar_url
     db.commit()
     db.refresh(db_user)
     return db_user

# --- Друзья (Подписки) ---

def add_follow(db: Session, follower: models.User, followed: models.User) -> bool:
    """Подписывает follower на followed."""
    if followed not in follower.following:
        follower.following.append(followed)
        db.commit()
        return True
    return False # Уже подписан

def remove_follow(db: Session, follower: models.User, followed: models.User) -> bool:
    """Отписывает follower от followed."""
    if followed in follower.following:
        follower.following.remove(followed)
        db.commit()
        return True
    return False # Не был подписан

def get_following(db: Session, user: models.User) -> List[models.User]:
    """Возвращает список тех, на кого подписан user."""
    # Убедимся, что данные загружены (если не были загружены ранее)
    db.refresh(user, attribute_names=['following'])
    return user.following

def get_followers(db: Session, user: models.User) -> List[models.User]:
    """Возвращает список подписчиков user."""
    db.refresh(user, attribute_names=['followers'])
    return user.followers

def is_following(db: Session, follower: models.User, followed: models.User) -> bool:
    """Проверяет, подписан ли follower на followed."""
    # Это можно сделать и без загрузки всего списка, через exists, но для простоты:
    db.refresh(follower, attribute_names=['following'])
    return followed in follower.following


# --- Чаты ---
def get_chat(db: Session, chat_id: int) -> Optional[models.Chat]:
    """
    Получает объект чата по ID.
    Жадно загружает участников (participants).
    Сообщения и last_message здесь НЕ загружаются для оптимизации.
    Их следует загружать отдельно при необходимости в роутерах/эндпоинтах.
    """
    return db.query(models.Chat).options(
        selectinload(models.Chat.participants) # Загружаем участников жадно
    ).filter(models.Chat.id == chat_id).first()

def get_private_chat_between_users(db: Session, user1_id: int, user2_id: int) -> Optional[models.Chat]:
    """Находит приватный чат между двумя пользователями."""
    # Ищем чат, где is_private=True и участников ровно 2, и это наши user1 и user2
    return db.query(models.Chat).join(models.user_chat_association).filter(
        models.Chat.is_private == True,
        models.user_chat_association.c.user_id.in_([user1_id, user2_id])
    ).group_by(models.Chat.id).having(func.count(models.user_chat_association.c.user_id) == 2).first()


def get_user_chats(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[models.Chat]:
    user = get_user(db, user_id)
    if not user:
        return []

    # Загружаем чаты с участниками и последним сообщением
    query = db.query(models.Chat).join(
        models.user_chat_association
    ).filter(
        models.user_chat_association.c.user_id == user_id
    ).options(
        selectinload(models.Chat.participants), # Загружаем всех участников
        # Загружаем последнее сообщение в каждом чате (сложнее, может требовать подзапрос)
        # Простой вариант: загрузить позже или оставить как есть (будет N+1 запрос для last_message)
        # Оптимизированный (примерный) вариант с подзапросом:
        # subq = select(models.Message.id).where(models.Message.chat_id == models.Chat.id).order_by(models.Message.timestamp.desc()).limit(1).correlate(models.Chat).scalar_subquery()
        # options(selectinload(models.Chat.messages).filter(models.Message.id == subq)) # Не совсем так, нужен join
        # Пока оставим простой вариант, ORM загрузит последнее сообщение при доступе к chat.messages[0] если order_by задан в модели
         selectinload(models.Chat.messages).load_only(models.Message.id) # Загрузим только ID, чтобы уменьшить данные
    ).order_by(
        models.Chat.created_at.desc() # Или по последнему сообщению?
    ).offset(skip).limit(limit)

    chats = query.all()

    # Загрузка последнего сообщения (если не сделано оптимизированно выше)
    for chat in chats:
         last_msg = db.query(models.Message).filter(models.Message.chat_id == chat.id).order_by(models.Message.timestamp.desc()).first()
         chat.last_message = last_msg # Добавляем атрибут для схемы ChatInfo

    return chats


def create_group_chat(db: Session, chat_data: schemas.ChatCreate, creator_id: int) -> models.Chat:
    """Создает групповой чат."""
    creator = get_user(db, creator_id)
    if not creator:
        raise ValueError("Creator not found") # Или другая ошибка

    db_chat = models.Chat(name=chat_data.name, is_private=False)
    db.add(db_chat)
    db.flush() # Получаем ID чата

    # Добавляем создателя
    db_chat.participants.append(creator)

    # Добавляем других участников
    if chat_data.participant_ids:
        participants_to_add = db.query(models.User).filter(models.User.id.in_(chat_data.participant_ids)).all()
        for user in participants_to_add:
            if user not in db_chat.participants:
                db_chat.participants.append(user)

    db.commit()
    db.refresh(db_chat)
    return db_chat

def create_private_chat(db: Session, user1: models.User, user2: models.User) -> models.Chat:
    """Создает приватный чат между двумя пользователями."""
    existing_chat = get_private_chat_between_users(db, user1.id, user2.id)
    if existing_chat:
        return existing_chat # Возвращаем существующий

    # Создаем новый приватный чат без имени
    db_chat = models.Chat(is_private=True)
    db.add(db_chat)
    db.flush()

    # Добавляем обоих участников
    db_chat.participants.append(user1)
    db_chat.participants.append(user2)

    db.commit()
    db.refresh(db_chat)
    return db_chat


def add_user_to_chat(db: Session, chat_id: int, user_id: int) -> Optional[models.Chat]:
    chat = get_chat(db, chat_id)
    user = get_user(db, user_id)
    if not chat or not user or chat.is_private: # Нельзя добавлять в приватные
        return None
    if user not in chat.participants:
        chat.participants.append(user)
        db.commit()
        db.refresh(chat)
    return chat


# --- Сообщения ---
def get_messages_for_chat(db: Session, chat_id: int, skip: int = 0, limit: int = 50) -> List[models.Message]:
    return db.query(models.Message).options(
        joinedload(models.Message.author) # Загружаем автора сразу
        ).filter(models.Message.chat_id == chat_id)\
         .order_by(models.Message.timestamp.desc())\
         .offset(skip)\
         .limit(limit)\
         .all()

def create_message(db: Session, message: schemas.MessageCreate, author_id: int) -> models.Message:
    db_message = models.Message(
        content=message.content,
        file_url=message.file_url,
        chat_id=message.chat_id,
        author_id=author_id
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
     # Загрузим автора для ответа
    db.refresh(db_message, attribute_names=['author'])
    return db_message

# --- Посты ---
def create_post(db: Session, post: schemas.PostCreate, author_id: int) -> models.Post:
    db_post = models.Post(**post.dict(), author_id=author_id)
    db.add(db_post)
    db.commit()
    db.refresh(db_post)
    db.refresh(db_post, attribute_names=['author']) # Загрузим автора
    return db_post

def get_post(db: Session, post_id: int, current_user_id: Optional[int] = None) -> Optional[models.Post]:
    """Получает пост, загружая лайки и комментарии."""
    query = db.query(models.Post).options(
        joinedload(models.Post.author),
        selectinload(models.Post.liked_by_users), # Используем selectinload для many-to-many
        selectinload(models.Post.comments).joinedload(models.Comment.author) # Загружаем комменты и их авторов
    ).filter(models.Post.id == post_id)

    db_post = query.first()
    if db_post:
         # Добавим количество лайков для схемы
         db_post.likes_count = len(db_post.liked_by_users)
    return db_post

def get_posts(db: Session, skip: int = 0, limit: int = 20) -> List[models.Post]:
    """Получает список постов для общей ленты."""
    posts = db.query(models.Post).options(
        joinedload(models.Post.author),
        selectinload(models.Post.liked_by_users), # Загрузка лайков
        # Комментарии грузить не будем в общем списке, только их количество
        # selectinload(models.Post.comments) # - Опционально
    ).order_by(models.Post.timestamp.desc()).offset(skip).limit(limit).all()
    # Добавим количество лайков
    for post in posts:
        post.likes_count = len(post.liked_by_users)
    return posts

def get_user_posts(db: Session, user_id: int, skip: int = 0, limit: int = 20) -> List[models.Post]:
    """Получает посты конкретного пользователя."""
    posts = db.query(models.Post).options(
        joinedload(models.Post.author),
        selectinload(models.Post.liked_by_users),
    ).filter(models.Post.author_id == user_id)\
     .order_by(models.Post.timestamp.desc())\
     .offset(skip)\
     .limit(limit)\
     .all()
    for post in posts:
         post.likes_count = len(post.liked_by_users)
    return posts

def delete_post(db: Session, post: models.Post) -> None:
    db.delete(post)
    db.commit()


# --- Лайки ---
def like_post(db: Session, user: models.User, post: models.Post) -> bool:
    if user not in post.liked_by_users:
        post.liked_by_users.append(user)
        db.commit()
        return True
    return False # Уже лайкнул

def unlike_post(db: Session, user: models.User, post: models.Post) -> bool:
    if user in post.liked_by_users:
        post.liked_by_users.remove(user)
        db.commit()
        return True
    return False # Лайка не было


# --- Комментарии ---
def create_comment(db: Session, comment: schemas.CommentCreate, post_id: int, author_id: int) -> models.Comment:
    db_comment = models.Comment(**comment.dict(), post_id=post_id, author_id=author_id)
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    db.refresh(db_comment, attribute_names=['author']) # Загрузим автора
    return db_comment

def get_comment(db: Session, comment_id: int) -> Optional[models.Comment]:
    return db.query(models.Comment).filter(models.Comment.id == comment_id).first()

def get_post_comments(db: Session, post_id: int, skip: int = 0, limit: int = 50) -> List[models.Comment]:
    return db.query(models.Comment).options(
        joinedload(models.Comment.author)
        ).filter(models.Comment.post_id == post_id)\
         .order_by(models.Comment.timestamp.asc())\
         .offset(skip)\
         .limit(limit)\
         .all()

def delete_comment(db: Session, comment: models.Comment) -> None:
    db.delete(comment)
    db.commit()