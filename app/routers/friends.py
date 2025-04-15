# app/routers/friends.py (НОВЫЙ ФАЙЛ)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from .. import crud, schemas, models, auth
from ..database import get_db

router = APIRouter(
    prefix="/friends",
    tags=["friends"],
    dependencies=[Depends(auth.get_current_active_user)], # Все эндпоинты требуют авторизации
)

# --- Подписаться на пользователя ---
@router.post("/follow/{username_to_follow}", status_code=status.HTTP_204_NO_CONTENT)
def follow_user(
    username_to_follow: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    user_to_follow = crud.get_user_by_username(db, username=username_to_follow)
    if not user_to_follow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User to follow not found")
    if user_to_follow.id == current_user.id:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot follow yourself")

    success = crud.add_follow(db, follower=current_user, followed=user_to_follow)
    if not success:
        # Уже подписан, но это не ошибка, можно вернуть 204 или 200
        pass # Просто ничего не делаем, запрос идемпотентен
    return # Возвращаем 204 No Content

# --- Отписаться от пользователя ---
@router.delete("/unfollow/{username_to_unfollow}", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_user(
    username_to_unfollow: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    user_to_unfollow = crud.get_user_by_username(db, username=username_to_unfollow)
    if not user_to_unfollow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User to unfollow not found")

    success = crud.remove_follow(db, follower=current_user, followed=user_to_unfollow)
    if not success:
        # Не был подписан, но это не ошибка, можно вернуть 204 или 404 (спорно)
        pass # Идемпотентность, возвращаем 204
    return # Возвращаем 204 No Content

# --- Получить список тех, на кого подписан текущий пользователь ---
@router.get("/following", response_model=List[schemas.UserInfo])
def get_my_following(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    following_list = crud.get_following(db, user=current_user)
    return following_list # Pydantic конвертирует список models.User в List[schemas.UserInfo]

# --- Получить список подписчиков текущего пользователя ---
@router.get("/followers", response_model=List[schemas.UserInfo])
def get_my_followers(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    followers_list = crud.get_followers(db, user=current_user)
    return followers_list # Pydantic конвертирует