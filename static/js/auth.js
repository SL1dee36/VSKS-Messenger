// static/js/auth.js

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    // const resetForm = document.getElementById('resetForm'); // Если будет форма сброса

    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');
    // const resetError = document.getElementById('reset-error');
    // const resetMessage = document.getElementById('reset-message');

    const tabs = document.querySelectorAll('#auth-tabs li');
    const forms = document.querySelectorAll('.auth-form');

    // --- Переключение вкладок ---
    function setActiveTab(targetTab) {
        tabs.forEach(tab => {
            if (tab.dataset.tab === targetTab) {
                tab.classList.add('is-active');
            } else {
                tab.classList.remove('is-active');
            }
        });
        forms.forEach(form => {
             if (form.id.startsWith(targetTab)) {
                 form.classList.remove('is-hidden');
             } else {
                 form.classList.add('is-hidden');
             }
        });
        // Очистка ошибок при переключении
        loginError.textContent = '';
        registerError.textContent = '';
        // resetError.textContent = '';
        // resetMessage.textContent = '';
    }

    // Установка активной вкладки при загрузке на основе URL параметра
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab') || 'login'; // По умолчанию 'login'
    setActiveTab(initialTab);

    // Обработчики кликов по вкладкам
    tabs.forEach(tab => {
        tab.addEventListener('click', (event) => {
            event.preventDefault();
            const targetTab = tab.dataset.tab;
            setActiveTab(targetTab);
            // Обновляем URL без перезагрузки страницы
            window.history.pushState({}, '', `?tab=${targetTab}`);
        });
    });


    // --- Обработка формы входа ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            loginError.textContent = ''; // Очистка предыдущей ошибки

            const formData = new FormData(loginForm);
            // Используем application/x-www-form-urlencoded, как ожидает OAuth2PasswordRequestForm
            const body = new URLSearchParams();
            formData.forEach((value, key) => {
                body.append(key, value);
            });

            try {
                // Используем fetch напрямую, так как apiRequest не подходит для form-urlencoded
                 const response = await fetch('/api/users/token', {
                    method: 'POST',
                    headers: {
                         'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: body,
                });

                if (!response.ok) {
                     const errorData = await response.json().catch(() => ({ detail: 'Ошибка входа. Проверьте данные.' }));
                     throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
                }

                const data = await response.json();

                if (data.access_token) {
                    // Сохраняем токен в КУКИ (HttpOnly установить нельзя из JS)
                    setCookie('access_token', data.access_token, 1); // Сохраняем на 1 день
                    console.log('Login successful, token set.');
                    // Перенаправляем на главную страницу (или ленту)
                    window.location.href = '/feed';
                } else {
                    throw new Error('Токен не получен от сервера.');
                }

            } catch (error) {
                console.error('Login failed:', error);
                loginError.textContent = error.message || 'Произошла ошибка при входе.';
            }
        });
    }

    // --- Обработка формы регистрации ---
    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            registerError.textContent = '';

            const password = document.getElementById('register-password').value;
            const passwordConfirm = document.getElementById('register-password-confirm').value;

            if (password !== passwordConfirm) {
                registerError.textContent = 'Пароли не совпадают.';
                return;
            }

            const formData = new FormData(registerForm);
            const userData = {};
            formData.forEach((value, key) => {
                // Пропускаем подтверждение пароля
                if (key !== 'register-password-confirm') {
                     // Используем имя поля без префикса 'register-'
                     const fieldName = key.replace('register-', '');
                     userData[fieldName] = value;
                }
            });

            // Отправляем как JSON
            const result = await apiRequest('/api/users/', 'POST', userData);

            if (result) {
                console.log('Registration successful:', result);
                // Показываем сообщение и редиректим на логин
                 window.location.href = '/auth?tab=login&registered=true';
                // Или можно сразу залогинить, запросив токен, но лучше явно
                // setActiveTab('login');
                // showNotification('Регистрация прошла успешно! Теперь вы можете войти.', 'is-success');
                // registerForm.reset(); // Очистка формы
            } else {
                // Ошибка уже должна быть показана функцией apiRequest
                // registerError.textContent = 'Ошибка регистрации.'; // На всякий случай
            }
        });
    }

    // --- Обработка формы сброса пароля (если будет) ---
    // if (resetForm) {
    //     resetForm.addEventListener('submit', async (event) => {
    //         event.preventDefault();
    //         resetError.textContent = '';
    //         resetMessage.textContent = '';
    //         const email = document.getElementById('reset-email').value;
    //         // Добавить вызов API эндпоинта для сброса пароля
    //         console.log("Password reset requested for:", email);
    //         // const result = await apiRequest('/api/users/password-recovery', 'POST', { email });
    //         // if(result) {
    //         //     resetMessage.textContent = 'Инструкции по сбросу пароля отправлены на ваш email.';
    //         // } else {
    //         //      resetError.textContent = 'Ошибка при запросе сброса пароля.';
    //         // }
    //         resetMessage.textContent = 'Функция сброса пароля пока не реализована.';
    //     });
    // }

});