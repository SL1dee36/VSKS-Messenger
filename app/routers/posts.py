# app/routers/posts.py (НОВЫЙ ФАЙЛ)
from datetime import datetime
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import crud, schemas, models, auth
from ..database import get_db

router = APIRouter(
    prefix="/posts",
    tags=["posts & comments"],
    # Некоторые эндпоинты могут быть публичными (чтение), другие требуют авторизации
)

# --- Папка для загрузки изображений постов ---
UPLOAD_POST_DIR = Path("static/uploads/posts")
UPLOAD_POST_DIR.mkdir(parents=True, exist_ok=True)

# --- Создать пост ---
# Используем Form для текста и File для изображения
@router.post("/", response_model=schemas.Post, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(auth.get_current_active_user)]) # Требует авторизации
async def create_new_post(
    content: str = Form(...),
    image: Optional[UploadFile] = File(None), # Изображение опционально
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    image_url: Optional[str] = None
    if image:
        # Проверка типа файла
        allowed_mime_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
        if image.content_type not in allowed_mime_types:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image type for post")

        # Генерация имени и сохранение
        file_extension = image.filename.split(".")[-1] if "." in image.filename else "jpg"
        filename = f"post_{current_user.id}_{int(datetime.utcnow().timestamp())}.{file_extension}"
        file_path = UPLOAD_POST_DIR / filename
        image_url = f"/static/uploads/posts/{filename}"

        try:
            with file_path.open("wb") as buffer:
                shutil.copyfileobj(image.file, buffer)
        except Exception as e:
            print(f"Error saving post image: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save post image")
        finally:
            if image.file:
                 image.file.close()

    post_create = schemas.PostCreate(content=content, image_url=image_url)
    new_post = crud.create_post(db=db, post=post_create, author_id=current_user.id)
    new_post.likes_count = 0 # Инициализация для ответа
    return new_post

# --- Получить ленту постов (все посты) ---
@router.get("/", response_model=List[schemas.Post])
def read_posts_feed(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db)
    # Можно добавить зависимость от current_user, если лента должна быть персонализированной
):
    posts = crud.get_posts(db=db, skip=skip, limit=limit)
    # CRUD уже добавляет likes_count
    return posts

# --- Получить конкретный пост ---
@router.get("/{post_id}", response_model=schemas.Post)
def read_post_details(
    post_id: int,
    db: Session = Depends(get_db)
    # current_user: Optional[models.User] = Depends(auth.get_current_user) # Если нужно знать, лайкнул ли текущий юзер
):
    db_post = crud.get_post(db, post_id=post_id) # CRUD загружает автора, лайки, комменты
    if db_post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    # CRUD уже добавляет likes_count
    return db_post

# --- Удалить пост ---
@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_own_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    db_post = crud.get_post(db, post_id=post_id)
    if db_post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if db_post.author_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to delete this post")

    crud.delete_post(db=db, post=db_post)
    return

# --- Лайкнуть пост ---
@router.post("/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(auth.get_current_active_user)])
def like_a_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    db_post = crud.get_post(db, post_id=post_id) # Нужен только ID, но get_post удобен для проверки существования
    if db_post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    success = crud.like_post(db=db, user=current_user, post=db_post)
    # if not success: # Уже лайкнул - игнорируем
    #     pass
    return

# --- Снять лайк с поста ---
@router.delete("/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(auth.get_current_active_user)])
def unlike_a_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    db_post = crud.get_post(db, post_id=post_id)
    if db_post is None:
        # Важно: если поста нет, не давать ошибку 404, а просто вернуть 204 (идемпотентность)
        return
        # raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    success = crud.unlike_post(db=db, user=current_user, post=db_post)
    # if not success: # Лайка не было - игнорируем
    #     pass
    return

# --- Добавить комментарий к посту ---
@router.post("/{post_id}/comments", response_model=schemas.Comment, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(auth.get_current_active_user)])
def create_new_comment(
    post_id: int,
    comment_data: schemas.CommentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    # Проверяем существование поста
    db_post = crud.get_post(db, post_id=post_id)
    if db_post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    new_comment = crud.create_comment(db=db, comment=comment_data, post_id=post_id, author_id=current_user.id)
    return new_comment

# --- Получить комментарии поста ---
@router.get("/{post_id}/comments", response_model=List[schemas.Comment])
def read_post_comments(
    post_id: int,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    # Проверяем существование поста
    db_post = crud.get_post(db, post_id=post_id)
    if db_post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    comments = crud.get_post_comments(db=db, post_id=post_id, skip=skip, limit=limit)
    return comments

# --- Удалить комментарий ---
@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_own_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    db_comment = crud.get_comment(db, comment_id=comment_id)
    if db_comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    # Проверка прав: автор комментария или автор поста (или админ)
    can_delete = (
        db_comment.author_id == current_user.id or
        (db_comment.post and db_comment.post.author_id == current_user.id) or
        current_user.is_admin
    )

    if not can_delete:
         raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to delete this comment")

    crud.delete_comment(db=db, comment=db_comment)
    return