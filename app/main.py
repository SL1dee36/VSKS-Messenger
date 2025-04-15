# app/main.py
from fastapi import ( # Импорты из fastapi/starlette в первую очередь
    FastAPI,
    Depends,
    Request,
    HTTPException,
    status # <-- ДОБАВЛЕНО ЗДЕСЬ
)
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
import os
from jose import JWTError, jwt # Добавили импорт для middleware

# Импорты твоего приложения
from . import models, schemas, crud, auth
from .database import engine, SessionLocal, get_db, Base
from .routers import users, chats, posts, friends

# Создаем таблицы в БД
try:
    Base.metadata.create_all(bind=engine)
    print("Database tables created/updated successfully.")
except Exception as e:
    print(f"Error creating/updating database tables: {e}")

# --- Настройка FastAPI ---
app = FastAPI(
    title="Messenger & Social API",
    description="API для мессенджера с элементами соцсети",
    version="0.2.0",
)

# --- Монтирование статических файлов ---
static_dir = os.path.join(os.path.dirname(__file__), "../static")
if not os.path.isdir(static_dir):
     print(f"Warning: Static directory not found at {static_dir}. Creating it.")
     os.makedirs(static_dir, exist_ok=True)
     os.makedirs(os.path.join(static_dir, "css"), exist_ok=True)
     os.makedirs(os.path.join(static_dir, "js"), exist_ok=True)
     os.makedirs(os.path.join(static_dir, "uploads/avatars"), exist_ok=True)
     os.makedirs(os.path.join(static_dir, "uploads/posts"), exist_ok=True)
     # Создаем папку для дефолтных изображений, если ее нет
     os.makedirs(os.path.join(static_dir, "img"), exist_ok=True)


app.mount("/static", StaticFiles(directory=static_dir), name="static")

# --- Настройка шаблонов Jinja2 ---
templates_dir = os.path.join(os.path.dirname(__file__), "../templates")
if not os.path.isdir(templates_dir):
     print(f"Warning: Templates directory not found at {templates_dir}. Creating it.")
     os.makedirs(templates_dir, exist_ok=True)
     os.makedirs(os.path.join(templates_dir, "partials"), exist_ok=True)

templates = Jinja2Templates(directory=templates_dir)


# --- Подключение API роутеров ---
app.include_router(users.router, prefix="/api")
app.include_router(chats.router, prefix="/api")
app.include_router(posts.router, prefix="/api")
app.include_router(friends.router, prefix="/api")

# --- Middleware для добавления current_user в Request (для шаблонов) ---
@app.middleware("http")
async def add_user_to_request_state(request: Request, call_next):
    token = request.cookies.get("access_token")
    user = None
    db_session = None # Инициализируем переменную для сессии
    try:
        if token:
            if token.startswith("Bearer "):
                token = token.split(" ")[1]
            try:
                payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
                username: str = payload.get("sub")
                if username:
                    db_session = SessionLocal() # Создаем сессию здесь
                    user = crud.get_user_by_username(db_session, username=username)
                    if user and not user.is_active:
                        user = None
            except JWTError:
                user = None
            except Exception as e:
                 print(f"Error fetching user in middleware: {e}")
                 user = None

        request.state.current_user = user
        response = await call_next(request)
        return response
    finally:
        if db_session: # Закрываем сессию, если она была создана
            db_session.close()


# --- Эндпоинты для рендеринга HTML страниц ---

@app.get("/", response_class=HTMLResponse, name="root")
async def read_root(request: Request):
    """Рендерит главную страницу (перенаправляет на ленту или авторизацию)."""
    if request.state.current_user:
        return RedirectResponse(url=request.url_for('render_feed'), status_code=status.HTTP_303_SEE_OTHER) # status теперь определен
    else:
        return RedirectResponse(url=request.url_for('render_auth'), status_code=status.HTTP_303_SEE_OTHER) # status теперь определен

@app.get("/auth", response_class=HTMLResponse, name="render_auth")
async def render_auth(request: Request):
    """Рендерит страницу авторизации/регистрации."""
    if request.state.current_user:
        return RedirectResponse(url=request.url_for('render_feed'), status_code=status.HTTP_303_SEE_OTHER) # status теперь определен
    return templates.TemplateResponse("auth.html", {"request": request, "current_user": request.state.current_user}) # Передаем current_user (будет None)

@app.get("/logout", name="logout")
async def logout_and_redirect(request: Request):
    """Выход пользователя (удаление куки)."""
    response = RedirectResponse(url=request.url_for('render_auth'), status_code=status.HTTP_303_SEE_OTHER) # status теперь определен
    response.delete_cookie("access_token")
    return response


@app.get("/im", response_class=HTMLResponse, name="render_im_list")
async def render_im_list(request: Request):
    """Рендерит страницу со списком чатов."""
    current_user = request.state.current_user
    if not current_user:
        return RedirectResponse(url=request.url_for('render_auth'), status_code=status.HTTP_303_SEE_OTHER) # status теперь определен
    return templates.TemplateResponse("im.html", {"request": request, "current_user": current_user})

@app.get("/im/{chat_id}", response_class=HTMLResponse, name="render_chat")
async def render_chat(request: Request, chat_id: int, db: Session = Depends(get_db)):
    """Рендерит страницу конкретного чата."""
    current_user = request.state.current_user
    if not current_user:
        return RedirectResponse(url=request.url_for('render_auth'), status_code=status.HTTP_303_SEE_OTHER) # status теперь определен

    db_chat = crud.get_chat(db, chat_id=chat_id)
    if not db_chat:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found") # Используем импортированный status

    participant_ids = {p.id for p in db_chat.participants}
    if current_user.id not in participant_ids:
         raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access forbidden") # Используем импортированный status

    return templates.TemplateResponse("chat.html", {"request": request, "chat_id": chat_id, "current_user": current_user})


@app.get("/feed", response_class=HTMLResponse, name="render_feed")
async def render_feed(request: Request):
    """Рендерит страницу с лентой постов."""
    current_user = request.state.current_user
    if not current_user:
        return RedirectResponse(url=request.url_for('render_auth'), status_code=status.HTTP_303_SEE_OTHER) # status теперь определен
    return templates.TemplateResponse("feed.html", {"request": request, "current_user": current_user})


@app.get("/friends", response_class=HTMLResponse, name="render_friends")
async def render_friends(request: Request):
    """Рендерит страницу со списком друзей (подписок/подписчиков)."""
    current_user = request.state.current_user
    if not current_user:
        return RedirectResponse(url=request.url_for('render_auth'), status_code=status.HTTP_303_SEE_OTHER) # status теперь определен
    return templates.TemplateResponse("friends.html", {"request": request, "current_user": current_user})


@app.get("/profile/{username}", response_class=HTMLResponse, name="render_profile")
async def render_profile(request: Request, username: str, db: Session = Depends(get_db)):
    """Рендерит страницу профиля пользователя."""
    profile_user = crud.get_user_by_username(db, username=username)
    if not profile_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found") # Используем импортированный status

    return templates.TemplateResponse("profile.html", {
        "request": request,
        "profile_username": profile_user.username,
        "current_user": request.state.current_user
    })