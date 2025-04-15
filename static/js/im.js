// static/js/im.js

document.addEventListener('DOMContentLoaded', () => {
    const chatListElement = document.getElementById('chat-list');
    const createGroupBtn = document.getElementById('create-group-btn');
    const newGroupNameInput = document.getElementById('new-group-name');
    const createChatError = document.getElementById('create-chat-error');

    // --- Загрузка списка чатов ---
    async function loadChats() {
        if (!chatListElement) return;
        chatListElement.innerHTML = '<li><span class="icon"><i class="fas fa-spinner fa-spin"></i></span> Загрузка...</li>'; // Индикатор загрузки

        const chats = await apiRequest('/api/chats/');

        if (chats && Array.isArray(chats)) {
            chatListElement.innerHTML = ''; // Очистка списка
            if (chats.length === 0) {
                chatListElement.innerHTML = '<li>У вас пока нет чатов.</li>';
            } else {
                chats.forEach(chat => {
                    const listItem = document.createElement('li');
                    const link = document.createElement('a');
                    link.href = `/im/${chat.id}`; // Ссылка на страницу чата

                    // Определяем, кто собеседник в приватном чате
                    let chatName = chat.name;
                    let avatarUrl = '/static/img/group_avatar.png'; // Дефолт для группы
                    if (chat.is_private && chat.participants.length > 0) {
                        const currentUser = getCurrentUserFromState(); // Нужна функция для получения текущего юзера
                        const otherParticipant = chat.participants.find(p => p.id !== currentUser?.id);
                        if (otherParticipant) {
                            chatName = otherParticipant.nickname || otherParticipant.username;
                            avatarUrl = otherParticipant.avatar_url || '/static/img/default_avatar.png';
                        } else {
                             chatName = "Приватный чат"; // На случай, если что-то пошло не так
                             avatarUrl = '/static/img/default_avatar.png';
                        }
                    } else if (!chat.name) {
                        chatName = `Группа #${chat.id}`; // Если у группы нет имени
                    }


                    // Формируем содержимое элемента списка
                    link.innerHTML = `
                        <div class="chat-item-content">
                            <figure class="image is-48x48 chat-avatar">
                                <img class="is-rounded" src="${escapeHTML(avatarUrl)}" alt="Avatar">
                            </figure>
                            <div class="chat-item-info">
                                <div class="chat-name">${escapeHTML(chatName)}</div>
                                <div class="last-message">
                                    ${chat.last_message ? `${escapeHTML(chat.last_message.author.nickname || chat.last_message.author.username)}: ${escapeHTML(chat.last_message.content.substring(0, 30))}${chat.last_message.content.length > 30 ? '...' : ''}` : 'Нет сообщений'}
                                </div>
                            </div>
                        </div>
                    `;
                    listItem.appendChild(link);
                    chatListElement.appendChild(listItem);
                });
            }
        } else {
             chatListElement.innerHTML = '<li>Не удалось загрузить чаты.</li>';
        }
    }

     // --- Создание группового чата ---
     if (createGroupBtn && newGroupNameInput) {
         createGroupBtn.addEventListener('click', async () => {
             const chatName = newGroupNameInput.value.trim();
             createChatError.textContent = '';

             if (!chatName) {
                 createChatError.textContent = 'Введите название группы.';
                 return;
             }

             const result = await apiRequest('/api/chats/group', 'POST', { name: chatName });

             if (result && result.id) {
                 showNotification(`Группа "${escapeHTML(chatName)}" создана!`, 'is-success');
                 newGroupNameInput.value = '';
                 loadChats(); // Обновляем список чатов
                 // Можно сразу перейти в созданный чат:
                 // window.location.href = `/im/${result.id}`;
             } else {
                 createChatError.textContent = 'Не удалось создать группу.';
             }
         });
     }


    // Вспомогательная функция для получения ID текущего пользователя (из токена или /api/users/me)
    // Простой вариант - предположить, что он уже есть где-то (например, в объекте window или через API)
    // Здесь пока заглушка, нужно реализовать получение ID
    function getCurrentUserFromState() {
        // !!! Эту функцию нужно доработать !!!
        // Она может делать запрос к /api/users/me при загрузке страницы
        // или читать ID из данных, переданных сервером в шаблон.
        // Пока возвращаем null, чтобы избежать ошибок.
         console.warn("getCurrentUserFromState() is not fully implemented. User comparison might fail.");
         // Пытаемся получить пользователя из request.state, который мы добавили в main.py
         // Этот объект не доступен напрямую в JS, его нужно передать в шаблон, например:
         // <script>window.currentUser = {{ current_user.json() | safe }};</script> в base.html
         // Или сделать запрос /api/users/me
         return window.currentUser || null; // Предполагаем, что currentUser есть в window
    }

    // Первичная загрузка чатов
    loadChats();
});

// Добавьте в base.html перед </head> или перед </body>:
// {% if current_user %}
// <script>
//   window.currentUser = {
//     id: {{ current_user.id }},
//     username: "{{ current_user.username }}",
//     // Добавьте другие нужные поля
//   };
// </script>
// {% else %}
// <script>window.currentUser = null;</script>
// {% endif %}