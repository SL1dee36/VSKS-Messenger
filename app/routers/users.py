# app/routers/users.py
import shutil
import os
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import List, Optional

from .. import crud, schemas, models, auth
from ..database import get_db

router = APIRouter(
    prefix="/users",
    tags=["users"],
)

# --- Папка для загрузки аватарок ---
UPLOAD_DIR = Path("static/uploads/avatars")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True) # Создаем папку, если ее нет

# --- Регистрация ---
@router.post("/", response_model=schemas.UserInfo, status_code=status.HTTP_201_CREATED) # Возвращаем UserInfo
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user_by_email = crud.get_user_by_email(db, email=user.email)
    if db_user_by_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    db_user_by_username = crud.get_user_by_username(db, username=user.username)
    if db_user_by_username:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
    new_user = crud.create_user(db=db, user=user)
    return new_user # Pydantic автоматически преобразует

# --- Получение токена (Логин) ---
@router.post("/token", response_model=schemas.Token, tags=["authentication"]) # Отдельный тег
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user or not user.is_active: # Проверяем активность
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password or inactive user",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# --- Текущий пользователь ---
@router.get("/me", response_model=schemas.User) # Полная схема для /me
async def read_users_me(
    current_user: models.User = Depends(auth.get_current_active_user),
    db: Session = Depends(get_db) # Добавим сессию для подсчетов
    ):
    """Получение информации о текущем авторизованном пользователе."""
    # Подсчеты (можно вынести в crud)
    followers_count = len(current_user.followers)
    following_count = len(current_user.following)
    posts_count = len(current_user.posts)

    # Создаем Pydantic объект с подсчетами
    user_data = schemas.User.from_orm(current_user)
    user_data.followers_count = followers_count
    user_data.following_count = following_count
    user_data.posts_count = posts_count

    return user_data

# --- Обновление текущего пользователя ---
@router.put("/me", response_model=schemas.User)
async def update_user_me(
    user_update: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    # Проверка уникальности email, если он меняется
    if user_update.email and user_update.email != current_user.email:
        existing_user = crud.get_user_by_email(db, email=user_update.email)
        if existing_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    # Проверка пароля и т.д. (можно добавить старый пароль для смены)

    updated_user = crud.update_user(db=db, db_user=current_user, user_update=user_update)
     # Возвращаем обновленные данные с подсчетами
    followers_count = len(updated_user.followers)
    following_count = len(updated_user.following)
    posts_count = len(updated_user.posts)
    user_data = schemas.User.from_orm(updated_user)
    user_data.followers_count = followers_count
    user_data.following_count = following_count
    user_data.posts_count = posts_count
    return user_data


# --- Загрузка аватара ---
@router.put("/me/avatar", response_model=schemas.User)
async def update_avatar_me(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    # Проверка типа файла
    allowed_mime_types = ["image/jpeg", "image/png", "image/gif"]
    if file.content_type not in allowed_mime_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image type")

    # Генерация имени файла (чтобы избежать коллизий)
    file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    # Используем ID пользователя для уникальности + таймстемп на всякий случай
    filename = f"{current_user.id}_{int(datetime.utcnow().timestamp())}.{file_extension}"
    file_path = UPLOAD_DIR / filename
    file_url = f"/static/uploads/avatars/{filename}" # URL для доступа к файлу

    # Сохранение файла
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        print(f"Error saving avatar: {e}") # Логирование
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save avatar")
    finally:
        file.file.close() # Важно закрыть файл

    # Обновление URL аватара в БД
    updated_user = crud.update_avatar(db=db, db_user=current_user, avatar_url=file_url)

    # Возвращаем обновленные данные пользователя с подсчетами
    followers_count = len(updated_user.followers)
    following_count = len(updated_user.following)
    posts_count = len(updated_user.posts)
    user_data = schemas.User.from_orm(updated_user)
    user_data.followers_count = followers_count
    user_data.following_count = following_count
    user_data.posts_count = posts_count
    return user_data


# --- Публичный профиль пользователя ---
@router.get("/{username}", response_model=schemas.UserPublicProfile)
def read_user_profile(
    username: str,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(auth.get_current_user) # Опционально, для флага is_following
):
    db_user = crud.get_user_by_username(db, username=username)
    if db_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Загрузка постов пользователя
    user_posts = crud.get_user_posts(db, user_id=db_user.id, limit=20) # Показываем последние 20

    # Проверка подписки текущего пользователя
    is_following = False
    if current_user:
        is_following = crud.is_following(db, follower=current_user, followed=db_user)

    # Подсчеты
    followers_count = len(db_user.followers)
    following_count = len(db_user.following)
    posts_count = len(db_user.posts) # Или через count() запрос к БД для оптимизации

    # Формируем ответ
    profile_data = schemas.UserPublicProfile(
        id=db_user.id,
        username=db_user.username,
        nickname=db_user.nickname,
        avatar_url=db_user.avatar_url,
        created_at=db_user.created_at,
        posts=user_posts, # Pydantic сам конвертирует список моделей Post
        posts_count=posts_count,
        followers_count=followers_count,
        following_count=following_count,
        is_following=is_following
    )

    return profile_data