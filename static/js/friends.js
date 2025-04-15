// static/js/friends.js

document.addEventListener('DOMContentLoaded', () => {
    const followingList = document.getElementById('following-list');
    const followersList = document.getElementById('followers-list');
    const followingCountSpan = document.getElementById('following-count');
    const followersCountSpan = document.getElementById('followers-count');
    const tabs = document.querySelectorAll('.tabs li[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');

    let currentUser = window.currentUser || null;

     // --- Получение текущего пользователя ---
    async function ensureCurrentUser() {
        if (!currentUser) {
            currentUser = await apiRequest('/api/users/me');
            window.currentUser = currentUser;
        }
        return currentUser;
    }


    // --- Рендер элемента списка пользователя ---
    function renderUserListItem(user, listType) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'list-item'; // Используем класс из CSS
        itemDiv.dataset.userId = user.id;
        itemDiv.dataset.username = user.username;

        const avatarUrl = user.avatar_url || '/static/img/default_avatar.png';
        const displayName = escapeHTML(user.nickname || user.username);
        const username = escapeHTML(user.username);

        // Определяем кнопку действия
        let actionButtonHtml = '';
        if (listType === 'following') {
            actionButtonHtml = `<button class="button is-small is-light unfollow-button">Отписаться</button>`;
        } else if (listType === 'followers') {
            // Нужно проверить, подписаны ли мы на этого подписчика
            // Эта информация должна приходить с сервера или запрашиваться отдельно
            // Пока оставим без кнопки Follow Back для простоты
             actionButtonHtml = `<a href="/profile/${username}" class="button is-small is-white has-text-grey" title="Профиль">Профиль</a>`;
        }


        itemDiv.innerHTML = `
            <figure class="image is-48x48 list-item-image">
                <a href="/profile/${username}">
                    <img class="is-rounded" src="${escapeHTML(avatarUrl)}" alt="Avatar">
                </a>
            </figure>
            <div class="list-item-content">
                <p>
                    <a href="/profile/${username}" class="has-text-weight-semibold">${displayName}</a>
                    <br>
                    <small class="has-text-grey">@${username}</small>
                </p>
            </div>
            <div class="list-item-controls">
                ${actionButtonHtml}
            </div>
        `;
        return itemDiv;
    }

    // --- Загрузка списков ---
    async function loadLists() {
        await ensureCurrentUser();
        if (!currentUser) return;

        followingList.innerHTML = '<div class="has-text-centered p-4"><span class="icon"><i class="fas fa-spinner fa-spin"></i></span> Загрузка...</div>';
        followersList.innerHTML = '<div class="has-text-centered p-4"><span class="icon"><i class="fas fa-spinner fa-spin"></i></span> Загрузка...</div>';

        // Загружаем оба списка параллельно
        const [following, followers] = await Promise.all([
            apiRequest('/api/friends/following'),
            apiRequest('/api/friends/followers')
        ]);

        // Обновляем список подписок
        if (following && Array.isArray(following)) {
            followingList.innerHTML = '';
            followingCountSpan.textContent = following.length;
            if (following.length === 0) {
                 followingList.innerHTML = '<p class="list-item has-text-grey-light">Вы ни на кого не подписаны.</p>';
            } else {
                following.forEach(user => followingList.appendChild(renderUserListItem(user, 'following')));
            }
        } else {
            followingList.innerHTML = '<p class="list-item has-text-danger">Не удалось загрузить подписки.</p>';
            followingCountSpan.textContent = '?';
        }

        // Обновляем список подписчиков
        if (followers && Array.isArray(followers)) {
            followersList.innerHTML = '';
            followersCountSpan.textContent = followers.length;
            if (followers.length === 0) {
                 followersList.innerHTML = '<p class="list-item has-text-grey-light">У вас пока нет подписчиков.</p>';
            } else {
                followers.forEach(user => followersList.appendChild(renderUserListItem(user, 'followers')));
            }
        } else {
             followersList.innerHTML = '<p class="list-item has-text-danger">Не удалось загрузить подписчиков.</p>';
             followersCountSpan.textContent = '?';
        }
    }

    // --- Переключение вкладок ---
     tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab + '-content';

            // Деактивируем все вкладки и контент
            tabs.forEach(t => t.classList.remove('is-active'));
            tabContents.forEach(c => c.classList.add('is-hidden'));

            // Активируем нужную
            tab.classList.add('is-active');
            document.getElementById(targetId)?.classList.remove('is-hidden');
        });
    });

     // --- Обработка клика "Отписаться" ---
     followingList.addEventListener('click', async (event) => {
         const unfollowButton = event.target.closest('.unfollow-button');
         if (unfollowButton) {
              const userItem = unfollowButton.closest('.list-item');
              const username = userItem?.dataset.username;

              if (username && confirm(`Вы уверены, что хотите отписаться от @${username}?`)) {
                   unfollowButton.classList.add('is-loading');
                   const result = await apiRequest(`/api/friends/unfollow/${username}`, 'DELETE');
                   unfollowButton.classList.remove('is-loading');

                   if (result !== null) { // Успех (204 No Content)
                        userItem.remove(); // Удаляем пользователя из списка
                        // Обновляем счетчик
                        let count = parseInt(followingCountSpan.textContent || '1');
                        followingCountSpan.textContent = Math.max(0, count - 1);
                        showNotification(`Вы отписались от @${username}.`, 'is-info');
                        // TODO: Если этот пользователь есть в списке подписчиков,
                        // нужно там изменить кнопку "Follow Back" на "Follow", если она была.
                   } else {
                        showNotification(`Не удалось отписаться от @${username}.`, 'is-danger');
                   }
              }
         }
     });


    // Первоначальная загрузка
    loadLists();
});