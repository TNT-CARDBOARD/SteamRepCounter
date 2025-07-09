// --- НОВАЯ ФУНКЦИЯ ---
// Сокращает большие числа (3810 -> 3.8k)
function formatRepNumber(num) {
    if (num < 1000) {
        return num;
    }
    return (num / 1000).toFixed(1) + 'k';
}

// --- Вспомогательная функция для отправки комментария ---
function postRepComment(repText) {
    const textarea = document.querySelector('.commentthread_textarea');
    const postButton = document.querySelector('.commentthread_entry_submitlink span.btn_green_white_innerfade');
    if (textarea && postButton) {
        textarea.value = repText;
        postButton.click();
    } else {
        alert('Не удалось найти поле для ввода комментария или кнопку отправки.');
    }
}

// --- Асинхронная функция для получения всей комментариев ---
async function fetchAllComments(profileID, totalComments) {
    let allCommentsHTML = '';
    const pageSize = 100;
    const fetchPromises = [];
    for (let start = 0; start < totalComments; start += pageSize) {
        const url = `https://steamcommunity.com/comment/Profile/render/${profileID}/-1/?start=${start}&count=${pageSize}`;
        fetchPromises.push(fetch(url).then(response => response.json()));
    }
    const results = await Promise.all(fetchPromises);
    for (const result of results) {
        if (result && result.comments_html) allCommentsHTML += result.comments_html;
    }
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = allCommentsHTML;
    return tempDiv.querySelectorAll('.commentthread_comment'); // Получаем весь блок комментария
}

// --- Хуйня, обновляет цифры в блоке ---
async function updateRepCount(profileID) {
    const repTextSpan = document.querySelector('.rep-text');
    if (!repTextSpan) return;

    // Получаем URL текущего профиля для сравнения
    const profileURL = window.location.href.split('?')[0].split('#')[0];

    const totalCountMatch = document.documentElement.innerHTML.match(/"total_count":\s*(\d+)/);
    const totalComments = totalCountMatch ? parseInt(totalCountMatch[1], 10) : 0;
    
    if (totalComments === 0) {
        const existingBlock = document.querySelector('.custom-rep-right-col');
        if (existingBlock) existingBlock.remove();
        return;
    }

    const allComments = await fetchAllComments(profileID, totalComments);

    let plusRep = 0;
    let minusRep = 0;
    
    allComments.forEach(commentBlock => {
        // !!! ГЛАВНАЯ ПРОВЕРКА !!!
        const authorLinkElement = commentBlock.querySelector('.commentthread_author_link');
        if (authorLinkElement) {
            const authorURL = authorLinkElement.href.split('?')[0].split('#')[0];
            // Если ссылка автора совпадает со ссылкой профиля, пропускаем этот коммент
            if (authorURL.toLowerCase() === profileURL.toLowerCase()) {
                return;
            }
        }
        
        const commentTextElement = commentBlock.querySelector('.commentthread_comment_text');
        if (commentTextElement) {
            const text = commentTextElement.textContent.toLowerCase().replace(/\s/g, '');
            if (reputationPatterns.plus.some(pattern => text.includes(pattern.replace(/\s/g, '')))) {
                plusRep++;
            } else if (reputationPatterns.minus.some(pattern => text.includes(pattern.replace(/\s/g, '')))) {
                minusRep++;
            }
        }
    });
    
    repTextSpan.innerHTML = `${formatRepNumber(plusRep)} +rep <span class="rep-separator">\\</span> ${formatRepNumber(minusRep)} -rep`;
}


// --- Основная функция ---
async function initializeRepCounter() {
    if (document.querySelector('.custom-rep-right-col')) return;

    let langKey = 'en';
    const webuiConfigElement = document.getElementById('webui_config');
    if (webuiConfigElement && webuiConfigElement.dataset.config) {
        try {
            const config = JSON.parse(webuiConfigElement.dataset.config);
            if (config.LANGUAGE) langKey = config.LANGUAGE;
        } catch (e) { console.error('Steam Rep Counter: Ошибка парсинга webui_config', e); }
    }
    const ui = locales[langKey] || locales['en'];

    const targetElement = document.querySelector('.profile_header_badgeinfo');
    if (!targetElement) return;

    const profileIdMatch = document.documentElement.innerHTML.match(/InitializeCommentThread\s*\(\s*"Profile",\s*"Profile_(\d+)"/);
    if (!profileIdMatch) return;
    const profileID = profileIdMatch[1];
    
    const isOwnProfile = !!document.querySelector('.btn_profile_action span:contains("Редактировать профиль")');

    const repContainer = document.createElement('div');
    repContainer.className = 'custom-rep-right-col';
    const repTextSpan = document.createElement('span');
    repTextSpan.className = 'rep-text';
    repTextSpan.innerHTML = ui.loadingText;
    repContainer.appendChild(repTextSpan);

    if (!isOwnProfile) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'rep-buttons-container';
        const plusButton = document.createElement('button');
        plusButton.textContent = '+rep';
        plusButton.className = 'rep-button rep-button-plus';
        plusButton.onclick = () => postRepComment('+rep');
        const minusButton = document.createElement('button');
        minusButton.textContent = '-rep';
        minusButton.className = 'rep-button rep-button-minus';
        minusButton.onclick = () => postRepComment('-rep');
        buttonContainer.appendChild(plusButton);
        buttonContainer.appendChild(minusButton);
        repContainer.appendChild(buttonContainer);
    }
    
    targetElement.appendChild(repContainer);

    await updateRepCount(profileID);

    const commentSection = document.querySelector('.commentthread_area');
    if (commentSection) {
        const observer = new MutationObserver(() => {
            clearTimeout(window.commentObserverTimeout);
            window.commentObserverTimeout = setTimeout(() => {
                updateRepCount(profileID);
            }, 500);
        });
        observer.observe(commentSection, { childList: true, subtree: true });
    }
}

// --- ЗАПУСК ВСЕГО СКРИПТА ---
(function() {
    (function(){function contains(s,t){var e=document.querySelectorAll(s);return Array.from(e).filter(function(e){return RegExp(t,"i").test(e.textContent)})}var o=document.querySelector;document.querySelector=function(s){if(s.includes(":contains(")){var t=s.split(":contains("),e=t[0]||"*",c=t[1].slice(1,-2),n=contains(e,c);return n.length>0?n[0]:null}return o.apply(document,arguments)}})();
    if (document.readyState === 'complete') {
        initializeRepCounter();
    } else {
        window.addEventListener('load', initializeRepCounter);
    }
})();
