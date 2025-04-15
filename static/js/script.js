// static/js/script.js

/**
 * Утилита для выполнения fetch запросов к API.
 * Обрабатывает токен, метод, тело запроса и ошибки.
 * @param {string} url - URL эндпоинта API (например, '/api/users/me')
 * @param {string} method - HTTP метод ('GET', 'POST', 'PUT', 'DELETE', etc.)
 * @param {object|FormData} [body=null] - Тело запроса (для POST, PUT)
 * @param {boolean} [isFormData=false] - Установить в true, если body это FormData
 * @returns {Promise<object|Array|null>} - Возвращает данные ответа или null при ошибке
 */
async function apiRequest(url, method = 'GET', body = null, isFormData = false) {
    const headers = {};
    const options = { method, headers };
    const token = getCookie('access_token'); // Читаем токен из куки

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (body) {
        if (isFormData) {
            // Не устанавливаем 'Content-Type' для FormData, браузер сделает это сам с правильным boundary
            options.body = body;
        } else {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
    }

    try {
        const response = await fetch(url, options);

        if (response.status === 401) { // Unauthorized
            console.warn('Unauthorized request. Redirecting to login.');
            deleteCookie('access_token');
            if (!window.location.pathname.startsWith('/auth')) { // Не редиректим, если уже на странице входа
                window.location.href = '/auth?tab=login&unauthorized=true';
            }
            return null;
        }

        // Обработка ответа без тела (e.g., 204 No Content)
        if (response.status === 204) {
            return {}; // Возвращаем пустой объект для унификации
        }

        const responseContentType = response.headers.get('content-type');
        let responseData;
        if (responseContentType && responseContentType.includes('application/json')) {
            responseData = await response.json();
        } else {
            // Если ответ не JSON, пытаемся получить текст
            responseData = await response.text();
            // Можно вернуть текст или объект с текстом, в зависимости от ожиданий
            // return { detail: responseData || 'Non-JSON response received' };
        }


        if (!response.ok) {
            const errorMessage = responseData?.detail || response.statusText || 'Unknown server error';
            console.error(`API Error (${response.status} ${response.statusText}) for ${method} ${url}:`, responseData);
            showNotification(`Ошибка: ${errorMessage}`, 'is-danger');
            throw new Error(errorMessage);
        }

        return responseData;

    } catch (error) {
        console.error(`Fetch Error for ${method} ${url}:`, error);
        // Показываем общую ошибку, только если её еще нет
        const notificationArea = document.getElementById('notification-area');
        if (!notificationArea || !notificationArea.querySelector('.notification.is-danger')) {
            showNotification('Произошла сетевая ошибка. Попробуйте позже.', 'is-danger');
        }
        return null; // Возвращаем null при любой ошибке fetch
    }
}

/**
 * Получает значение куки по имени.
 * @param {string} name - Имя куки.
 * @returns {string|null} - Значение куки или null.
 */
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

/**
 * Устанавливает куку.
 * @param {string} name - Имя куки.
 * @param {string} value - Значение куки.
 * @param {number} [days=7] - Срок жизни куки в днях.
 */
function setCookie(name, value, days = 7) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax" + secure;
}

/**
 * Удаляет куку.
 * @param {string} name - Имя куки.
 */
function deleteCookie(name) {
    document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax';
}


/**
 * Показывает плавающее уведомление пользователю.
 * @param {string} message - Текст сообщения.
 * @param {string} type - Тип уведомления Bulma (is-success, is-danger, is-warning, is-info).
 * @param {number} [duration=3000] - Длительность показа в мс (0 для постоянного).
 */
function showNotification(message, type = 'is-info', duration = 3000) {
    const notificationArea = document.getElementById('notification-area');
    if (!notificationArea) {
        console.error("Notification area not found!");
        return;
    }

    const notification = document.createElement('div');
    // Используем is-light для лучшей читаемости на разных фонах
    notification.className = `notification ${type} is-light`;

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete';
    // Добавляем обработчик на кнопку закрытия
    deleteButton.onclick = () => {
        notification.style.opacity = 0; // Запускаем анимацию исчезновения
        // Удаляем элемент после завершения анимации
        setTimeout(() => {
            notification.remove();
        }, 400); // Должно совпадать с transition-duration в CSS
    };

    notification.appendChild(deleteButton);
    notification.appendChild(document.createTextNode(message));

    notificationArea.appendChild(notification);

    // --- Анимация появления ---
    // Форсируем перерисовку браузером перед добавлением класса fade-in
    notification.offsetHeight; // Небольшой хак для reflow
    notification.classList.add('fade-in');

    // --- Автоматическое скрытие ---
    if (duration > 0) {
        setTimeout(() => {
            // Проверяем, существует ли еще уведомление (может быть закрыто вручную)
            if (notification.parentNode) {
                 deleteButton.click(); // Имитируем клик на кнопку закрытия
            }
        }, duration);
    }
}

/**
 * Безопасное экранирование HTML для предотвращения XSS.
 * @param {string} str - Входная строка.
 * @returns {string} - Экранированная строка.
 */
function escapeHTML(str) {
     if (!str) return '';
     return String(str).replace(/[&<>"']/g, function(match) { // Добавил String() для надежности
        switch (match) {
            case '&': return '&';
            case '<': return '<';
            case '>': return '>';
            case '"': return '"';
            case "'": return "'";
            default: return match;
        }
    });
}

// Обработка уведомлений об ошибках/успехах из URL
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    let newUrl = window.location.pathname; // Базовый URL без параметров
    let firstParam = true;

    if (urlParams.has('unauthorized')) {
        showNotification('Вы не авторизованы или ваша сессия истекла. Пожалуйста, войдите.', 'is-warning');
        urlParams.delete('unauthorized'); // Удаляем параметр
        // Перестраиваем строку запроса, чтобы сохранить другие возможные параметры
        urlParams.forEach((value, key) => {
            newUrl += (firstParam ? '?' : '&') + `${key}=${value}`;
            firstParam = false;
        });
        window.history.replaceState({}, document.title, newUrl); // Обновляем URL без перезагрузки
    } else if (urlParams.has('registered')) {
        showNotification('Регистрация прошла успешно! Теперь вы можете войти.', 'is-success');
        urlParams.delete('registered');
        urlParams.forEach((value, key) => {
             newUrl += (firstParam ? '?' : '&') + `${key}=${value}`;
             firstParam = false;
        });
        // Если после удаления параметров не осталось, добавляем ?tab=login
        if (firstParam) newUrl += '?tab=login';
        window.history.replaceState({}, document.title, newUrl);
    }
});