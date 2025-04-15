# app/routers/chats.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from .. import crud, schemas, models, auth
from ..database import get_db

router = APIRouter(
    prefix="/chats",
    tags=["chats"],
    dependencies=[Depends(auth.get_current_active_user)],
)

# --- Создание ГРУППОВОГО чата ---
@router.post("/group", response_model=schemas.ChatInfo, status_code=status.HTTP_201_CREATED)
def create_group_chat_endpoint(
    chat_data: schemas.ChatCreate, # Используем ChatCreate для группы
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    """Создает новый ГРУППОВОЙ чат."""
    if not chat_data.name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group chat name is required")

    created_chat = crud.create_group_chat(db=db, chat_data=chat_data, creator_id=current_user.id)
    # Добавим последнее сообщение (пока None) и участников для ChatInfo
    created_chat.last_message = None
    return created_chat # Pydantic конвертирует в ChatInfo

# --- Получение или создание ЛИЧНОГО чата ---
@router.post("/direct/{target_username}", response_model=schemas.ChatInfo, status_code=status.HTTP_200_OK) # OK, т.к. может вернуть существующий
def get_or_create_direct_chat(
    target_username: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    """Находит существующий или создает новый ЛИЧНЫЙ чат с пользователем target_username."""
    target_user = crud.get_user_by_username(db, username=target_username)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found")
    if target_user.id == current_user.id:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot create chat with yourself")

    # Ищем или создаем приватный чат
    chat = crud.create_private_chat(db=db, user1=current_user, user2=target_user)

    # Получаем последнее сообщение для ChatInfo
    chat.last_message = crud.get_messages_for_chat(db, chat_id=chat.id, limit=1)[0] if chat.messages else None
    # Загрузим участников для ChatInfo (если не загружены в create_private_chat)
    db.refresh(chat, attribute_names=['participants'])

    return chat # Pydantic конвертирует в ChatInfo


# --- Список чатов пользователя ---
@router.get("/", response_model=List[schemas.ChatInfo])
def read_user_chats(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    """Получает список чатов (ChatInfo) пользователя."""
    chats = crud.get_user_chats(db=db, user_id=current_user.id, skip=skip, limit=limit)
    # CRUD уже добавляет last_message и participants
    return chats # Pydantic конвертирует список models.Chat в List[schemas.ChatInfo]

# --- Получение конкретного чата (инфо + последние сообщения) ---
@router.get("/{chat_id}", response_model=schemas.Chat) # Возвращаем полную схему Chat
def read_chat(
    chat_id: int,
    limit_messages: int = 50, # Параметр для кол-ва загружаемых сообщений
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    db_chat = crud.get_chat(db, chat_id=chat_id)
    if db_chat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    # Проверяем участие пользователя
    if current_user not in db_chat.participants:
         # Нужно проверить ID, т.к. объекты могут быть разными из-за сессий
         participant_ids = {p.id for p in db_chat.participants}
         if current_user.id not in participant_ids:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    # Загружаем сообщения для этого чата
    messages = crud.get_messages_for_chat(db, chat_id=chat_id, limit=limit_messages)
    db_chat.messages = messages # Добавляем в объект для сериализации в схему Chat

    # Убедимся что участники загружены (на всякий случай)
    db.refresh(db_chat, attribute_names=['participants'])

    return db_chat # Pydantic конвертирует в schemas.Chat

# --- Отправка сообщения ---
@router.post("/{chat_id}/messages", response_model=schemas.Message, status_code=status.HTTP_201_CREATED)
def create_message_in_chat(
    chat_id: int,
    message_data: schemas.MessageBase, # Используем Base, т.к. chat_id из пути
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    db_chat = crud.get_chat(db, chat_id=chat_id) # Проверка существования чата
    if db_chat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

    # Проверка участия пользователя
    participant_ids = {p.id for p in db_chat.participants}
    if current_user.id not in participant_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this chat")

    message_create = schemas.MessageCreate(**message_data.dict(), chat_id=chat_id)
    new_message = crud.create_message(db=db, message=message_create, author_id=current_user.id)
    # CRUD уже загружает автора
    return new_message # Pydantic конвертирует в schemas.Message

# --- Получение сообщений (с пагинацией) ---
@router.get("/{chat_id}/messages", response_model=List[schemas.Message])
def read_messages_in_chat(
    chat_id: int,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    db_chat = crud.get_chat(db, chat_id=chat_id)
    if db_chat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    # Проверка участия
    participant_ids = {p.id for p in db_chat.participants}
    if current_user.id not in participant_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    messages = crud.get_messages_for_chat(db=db, chat_id=chat_id, skip=skip, limit=limit)
    return messages # Pydantic конвертирует

# --- Добавление участника в ГРУППОВОЙ чат ---
@router.post("/{chat_id}/participants/{username_to_add}", response_model=schemas.ChatInfo)
def add_participant_to_chat(
    chat_id: int,
    username_to_add: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    user_to_add = crud.get_user_by_username(db, username=username_to_add)
    if not user_to_add:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User to add not found")

    # Используем crud.add_user_to_chat, который проверяет, что чат не приватный
    updated_chat = crud.add_user_to_chat(db, chat_id=chat_id, user_id=user_to_add.id)

    if updated_chat is None:
        # Это может случиться, если чат не найден, пользователь уже в чате, или чат приватный
        # Проверим причину точнее
        db_chat = crud.get_chat(db, chat_id)
        if not db_chat:
             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
        if db_chat.is_private:
             raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot add participants to a private chat")
        # Проверим права текущего пользователя (например, только админ чата может добавлять?)
        # Пока разрешаем всем участникам
        participant_ids = {p.id for p in db_chat.participants}
        if current_user.id not in participant_ids:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot add participants to this chat")
        if user_to_add.id in participant_ids:
             raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already in the chat")
        # Другая ошибка
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not add user to chat")

    # Добавим последнее сообщение для ChatInfo
    updated_chat.last_message = crud.get_messages_for_chat(db, chat_id=chat_id, limit=1)[0] if updated_chat.messages else None
    return updated_chat # Pydantic конвертирует в ChatInfo