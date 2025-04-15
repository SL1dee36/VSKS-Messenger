// static/js/profile.js

document.addEventListener('DOMContentLoaded', () => {
    const profileContainer = document.getElementById('profile-container');
    if (!profileContainer) return; // Выходим, если это не страница профиля

    const profileUsername = profileContainer.dataset.username;

    const profileAvatar = document.getElementById('profile-avatar');
    const profileNickname = document.getElementById('profile-nickname');
    const profileUsernameSub = document.getElementById('profile-username'); // h2 element
    const postsCountSpan = document.getElementById('profile-posts-count');
    const followersCountSpan = document.getElementById('profile-followers-count');
    const followingCountSpan = document.getElementById('profile-following-count');
    const profileActionsContainer = document.getElementById('profile-actions');
    const profilePostsContainer = document.getElementById('profile-posts-container'); // Контейнер для постов
    const profileError = document.getElementById('profile-error');

    const avatarUploadForm = document.getElementById('avatar-upload-form');
    const avatarInput = document.getElementById('avatar-input');
    const avatarUploadError = document.getElementById('avatar-upload-error');


    let currentUser = window.currentUser || null;
    let profileData = null;
    window.profileOwnerId = null; // ID владельца профиля для логики удаления комментов в feed.js

    // --- Получение текущего пользователя ---
    async function ensureCurrentUser() {
        if (!currentUser) {
            currentUser = await apiRequest('/api/users/me');
            window.currentUser = currentUser;
        }
        return currentUser;
    }


    // --- Загрузка данных профиля ---
    async function loadProfileData() {
        await ensureCurrentUser(); // Убедимся, что current_user загружен для сравнения
        profileError.textContent = '';
        profilePostsContainer.innerHTML = '<div class="has-text-centered p-5"><span class="icon is-large"><i class="fas fa-spinner fa-spin fa-2x"></i></span><p>Загрузка...</p></div>';


        profileData = await apiRequest(`/api/users/${profileUsername}`);

        if (!profileData) {
             profileError.textContent = 'Не удалось загрузить профиль.';
             profilePostsContainer.innerHTML = '';
             // Можно скрыть основные элементы или показать сообщение об ошибке
             profileNickname.textContent = 'Ошибка';
             profileUsernameSub.textContent = 'Профиль не найден';
             return;
        }

        window.profileOwnerId = profileData.id; // Сохраняем ID для feed.js

        // Обновляем информацию на странице
        profileNickname.textContent = profileData.nickname || profileData.username;
        profileUsernameSub.textContent = `@${profileData.username}`;
        profileAvatar.src = profileData.avatar_url || '/static/img/default_avatar.png';
        postsCountSpan.textContent = profileData.posts_count || 0;
        followersCountSpan.textContent = profileData.followers_count || 0;
        followingCountSpan.textContent = profileData.following_count || 0;

        // Обновляем кнопки действий
        renderProfileActions();

        // Рендерим посты пользователя (используем renderPostCard из feed.js)
        profilePostsContainer.innerHTML = ''; // Очищаем
        if (profileData.posts && profileData.posts.length > 0) {
             const postCardTemplate = document.getElementById('post-card-template')?.innerHTML;
             if (postCardTemplate && currentUser) {
                 profileData.posts.forEach(post => {
                      const postElement = document.createElement('div');
                      // Убедимся, что likes_count и comments есть
                      post.likes_count = post.likes_count ?? 0;
                      post.comments = post.comments ?? [];
                      post.liked_by_users = post.liked_by_users ?? [];
                      postElement.innerHTML = renderPostCard(post); // Функция из feed.js
                      profilePostsContainer.appendChild(postElement.firstElementChild);
                 });
             } else {
                 profilePostsContainer.innerHTML = '<p class="has-text-danger">Ошибка рендеринга постов (шаблон или пользователь не найдены).</p>';
             }
        } else {
             profilePostsContainer.innerHTML = '<p class="has-text-grey-light has-text-centered p-4">У пользователя пока нет публикаций.</p>';
        }
    }

    // --- Рендер кнопок действий (Подписаться/Отписаться/Сообщение/Редакт.) ---
    function renderProfileActions() {
        profileActionsContainer.innerHTML = ''; // Очищаем
        if (!currentUser || !profileData) return; // Нужны оба объекта

        if (currentUser.id === profileData.id) {
            // Это наш профиль - кнопка Редактировать (пока не реализована)
            // profileActionsContainer.innerHTML = `
            //     <div class="control">
            //         <button class="button is-light" id="edit-profile-button">Редактировать профиль</button>
            //     </div>
            // `;
        } else {
            // Это чужой профиль
            const isFollowing = profileData.is_following;
            const followButtonText = isFollowing ? 'Отписаться' : 'Подписаться';
            const followButtonClass = isFollowing ? 'is-light' : 'is-info';

            profileActionsContainer.innerHTML = `
                <div class="control">
                    <button class="button ${followButtonClass}" id="follow-toggle-button" data-username="${profileData.username}" data-following="${isFollowing}">
                        <span class="icon"><i class="fas ${isFollowing ? 'fa-user-minus' : 'fa-user-plus'}"></i></span>
                        <span>${followButtonText}</span>
                    </button>
                </div>
                <div class="control">
                    <button class="button is-primary is-outlined" id="send-message-button" data-username="${profileData.username}">
                         <span class="icon"><i class="fas fa-paper-plane"></i></span>
                         <span>Сообщение</span>
                    </button>
                </div>
            `;
        }
    }


    // --- Обработка кликов на кнопках действий ---
    profileActionsContainer.addEventListener('click', async (event) => {
         const target = event.target.closest('button');
         if (!target) return;

         const username = target.dataset.username;

         // --- Подписка/Отписка ---
         if (target.id === 'follow-toggle-button') {
             const isFollowing = target.dataset.following === 'true';
             const url = `/api/friends/${isFollowing ? 'unfollow' : 'follow'}/${username}`;
             const method = isFollowing ? 'DELETE' : 'POST';

             target.classList.add('is-loading');
             const result = await apiRequest(url, method);
             target.classList.remove('is-loading');

             if (result !== null) { // Успех
                  // Обновляем состояние кнопки и счетчики на странице
                  profileData.is_following = !isFollowing;
                  // Обновляем счетчик подписчиков у этого профиля
                  let followersDelta = isFollowing ? -1 : 1;
                  profileData.followers_count = Math.max(0, (profileData.followers_count || 0) + followersDelta);
                  followersCountSpan.textContent = profileData.followers_count;
                  // Обновляем кнопку
                  renderProfileActions();
                  // Можно показать уведомление
                  showNotification(isFollowing ? `Вы отписались от @${username}` : `Вы подписались на @${username}`, 'is-info');
             } else {
                  showNotification('Не удалось выполнить действие.', 'is-danger');
             }
         }

         // --- Отправить сообщение (создать/перейти в ЛС) ---
         if (target.id === 'send-message-button') {
              target.classList.add('is-loading');
              // Запрашиваем или создаем приватный чат
              const chatInfo = await apiRequest(`/api/chats/direct/${username}`, 'POST');
              target.classList.remove('is-loading');

              if (chatInfo && chatInfo.id) {
                   // Переходим на страницу чата
                   window.location.href = `/im/${chatInfo.id}`;
              } else {
                   showNotification('Не удалось начать чат.', 'is-danger');
              }
         }

         // --- Редактировать профиль ---
         // if (target.id === 'edit-profile-button') {
         //     // Открыть модальное окно или перейти на страницу редактирования
         //     console.log('Edit profile clicked');
         // }
    });


    // --- Загрузка аватара ---
     if (avatarUploadForm && avatarInput) {
         avatarInput.addEventListener('change', async () => {
             avatarUploadError.textContent = '';
             const file = avatarInput.files[0];
             if (!file) return;

             const formData = new FormData();
             formData.append('file', file);

             // Показываем временный индикатор загрузки? (не обязательно)
             const originalSrc = profileAvatar.src;
             profileAvatar.src = '/static/img/loading.gif'; // Нужна гифка загрузки

             const result = await apiRequest('/api/users/me/avatar', 'PUT', formData, true);

             if (result && result.avatar_url) {
                  profileAvatar.src = result.avatar_url; // Обновляем аватар
                  showNotification('Аватар обновлен!', 'is-success');
                  // Обновляем аватар в шапке, если он там есть
                  const headerAvatar = document.querySelector('.navbar-item img.is-rounded');
                  if (headerAvatar) headerAvatar.src = result.avatar_url;
             } else {
                  profileAvatar.src = originalSrc; // Возвращаем старый аватар при ошибке
                  avatarUploadError.textContent = 'Не удалось загрузить аватар.';
             }
              avatarInput.value = null; // Сбрасываем input file
         });
     }

    // --- Загрузка данных профиля при инициализации ---
    loadProfileData();
});