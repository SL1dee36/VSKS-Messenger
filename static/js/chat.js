// static/js/chat.js

document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.querySelector('.chat-container');
    if (!chatContainer) return; // Выходим, если это не страница чата

    const chatId = chatContainer.dataset.chatId;
    const messageList = document.getElementById('message-list');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const messageError = document.getElementById('message-error');
    const chatTitle = document.getElementById('chat-title');
    const chatParticipants = document.getElementById('chat-participants');
    const sendButton = document.getElementById('send-button');

    const addParticipantSection = document.getElementById('add-participant-section');
    const addParticipantBtn = document.getElementById('add-participant-btn');
    const addParticipantUsernameInput = document.getElementById('add-participant-username');
    const addParticipantError = document.getElementById('add-participant-error');

    let currentUser = window.currentUser || null; // Используем глобального пользователя
    let chatInfo = null; // Информация о чате

    // Переменные для автообновления
    let chatUpdateInterval = null;
    const UPDATE_INTERVAL_MS = 1000; // Интервал обновления - 1 секунда
    let latestMessageTimestamp = null; // ISO Временная метка последнего *полученного* сообщения
    let isFetchingMessages = false; // Флаг для предотвращения параллельных запросов

    // --- Утилита для экранирования HTML ---
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // --- Загрузка информации о чате и начальных сообщений ---
    async function loadInitialChatData() {
        console.log("Loading initial chat data...");
        messageList.innerHTML = '<div class="has-text-centered p-4"><span class="icon is-medium"><i class="fas fa-spinner fa-spin"></i></span> Загрузка...</div>';
        chatTitle.textContent = 'Загрузка...';
        chatParticipants.textContent = '';

        try {
             // Предполагаем, что apiRequest уже определена глобально или импортирована
             const chatData = await apiRequest(`/api/chats/${chatId}?limit_messages=50`);

             if (!chatData) {
                 throw new Error('No chat data received');
             }
             chatInfo = chatData;

             // Получаем текущего пользователя (если еще не загружен)
             if (!currentUser && window.fetchCurrentUser) {
                 currentUser = await window.fetchCurrentUser();
             }

             if (!currentUser) {
                 console.error("Текущий пользователь не определен!");
                 chatTitle.textContent = 'Ошибка авторизации';
                 messageList.innerHTML = '<div class="has-text-centered p-4 has-text-danger">Не удалось определить текущего пользователя.</div>';
                 stopChatUpdates();
                 return;
             }

             updateChatHeader(chatData);
             renderMessages(chatData.messages || [], true);
             startChatUpdates();
             console.log("Initial chat data loaded, updates started.");

        } catch (error) {
             console.error("Error loading initial chat data:", error);
             chatTitle.textContent = 'Ошибка загрузки чата';
             messageList.innerHTML = `<div class="has-text-centered p-4 has-text-danger">Не удалось загрузить чат. (${escapeHTML(error.message || 'Unknown error')})</div>`;
             stopChatUpdates();
        }
    }

    // --- Обновление заголовка чата ---
    function updateChatHeader(chatData) {
        let titleText = chatData.name;
        let participantsText = '';
        if (chatData.is_private) {
             const otherParticipant = chatData.participants.find(p => p.id !== currentUser.id);
             titleText = otherParticipant ? escapeHTML(otherParticipant.nickname || otherParticipant.username) : "Личный чат";
             participantsText = `Личный чат с @${escapeHTML(otherParticipant?.username || '??')}`;
             if (addParticipantSection) addParticipantSection.classList.add('is-hidden');
        } else {
            titleText = escapeHTML(chatData.name || `Группа #${chatData.id}`);
            participantsText = `Участники: ${chatData.participants.map(p => `@${escapeHTML(p.username)}`).join(', ')}`;
            if (addParticipantSection) addParticipantSection.classList.remove('is-hidden');
        }
        chatTitle.textContent = titleText;
        chatParticipants.textContent = participantsText;
    }

    // --- Отрисовка сообщений ---
    function renderMessages(messages, isInitialLoad = false) {
        if (isInitialLoad) {
             messageList.innerHTML = '';
        }
        if (messages.length === 0 && isInitialLoad) {
             messageList.innerHTML = '<div class="has-text-centered p-4 has-text-grey">Сообщений пока нет.</div>';
             return;
        }
        // Сортируем сообщения по времени перед отрисовкой
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        let lastMessageTime = null;
        messages.forEach(msg => {
             appendMessage(msg); // Добавляем каждое сообщение
             lastMessageTime = msg.timestamp;
        });
        // Обновляем метку последнего сообщения
        if (lastMessageTime && (!latestMessageTimestamp || new Date(lastMessageTime) > new Date(latestMessageTimestamp))) {
             latestMessageTimestamp = lastMessageTime;
        }
        if (isInitialLoad) {
            scrollToBottom(true); // Прокручиваем вниз после начальной загрузки
        }
    }

    // --- Добавление одного сообщения в список ---
    function appendMessage(msg) {
        // Убедимся, что currentUser загружен
        if (!currentUser || !currentUser.id) {
            console.warn("Cannot append message, currentUser is not defined yet.");
            return;
        }
        // Проверяем, существует ли уже сообщение с таким ID
        if (messageList.querySelector(`.message[data-message-id="${msg.id}"]`)) {
            return; // Не добавляем дубликаты
        }
        // Удаляем сообщение "Сообщений пока нет", если оно есть
        const noMessagesPlaceholder = messageList.querySelector('.has-text-grey');
        if (noMessagesPlaceholder) {
            noMessagesPlaceholder.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.dataset.messageId = msg.id;
        const isSent = msg.author.id === currentUser.id;
        messageDiv.classList.add('message', isSent ? 'sent' : 'received'); // Применяем классы .sent или .received

        const authorName = escapeHTML(msg.author.nickname || msg.author.username);
        const avatarUrl = msg.author.avatar_url || '/static/img/default_avatar.png'; // Используем дефолтный аватар, если нет своего

        let formattedTimestamp = 'invalid date';
        try {
             // Форматируем дату и время
             formattedTimestamp = new Date(msg.timestamp).toLocaleString('ru-RU', {
                 // timeZone: 'Europe/Moscow', // Лучше оставить время как есть или настроить на сервере/клиенте
                 hour: '2-digit',
                 minute: '2-digit',
                 day: 'numeric',
                 month: 'short'
             });
        } catch (e) {
            console.error("Error formatting timestamp:", e, "Original:", msg.timestamp);
        }

        // Создаем HTML-структуру сообщения
        // Важно: img.message-avatar и div.message-bubble должны быть прямыми потомками div.message
        messageDiv.innerHTML = `
            <img class="message-avatar" src="${escapeHTML(avatarUrl)}" alt="${authorName}" title="${authorName}">
            <div class="message-user">
                
                <div class="message-content">
                    ${!chatInfo.is_private ? `<div class="message-author">${authorName}</div>` : ''} <!-- Показываем автора только в групповых чатах -->
                    ${escapeHTML(msg.content).replace(/\n/g, '<br>')}
                    ${msg.file_url ? `<br><a href="${escapeHTML(msg.file_url)}" target="_blank" class="has-text-link">[Прикрепленный файл]</a>` : ''}
                    <div class="message-timestamp">${formattedTimestamp}</div>
                </div>
            </div>
        `;

        const shouldScroll = isNearBottom(); // Проверяем, нужно ли прокручивать вниз

        // Добавляем сообщение в начало списка (так как flex-direction: column-reverse)
        // messageList.insertBefore(messageDiv, messageList.firstChild);
        // Исправлено: добавляем в конец, т.к. column-reverse работает с порядком элементов
        messageList.appendChild(messageDiv);

        // Обновляем временную метку последнего сообщения
        if (!latestMessageTimestamp || new Date(msg.timestamp) > new Date(latestMessageTimestamp)) {
             latestMessageTimestamp = msg.timestamp;
        }

        // Прокручиваем вниз, если пользователь был внизу
        if (shouldScroll) {
             scrollToBottom();
        }
    }

    // --- Проверка, находится ли пользователь внизу списка сообщений ---
    function isNearBottom() {
        // Учитываем flex-direction: column-reverse
        // Когда прокрутка вверху (scrollTop=0), мы видим самые новые сообщения.
        const threshold = 50; // Порог в пикселях
        // return messageList.scrollTop < threshold;
        // Стандартная проверка для normal flow (column или row)
         return messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < threshold;
    }

     // --- Прокрутка списка сообщений вниз ---
    function scrollToBottom(force = false) {
         // Для column-reverse, "низ" - это scrollTop = 0
        /*
        if (!force && messageList.scrollTop > 50) { // Если не форсируем и пользователь прокрутил вверх
             return; // Не прокручиваем автоматически
        }
        setTimeout(() => {
            messageList.scrollTop = 0; // Прокручиваем к самым новым сообщениям
        }, 50); // Небольшая задержка для рендеринга
        */
         // Стандартная прокрутка для normal flow (column или row)
        const initialScrollTop = messageList.scrollTop;
        const maxScrollTop = messageList.scrollHeight - messageList.clientHeight;
        // Не прокручивать, если пользователь сильно отмотал вверх
        if (!force && initialScrollTop < maxScrollTop - 200 && initialScrollTop > 0) {
             // console.log("User scrolled up, not auto-scrolling");
             return;
        }
        setTimeout(() => {
             // console.log("Scrolling to bottom");
            messageList.scrollTop = messageList.scrollHeight;
        }, 50);
    }


    // --- Отправка сообщения ---
    if (messageForm && messageInput) {
        messageForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Предотвращаем стандартную отправку формы
            const content = messageInput.value.trim(); // Получаем текст сообщения
            messageError.textContent = ''; // Очищаем ошибки
            if (!content) return; // Не отправляем пустые сообщения

            // Блокируем кнопку и поле ввода на время отправки
            sendButton.disabled = true;
            messageInput.disabled = true;

            const messageData = { content: content };
            try {
                const result = await apiRequest(`/api/chats/${chatId}/messages`, 'POST', messageData);
                if (result && result.id) {
                    messageInput.value = ''; // Очищаем поле ввода
                    // Не добавляем сообщение вручную, дождемся обновления
                    // appendMessage(result); // Опционально: можно добавить сразу для мгновенного отображения
                    fetchAndUpdateMessages(); // Запросим обновления, чтобы получить сообщение с сервера
                    setTimeout(() => scrollToBottom(true), 100); // Прокрутим вниз
                } else {
                    // Показываем ошибку, если что-то пошло не так
                    messageError.textContent = 'Не удалось отправить сообщение. ' + (result?.detail || '');
                }
            } catch(error) {
                 console.error("Error sending message:", error);
                 messageError.textContent = 'Ошибка сети при отправке сообщения.';
                 // Показываем уведомление об ошибке, если функция showNotification доступна
                 if (window.showNotification) {
                     window.showNotification('Ошибка сети при отправке сообщения.', 'is-danger');
                 }
            } finally {
                 // Разблокируем кнопку и поле ввода
                 sendButton.disabled = false;
                 messageInput.disabled = false;
                 messageInput.focus(); // Возвращаем фокус на поле ввода
            }
        });
    }

    // --- Добавление участника ---
    if (addParticipantBtn && addParticipantUsernameInput) {
        addParticipantBtn.addEventListener('click', async () => {
            const username = addParticipantUsernameInput.value.trim();
            addParticipantError.textContent = '';
            if (!username) {
                addParticipantError.textContent = 'Введите имя пользователя.';
                return;
            }
            addParticipantBtn.disabled = true; // Блокируем кнопку
            try {
                const result = await apiRequest(`/api/chats/${chatId}/participants/${username}`, 'POST');
                if (result && result.id) { // result должен быть обновленной информацией о чате
                    // Показываем уведомление об успехе
                    if(window.showNotification) {
                        window.showNotification(`Пользователь @${escapeHTML(username)} добавлен в чат.`, 'is-success');
                    }
                    addParticipantUsernameInput.value = ''; // Очищаем поле
                    chatInfo = result; // Обновляем локальную информацию о чате
                    updateChatHeader(result); // Обновляем заголовок и список участников
                } else {
                    const errorMsg = result?.detail || 'Не удалось добавить пользователя.';
                    addParticipantError.textContent = errorMsg;
                    if(window.showNotification) {
                        window.showNotification(errorMsg, 'is-warning');
                    }
                }
            } catch(error) {
                 console.error("Error adding participant:", error);
                 const errorMsg = error.message || 'Ошибка сети при добавлении участника.';
                 addParticipantError.textContent = errorMsg;
                 if(window.showNotification) {
                      window.showNotification(errorMsg, 'is-danger');
                 }
            } finally {
                 addParticipantBtn.disabled = false; // Разблокируем кнопку
            }
        });
    }

    // --- Логика автообновления чата ---
    async function fetchAndUpdateMessages() {
        // Не обновляем, если идет другой запрос или вкладка неактивна
        if (isFetchingMessages || document.hidden) {
            return;
        }
        isFetchingMessages = true;
        try {
             // Запрашиваем только новые сообщения, используя latestMessageTimestamp
             // const endpoint = latestMessageTimestamp
             //     ? `/api/chats/${chatId}/messages?since=${latestMessageTimestamp}`
             //     : `/api/chats/${chatId}/messages?limit=20`; // Или limit для первого запроса после паузы
             // Пока используем limit=20 для простоты, т.к. since может быть сложнее реализовать на бэке
            const recentMessages = await apiRequest(`/api/chats/${chatId}/messages?limit=20`); // Запрашиваем последние 20

            if (recentMessages && Array.isArray(recentMessages)) {
                 const newMessages = recentMessages.filter(msg =>
                     !latestMessageTimestamp || new Date(msg.timestamp) > new Date(latestMessageTimestamp)
                 );
                 if (newMessages.length > 0) {
                      console.log(`Fetched ${newMessages.length} new messages.`);
                      // Сортируем новые сообщения по времени
                      newMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                      let lastAddedTimestamp = null;
                      newMessages.forEach(msg => {
                          appendMessage(msg); // Добавляем каждое новое сообщение
                          lastAddedTimestamp = msg.timestamp;
                      });
                      // Обновляем метку времени последнего добавленного сообщения
                      if (lastAddedTimestamp && (!latestMessageTimestamp || new Date(lastAddedTimestamp) > new Date(latestMessageTimestamp)) ) {
                          latestMessageTimestamp = lastAddedTimestamp;
                      }
                  }
            }
        } catch (error) {
            console.error("Ошибка при обновлении сообщений:", error);
             // Можно показать ненавязчивое уведомление об ошибке
             if(window.showNotification) {
                  showNotification("Ошибка обновления чата", "is-warning", 2000);
             }
        } finally {
            isFetchingMessages = false; // Снимаем флаг запроса
        }
    }

    // --- Запуск и остановка автообновления ---
    function startChatUpdates() {
        stopChatUpdates(); // Останавливаем предыдущий интервал, если он был
        console.log("Starting chat updates every", UPDATE_INTERVAL_MS, "ms");
        fetchAndUpdateMessages(); // Запускаем первый запрос сразу
        chatUpdateInterval = setInterval(fetchAndUpdateMessages, UPDATE_INTERVAL_MS); // Устанавливаем интервал
        // Следим за видимостью вкладки
        document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    function stopChatUpdates() {
        if (chatUpdateInterval) {
            console.log("Stopping chat updates...");
            clearInterval(chatUpdateInterval); // Очищаем интервал
            chatUpdateInterval = null;
        }
        // Убираем слушатель видимости
        document.removeEventListener("visibilitychange", handleVisibilityChange);
    }

    // --- Обработчик изменения видимости вкладки ---
    function handleVisibilityChange() {
        if (document.hidden) {
            console.log("Tab hidden, pausing chat updates");
            // Можно остановить интервал: stopChatUpdates();
        } else {
            console.log("Tab visible, resuming chat updates and fetching immediately");
            // Можно запустить снова: startChatUpdates();
            // Или просто выполнить один запрос:
            fetchAndUpdateMessages();
        }
    }

    // --- Загрузка данных при инициализации ---
    loadInitialChatData();

    // --- Остановка обновлений при уходе со страницы ---
    // 'unload' или 'beforeunload' могут быть ненадежными
    // 'pagehide' более надежен для мобильных устройств
    window.addEventListener('pagehide', stopChatUpdates);
    // window.addEventListener('beforeunload', stopChatUpdates); // Как запасной вариант

});