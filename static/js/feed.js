// static/js/feed.js

document.addEventListener('DOMContentLoaded', () => {
    const feedContainer = document.getElementById('post-feed-container'); // Для ленты
    const profilePostsContainer = document.getElementById('profile-posts-container'); // Для профиля
    const postContainer = feedContainer || profilePostsContainer; // Определяем, где мы

    const createPostForm = document.getElementById('create-post-form');
    const createPostError = document.getElementById('create-post-error');
    const postContentInput = document.getElementById('post-content-input');
    // const postImageInput = document.getElementById('post-image-input');
    // const postImageFilename = document.getElementById('post-image-filename');
    const createPostButton = document.getElementById('create-post-button');

    const commentsModal = document.getElementById('comments-modal');
    const commentsModalContent = document.getElementById('comments-modal-content');
    const closeCommentsModalBtn = document.getElementById('close-comments-modal');
    const addCommentForm = document.getElementById('add-comment-form');
    const commentInput = document.getElementById('comment-input');
    const commentError = document.getElementById('comment-error');
    const commentModalPostIdInput = document.getElementById('comment-modal-post-id');

    const postCardTemplate = document.getElementById('post-card-template')?.innerHTML;

    let currentUser = window.currentUser || null; // Используем глобального пользователя, если есть

    // --- Получение текущего пользователя, если еще не загружен ---
    async function ensureCurrentUser() {
        if (!currentUser) {
            currentUser = await apiRequest('/api/users/me');
            window.currentUser = currentUser; // Сохраняем глобально
        }
        return currentUser;
    }


    // --- Отрисовка карточки поста ---
    function renderPostCard(post) {
        if (!postCardTemplate || !currentUser) return ''; // Нужен шаблон и пользователь для флага can_delete

        // Проверяем, лайкнул ли текущий пользователь пост
        const isLikedByCurrentUser = post.liked_by_users?.some(user => user.id === currentUser.id);
        // Проверяем, может ли текущий пользователь удалить пост
        const canDelete = post.author.id === currentUser.id || currentUser.is_admin;

        // Используем шаблон (простая замена плейсхолдеров, можно использовать библиотеку шаблонизации)
        let cardHtml = postCardTemplate
            .replace(/\$\{post\.id\}/g, post.id)
            .replace(/\$\{post\.author\.avatar_url \|\| .*?\}/g, escapeHTML(post.author.avatar_url || '/static/img/default_avatar.png'))
            .replace(/\$\{post\.author\.nickname \|\| post\.author\.username\}/g, escapeHTML(post.author.nickname || post.author.username))
            .replace(/\$\{post\.author\.username\}/g, escapeHTML(post.author.username))
            .replace(/\$\{ new Date\(post\.timestamp\).*?\}/g, new Date(post.timestamp).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
            .replace(/\$\{post\.content\.replace\(\/\\n\/g, '<br>'\)\}/g, escapeHTML(post.content).replace(/\n/g, '<br>'))
            // .replace(/\$\{post\.image_url\}/g, post.image_url ? `<img src="${escapeHTML(post.image_url)}" alt="Post image" class="post-image mb-3">` : '')
            .replace(/\$\{ post\.is_liked_by_current_user \? 'has-text-danger' : 'has-text-grey' \}/g, isLikedByCurrentUser ? 'has-text-danger' : 'has-text-grey')
            .replace(/\$\{post\.likes_count\}/g, post.likes_count || 0)
            .replace(/\$\{post\.comments\?\.length \|\| 0\}/g, post.comments?.length || 0)
            .replace(/\$\{ post\.can_delete \? `.*?` : ''\}/gs, canDelete ? `
                    <div class="level-item">
                         <button class="button is-danger is-small is-outlined delete-post-button" title="Удалить пост">
                            <span class="icon is-small"><i class="fas fa-trash"></i></span>
                        </button>
                    </div>` : ''); // Удаляем кнопку, если нельзя удалить


         // Добавляем data-liked атрибут для простоты переключения
         const tempDiv = document.createElement('div');
         tempDiv.innerHTML = cardHtml;
         const likeButton = tempDiv.querySelector('.like-button');
         if (likeButton) {
             likeButton.dataset.liked = isLikedByCurrentUser ? 'true' : 'false';
         }

        return tempDiv.innerHTML;
    }


    // --- Загрузка постов ---
    async function loadPosts() {
        if (!postContainer) return;
        await ensureCurrentUser(); // Убедимся, что пользователь загружен
        if (!currentUser) {
             postContainer.innerHTML = '<p class="has-text-danger">Ошибка: не удалось получить данные пользователя.</p>';
             return; // Не можем рендерить без пользователя
        }

        postContainer.innerHTML = '<div class="has-text-centered p-5"><span class="icon is-large"><i class="fas fa-spinner fa-spin fa-2x"></i></span><p>Загрузка...</p></div>';
        let posts = [];
        if (feedContainer) { // Лента
            posts = await apiRequest('/api/posts/');
        } else if (profilePostsContainer) { // Профиль
            const username = profilePostsContainer.closest('#profile-container')?.dataset.username;
            if (username) {
                 // Загрузка постов происходит в profile.js через /api/users/{username}
                 // Этот loadPosts в feed.js не должен вызываться на странице профиля напрямую
                 console.warn("loadPosts from feed.js called on profile page. This should be handled by profile.js");
                 return;
            } else {
                 console.error("Could not find username for profile posts.");
                 postContainer.innerHTML = '<p class="has-text-danger">Ошибка: не удалось определить пользователя.</p>';
                 return;
            }
        }

        if (posts && Array.isArray(posts)) {
             postContainer.innerHTML = ''; // Очищаем
             if (posts.length === 0) {
                 postContainer.innerHTML = '<p class="has-text-grey-light has-text-centered p-4">Здесь пока нет публикаций.</p>';
             } else {
                 posts.forEach(post => {
                     const postElement = document.createElement('div');
                     postElement.innerHTML = renderPostCard(post);
                     postContainer.appendChild(postElement.firstElementChild); // Добавляем сам .box
                 });
             }
        } else {
             postContainer.innerHTML = '<p class="has-text-danger">Не удалось загрузить посты.</p>';
        }
    }

    // --- Создание поста ---
    if (createPostForm) {
        /* // Обработка выбора файла (если будет загрузка картинок)
        if (postImageInput && postImageFilename) {
            postImageInput.addEventListener('change', () => {
                postImageFilename.textContent = postImageInput.files.length > 0 ? postImageInput.files[0].name : '';
            });
        }*/

        createPostForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            createPostError.textContent = '';
            const content = postContentInput.value.trim();
            // const imageFile = postImageInput.files.length > 0 ? postImageInput.files[0] : null;

            if (!content) {
                createPostError.textContent = 'Введите текст поста.';
                return;
            }

            createPostButton.classList.add('is-loading');

            // Используем FormData для отправки текста и файла
            const formData = new FormData();
            formData.append('content', content);
            // if (imageFile) {
            //     formData.append('image', imageFile);
            // }

            const result = await apiRequest('/api/posts/', 'POST', formData, true); // isFormData = true

             createPostButton.classList.remove('is-loading');

            if (result && result.id) {
                showNotification('Пост опубликован!', 'is-success');
                postContentInput.value = ''; // Очистка полей
                // postImageInput.value = null;
                // postImageFilename.textContent = '';
                // Добавляем новый пост в начало ленты (если мы на странице ленты)
                if (feedContainer) {
                     const postElement = document.createElement('div');
                     // Убедимся, что likes_count и comments инициализированы
                     result.likes_count = result.likes_count ?? 0;
                     result.comments = result.comments ?? [];
                     result.liked_by_users = result.liked_by_users ?? [];
                     postElement.innerHTML = renderPostCard(result);
                     feedContainer.prepend(postElement.firstElementChild);
                } else if (profilePostsContainer) {
                     // На странице профиля можно просто перезагрузить посты
                     const profileUsername = profilePostsContainer.closest('#profile-container')?.dataset.username;
                     if (profileUsername === currentUser?.username) { // Перезагружаем только если это наш профиль
                        loadProfilePosts(profileUsername); // Функция из profile.js
                     }
                }

            } else {
                 createPostError.textContent = 'Не удалось опубликовать пост.';
            }
        });
    }

    // --- Обработка кликов на кнопках поста (Лайк, Коммент, Удалить) ---
    if (postContainer) {
        postContainer.addEventListener('click', async (event) => {
             await ensureCurrentUser(); // Нужен пользователь для действий
             if (!currentUser) return;

             const target = event.target;
             const postCard = target.closest('.post-card');
             if (!postCard) return;
             const postId = postCard.dataset.postId;

             // --- Лайк/Дизлайк ---
             const likeButton = target.closest('.like-button');
             if (likeButton && postId) {
                 const isLiked = likeButton.dataset.liked === 'true';
                 const url = `/api/posts/${postId}/like`;
                 const method = isLiked ? 'DELETE' : 'POST';
                 const likeCountSpan = likeButton.querySelector('.like-count');
                 let currentCount = parseInt(likeCountSpan.textContent || '0', 10);

                 // Оптимистичное обновление UI
                 likeButton.classList.toggle('has-text-danger', !isLiked);
                 likeButton.classList.toggle('has-text-grey', isLiked);
                 likeButton.dataset.liked = (!isLiked).toString();
                 likeCountSpan.textContent = isLiked ? Math.max(0, currentCount - 1) : currentCount + 1;

                 // Отправка запроса на сервер
                 const result = await apiRequest(url, method);

                 if (result === null) { // Ошибка запроса
                      // Откатываем UI обратно
                      likeButton.classList.toggle('has-text-danger', isLiked);
                      likeButton.classList.toggle('has-text-grey', !isLiked);
                      likeButton.dataset.liked = isLiked.toString();
                      likeCountSpan.textContent = currentCount;
                      showNotification('Не удалось обновить лайк.', 'is-danger');
                 }
                  // При успехе ничего не делаем, UI уже обновлен
                  return; // Прерываем дальнейшую обработку клика
             }

             // --- Открытие комментариев ---
            const commentButton = target.closest('.comment-button');
            if (commentButton && postId) {
                openCommentsModal(postId);
                return;
            }

             // --- Удаление поста ---
             const deleteButton = target.closest('.delete-post-button');
             if (deleteButton && postId) {
                  if (confirm('Вы уверены, что хотите удалить этот пост?')) {
                       deleteButton.classList.add('is-loading');
                       const result = await apiRequest(`/api/posts/${postId}`, 'DELETE');
                       deleteButton.classList.remove('is-loading');

                       if (result !== null) { // Успех (даже если null от 204 No Content)
                            postCard.remove(); // Удаляем карточку поста со страницы
                            showNotification('Пост удален.', 'is-success');
                       } else {
                            showNotification('Не удалось удалить пост.', 'is-danger');
                       }
                  }
                  return;
             }
        });
    }


    // --- Логика Модального окна комментариев ---
    if (commentsModal && closeCommentsModalBtn && addCommentForm) {
         // Закрытие модалки
         const closeAction = () => commentsModal.classList.remove('is-active');
         closeCommentsModalBtn.addEventListener('click', closeAction);
         commentsModal.querySelector('.modal-background').addEventListener('click', closeAction);

         // Отправка комментария
         addCommentForm.addEventListener('submit', async (event) => {
             event.preventDefault();
             commentError.textContent = '';
             const content = commentInput.value.trim();
             const postId = commentModalPostIdInput.value;

             if (!content || !postId) return;

             const submitButton = addCommentForm.querySelector('button[type="submit"]');
             submitButton.classList.add('is-loading');

             const result = await apiRequest(`/api/posts/${postId}/comments`, 'POST', { content });

             submitButton.classList.remove('is-loading');

             if (result && result.id) {
                 // Добавляем комментарий в список в модалке
                 renderComment(result, commentsModalContent, true); // true = prepend
                 commentInput.value = ''; // Очищаем поле
                 // Обновляем счетчик комментов на карточке поста
                  updateCommentCountOnCard(postId, 1); // Увеличиваем на 1
             } else {
                 commentError.textContent = 'Не удалось добавить комментарий.';
             }
         });
    }

    // --- Открытие модалки и загрузка комментариев ---
    async function openCommentsModal(postId) {
        if (!commentsModal) return;
        commentModalPostIdInput.value = postId;
        commentsModalContent.innerHTML = '<div class="has-text-centered p-4"><span class="icon"><i class="fas fa-spinner fa-spin"></i></span> Загрузка комментариев...</div>';
        commentsModal.classList.add('is-active');
        commentError.textContent = '';
        commentInput.value = '';

        const comments = await apiRequest(`/api/posts/${postId}/comments?limit=100`); // Загружаем до 100 комментов

        commentsModalContent.innerHTML = ''; // Очищаем перед рендером
        if (comments && Array.isArray(comments)) {
            if (comments.length === 0) {
                commentsModalContent.innerHTML = '<p class="has-text-grey-light has-text-centered p-4">Комментариев пока нет.</p>';
            } else {
                 comments.forEach(comment => renderComment(comment, commentsModalContent, false)); // false = append (старые вверху)
            }
        } else {
            commentsModalContent.innerHTML = '<p class="has-text-danger">Не удалось загрузить комментарии.</p>';
        }
    }

    // --- Рендер одного комментария ---
    function renderComment(comment, container, prepend = false) {
         const commentDiv = document.createElement('div');
         commentDiv.className = 'comment-item';
         commentDiv.dataset.commentId = comment.id;
         const author = comment.author;
         const timestamp = new Date(comment.timestamp).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
         // Добавим кнопку удаления, если это наш коммент или наш пост
         const canDeleteComment = currentUser && (comment.author.id === currentUser.id || (window.profileOwnerId && window.profileOwnerId === currentUser.id) || currentUser.is_admin);


         commentDiv.innerHTML = `
              <div class="is-flex is-justify-content-space-between is-align-items-center">
                   <div>
                       <a href="/profile/${escapeHTML(author.username)}" class="comment-author">${escapeHTML(author.nickname || author.username)}</a>
                       <span class="comment-timestamp">${timestamp}</span>
                   </div>
                   ${canDeleteComment ? `
                       <button class="delete is-small delete-comment-button" title="Удалить комментарий"></button>
                   ` : ''}
              </div>
              <div class="comment-content mt-1">${escapeHTML(comment.content)}</div>
         `;
          if (prepend) {
              container.prepend(commentDiv);
          } else {
              container.appendChild(commentDiv);
          }
    }

     // --- Удаление комментария (обработчик в модалке) ---
     if (commentsModalContent) {
         commentsModalContent.addEventListener('click', async (event) => {
             const deleteButton = event.target.closest('.delete-comment-button');
             if (deleteButton) {
                  const commentItem = deleteButton.closest('.comment-item');
                  const commentId = commentItem?.dataset.commentId;
                  const postId = commentModalPostIdInput.value;

                  if (commentId && postId && confirm('Удалить этот комментарий?')) {
                       deleteButton.classList.add('is-loading'); // Можно добавить стиль для is-loading у delete
                       const result = await apiRequest(`/api/posts/comments/${commentId}`, 'DELETE');
                       deleteButton.classList.remove('is-loading');

                       if (result !== null) {
                            commentItem.remove(); // Удаляем из DOM
                            showNotification('Комментарий удален.', 'is-success');
                            updateCommentCountOnCard(postId, -1); // Уменьшаем счетчик
                       } else {
                            showNotification('Не удалось удалить комментарий.', 'is-danger');
                       }
                  }
             }
         });
     }


     // --- Обновление счетчика комментариев на карточке поста ---
     function updateCommentCountOnCard(postId, delta) {
         const postCard = document.querySelector(`.post-card[data-post-id="${postId}"]`);
         if (postCard) {
              const commentCountSpan = postCard.querySelector('.comment-button .comment-count');
              if (commentCountSpan) {
                   let currentCount = parseInt(commentCountSpan.textContent || '0', 10);
                   commentCountSpan.textContent = Math.max(0, currentCount + delta);
              }
         }
     }

    // --- Первоначальная загрузка постов (только если мы в ленте) ---
    if (feedContainer) {
        loadPosts();
    }
});