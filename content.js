// content.js

function formatRepNumber(num) {
    const INT_MAX = 2147483647;
    const UINT_MAX = 4294967295;
    if (num >= UINT_MAX) { return 'REP_GOD'; }
    if (num >= INT_MAX) { return '>2.1e9'; }
    if (num >= 1000000000) { return (num / 1000000000).toFixed(1) + 'B'; }
    if (num >= 1000000) { return (num / 1000000).toFixed(1) + 'M'; }
    if (num >= 1000) { return (num / 1000).toFixed(1) + 'k'; }
    return num;
}

function animateCounter(element, start, end, duration) {
    if (!element) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const currentValue = Math.floor(progress * (end - start) + start);
        element.textContent = formatRepNumber(currentValue);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function showSteamNotification(message, type = 'info', duration = 5000) {
    let container = document.getElementById('steam-toast-container-src');
    if (!container) {
        container = document.createElement('div');
        container.id = 'steam-toast-container-src';
        container.className = 'steam-toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `steam-toast steam-toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('show'); }, 10);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
}

const settingsStorage = typeof browser !== 'undefined' ? browser.storage.sync : chrome.storage.sync;
const localCacheStorage = typeof browser !== 'undefined' ? browser.storage.local : chrome.storage.local;
let currentSettings = {}; 
let previousPlusRep = 0;
let previousMinusRep = 0;

let lastHoveredProfileUrl = null;
let hoverTimer = null;
let isFetching = false;
const CACHE_TTL = 24 * 60 * 60 * 1000;
let customReputationPatterns = {
    plus: [],
    minus: []
};

function postRepComment(repText, ui) {
    const commentThreadArea = document.querySelector('.commentthread_area');
    if (!commentThreadArea) {
         showSteamNotification(ui.errorPostComment, 'error');
         return;
    }
    const commentThreadId = commentThreadArea.id.replace('_area', '');
    const textarea = document.getElementById(`${commentThreadId}_textarea`);
    const postButton = document.getElementById(`${commentThreadId}_submit`);
    if (!textarea || !postButton) {
        showSteamNotification(ui.errorPostComment, 'error');
        return;
    }
    textarea.value = repText;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
    setTimeout(() => { postButton.click(); }, 100);
}

async function fetchAllComments(profileID, totalComments) {
    let allCommentsHTML = '';
    const pageSize = 100;
    const fetchPromises = [];
    for (let start = 0; start < totalComments; start += pageSize) {
        const url = `https://steamcommunity.com/comment/Profile/render/${profileID}/-1/?start=${start}&count=${pageSize}`;
        fetchPromises.push(fetch(url).then(response => response.json()));
    }
    try {
        const results = await Promise.all(fetchPromises);
        for (const result of results) {
            if (result && result.comments_html) allCommentsHTML += result.comments_html;
        }
        const parser = new DOMParser();
        const doc = parser.parseFromString(allCommentsHTML, 'text/html');
        return Array.from(doc.querySelectorAll('.commentthread_comment'));
    } catch (error) { return []; }
}

function calculateRepFromComments(allComments, profileURL, patterns) {
    const userReps = new Map();
    allComments.forEach(commentBlock => {
        const authorLinkElement = commentBlock.querySelector('.commentthread_author_link');
        if (!authorLinkElement || authorLinkElement.href.split('?')[0].split('#')[0].toLowerCase() === profileURL.toLowerCase()) {
            return;
        }
        const authorId = authorLinkElement.href;
        const commentTextElement = commentBlock.querySelector('.commentthread_comment_text');
        if (!commentTextElement) return;

        const text = commentTextElement.textContent.toLowerCase().replace(/\s/g, '');
        let repType = 'neutral';
        // ИЗМЕНЕНО: Используем переданные паттерны
        if (patterns.plus.some(p => text.includes(p.replace(/\s/g, '')))) {
            repType = 'plus';
        } else if (patterns.minus.some(p => text.includes(p.replace(/\s/g, '')))) {
            repType = 'minus';
        }

        if (repType !== 'neutral') {
            if (!userReps.has(authorId)) userReps.set(authorId, []);
            userReps.get(authorId).push({ type: repType });
        }
    });

    let plusRep = 0;
    let minusRep = 0;
    for (const reps of userReps.values()) {
        let finalRep = 'neutral';
        switch (currentSettings.countingMode) {
            case 'unique-user-last':
                if (reps.length > 0) finalRep = reps[reps.length - 1].type;
                break;
            case 'unique-user-majority':
                const plusCount = reps.filter(r => r.type === 'plus').length;
                const minusCount = reps.filter(r => r.type === 'minus').length;
                if (plusCount > minusCount) finalRep = 'plus';
                else if (minusCount > plusCount) finalRep = 'minus';
                else if (reps.length > 0) finalRep = reps[reps.length - 1].type;
                break;
            default:
                reps.forEach(rep => {
                    if (rep.type === 'plus') plusRep++;
                    if (rep.type === 'minus') minusRep++;
                });
                finalRep = 'counted_all';
        }
        if (finalRep === 'plus') plusRep++;
        if (finalRep === 'minus') minusRep++;
    }
    return { plusRep, minusRep };
}

async function setCachedRepData(url, data) {
    const cacheKey = `rep_cache_${url}`;
    const cacheData = { data, timestamp: Date.now() };
    try {
        await localCacheStorage.set({ [cacheKey]: cacheData });
    } catch (e) { console.error('[SRC] Error setting cache:', e); }
}

async function getCachedRepData(url) {
    const cacheKey = `rep_cache_${url}`;
    try {
        const result = await localCacheStorage.get(cacheKey);
        if (result && result[cacheKey]) {
            const { data, timestamp } = result[cacheKey];
            if (Date.now() - timestamp < CACHE_TTL) return data;
        }
        return null;
    } catch (e) { return null; }
}

function highlightComment(commentNode, profileURL, patterns) {
    if (!currentSettings.highlightComments || commentNode.classList.contains('rep-processed')) {
        return;
    }
    const authorLinkElement = commentNode.querySelector('.commentthread_author_link');
    if (authorLinkElement && authorLinkElement.href.split('?')[0].split('#')[0].toLowerCase() === profileURL.toLowerCase()) {
        commentNode.classList.add('rep-processed');
        return; 
    }
    const commentTextElement = commentNode.querySelector('.commentthread_comment_text');
    if (commentTextElement) {
        const text = commentTextElement.textContent.toLowerCase().replace(/\s/g, '');
        if (patterns.plus.some(p => text.includes(p.replace(/\s/g, '')))) {
            commentNode.classList.add('rep-positive');
        } else if (patterns.minus.some(p => text.includes(p.replace(/\s/g, '')))) {
            commentNode.classList.add('rep-negative');
        }
    }
    commentNode.classList.add('rep-processed');
}



async function updateRepCount(profileID, ui) {
    const plusRepSpan = document.querySelector('.rep-count-plus');
    const minusRepSpan = document.querySelector('.rep-count-minus');
    if (!plusRepSpan || !minusRepSpan) return; 

    const profileURL = window.location.href.split('?')[0].split('#')[0];
    const totalCountMatch = document.documentElement.innerHTML.match(/"total_count":\s*(\d+)/);
    const totalComments = totalCountMatch ? parseInt(totalCountMatch[1], 10) : 0;
    
    if (totalComments === 0) {
        await setCachedRepData(profileURL, { plusRep: 0, minusRep: 0 });
        plusRepSpan.textContent = '0';
        minusRepSpan.textContent = '0';
        return;
    }
    
    const allComments = await fetchAllComments(profileID, totalComments);
    const { plusRep, minusRep } = calculateRepFromComments(allComments, profileURL, customReputationPatterns);

    await setCachedRepData(profileURL, { plusRep, minusRep });
    
    if (plusRep !== previousPlusRep || minusRep !== previousMinusRep) {
        animateCounter(plusRepSpan, previousPlusRep, plusRep, 800);
        animateCounter(minusRepSpan, previousMinusRep, minusRep, 800);
    } else {
        plusRepSpan.textContent = formatRepNumber(plusRep);
        minusRepSpan.textContent = formatRepNumber(minusRep);
    }
    
    if (currentSettings.profileBar) {
        const targetContainer = document.querySelector('.profile_header_bg_texture');
        if (targetContainer) {
            let bar = document.getElementById('rep-profile-bar');
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'rep-profile-bar';
                targetContainer.prepend(bar);
            }
            const totalRep = plusRep + minusRep;
            bar.style.backgroundColor = totalRep > 0 ? `hsl(${(plusRep / totalRep) * 120}, 80%, 45%)` : '#5a6873';
            setTimeout(() => { bar.style.transform = 'scaleX(1)'; }, 100);
        }
    }
    
    previousPlusRep = plusRep;
    previousMinusRep = minusRep;
}

async function initializeRepCounter() {
    if (document.querySelector('.custom-rep-right-col')) return;
    let langKey = 'en';
    const webuiConfigElement = document.getElementById('webui_config');
    let ui;
    if (webuiConfigElement && webuiConfigElement.dataset.config) {
        try {
            const config = JSON.parse(webuiConfigElement.dataset.config);
            if (config.LANGUAGE) langKey = config.LANGUAGE;
        } catch (e) { 
            ui = locales['en'];
            console.error('Steam Rep Counter:', ui.errorParseConfig, e);
            showSteamNotification(ui.errorParseConfig, 'error');
        }
    }
    ui = locales[langKey] || locales['en'];
    const targetElement = document.querySelector('.profile_header_badgeinfo');
    if (!targetElement) return;
    const profileIdMatch = document.documentElement.innerHTML.match(/InitializeCommentThread\s*\(\s*"Profile",\s*"Profile_(\d+)"/);
    if (!profileIdMatch) return;
    const profileID = profileIdMatch[1];
    let isOwnProfile = false; 
    const loggedInUserAvatarLink = document.querySelector('a.user_avatar.playerAvatar');
    if (loggedInUserAvatarLink) {
        const loggedInUserUrl = loggedInUserAvatarLink.href.split('?')[0].split('#')[0];
        const currentPageUrl = window.location.href.split('?')[0].split('#')[0];
        if (loggedInUserUrl.toLowerCase() === currentPageUrl.toLowerCase()) {
            isOwnProfile = true;
        }
    }
    const repContainer = document.createElement('div');
    repContainer.className = 'custom-rep-right-col';
    const repTextSpan = document.createElement('span');
    repTextSpan.className = 'rep-text';
    const plusRepSpan = Object.assign(document.createElement('span'), { className: 'rep-count-plus', textContent: '...' });
    const minusRepSpan = Object.assign(document.createElement('span'), { className: 'rep-count-minus', textContent: '...' });
    repTextSpan.append(plusRepSpan, ' +rep ', Object.assign(document.createElement('span'), { className: 'rep-separator', textContent: ' \\ ' }), minusRepSpan, ' -rep');
    repContainer.appendChild(repTextSpan);
    if (!isOwnProfile) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'rep-buttons-container';
        buttonContainer.append(Object.assign(document.createElement('button'), { textContent: '+rep', className: 'rep-button rep-button-plus', onclick: () => postRepComment('+rep', ui) }), Object.assign(document.createElement('button'), { textContent: '-rep', className: 'rep-button rep-button-minus', onclick: () => postRepComment('-rep', ui) }));
        repContainer.appendChild(buttonContainer);
    }
    targetElement.appendChild(repContainer);

    await updateRepCount(profileID, ui);

    const profileURL = window.location.href.split('?')[0].split('#')[0];
    const commentSection = document.querySelector('.commentthread_area');

    document.querySelectorAll('.commentthread_comment:not(.rep-processed)').forEach(node => {
        highlightComment(node, profileURL, customReputationPatterns);
    });

    if (commentSection) {
        const observer = new MutationObserver((mutations) => {
            let hasNewNodes = false;
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.matches && node.matches('.commentthread_comment')) {
                        hasNewNodes = true;
                    }
                });
            });

            if (hasNewNodes) {
                commentSection.classList.add('no-highlight-animation');

                document.querySelectorAll('.commentthread_comment:not(.rep-processed)').forEach(node => {
                    highlightComment(node, profileURL, customReputationPatterns);
                });

                setTimeout(() => {
                    commentSection.classList.remove('no-highlight-animation');
                }, 50);

                clearTimeout(window.commentObserverTimeout);
                window.commentObserverTimeout = setTimeout(() => {
                    updateRepCount(profileID, ui);
                }, 500);
            }
        });
        observer.observe(commentSection, { childList: true, subtree: true });
    }
}

async function getRepDataForProfile(profileUrl) {
    if (isFetching) return null;
    const cachedData = await getCachedRepData(profileUrl);
    if (cachedData) return cachedData;
    isFetching = true;
    try {
        const response = await fetch(profileUrl);
        if (!response.ok) throw new Error(`Steam returned status ${response.status}`);
        const html = await response.text();
        const profileIdMatch = html.match(/InitializeCommentThread\s*\(\s*"Profile",\s*"Profile_(\d+)"/);
        const totalCountMatch = html.match(/"total_count":\s*(\d+)/);
        if (!profileIdMatch || !totalCountMatch) throw new Error("Could not parse profile data.");
        const profileID = profileIdMatch[1];
        const totalComments = parseInt(totalCountMatch[1], 10);
        let repData;
        if (totalComments === 0) {
            repData = { plusRep: 0, minusRep: 0 };
        } else {
            const allComments = await fetchAllComments(profileID, totalComments);
            repData = calculateRepFromComments(allComments, profileUrl, customReputationPatterns);
        }
        const finalData = { plusRep: repData.plusRep, minusRep: repData.minusRep };
        await setCachedRepData(profileUrl, finalData);
        isFetching = false;
        return finalData;
    } catch (error) {
        console.error(`[SRC] Failed to get rep data for ${profileUrl}:`, error);
        isFetching = false;
        return null;
    }
}

async function addRepBarToMiniprofile(miniprofileCard) {
    if (!lastHoveredProfileUrl) return;
    const targetContainer = miniprofileCard.querySelector('.miniprofile_container');
    if (!targetContainer) return;
    let bar = targetContainer.querySelector('#rep-miniprofile-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'rep-miniprofile-bar';
        targetContainer.appendChild(bar);
    }
    bar.style.backgroundColor = '#5a6873';
    bar.style.display = 'block';
    const repData = await getRepDataForProfile(lastHoveredProfileUrl);
    if (repData) {
        const totalRep = repData.plusRep + repData.minusRep;
        bar.style.backgroundColor = totalRep > 0 
            ? `hsl(${(repData.plusRep / totalRep) * 120}, 80%, 45%)` 
            : '#5a6873';
    } else {
        bar.style.display = 'none';
    }
}

function observeMiniprofiles() {
    document.body.addEventListener('mouseover', (e) => {
        const triggerElement = e.target.closest('[data-miniprofile]');
        if (triggerElement) {
            clearTimeout(hoverTimer);
            const linkElement = triggerElement.querySelector('a[href*="/id/"], a[href*="/profiles/"]') || triggerElement.closest('a[href*="/id/"], a[href*="/profiles/"]');
            if (linkElement) {
                const profileUrl = linkElement.href.split('?')[0].split('#')[0];
                lastHoveredProfileUrl = profileUrl;
                hoverTimer = setTimeout(() => {
                    const miniprofileCard = document.querySelector('.miniprofile_hover');
                    if (miniprofileCard && miniprofileCard.style.display === 'block') {
                         addRepBarToMiniprofile(miniprofileCard);
                    }
                }, 1500);
            }
        }
    });
    document.body.addEventListener('mouseout', (e) => {
        const triggerElement = e.target.closest('[data-miniprofile]');
        if (triggerElement) clearTimeout(hoverTimer);
    });
    const miniprofileCard = document.querySelector('.miniprofile_hover');
    if (!miniprofileCard) return;
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.attributeName === 'style' && mutation.target.style.display === 'block') {
                addRepBarToMiniprofile(mutation.target);
            }
        }
    });
    observer.observe(miniprofileCard, { attributes: true });
}

// --- ФИНАЛЬНЫЙ ЗАПУСК ВСЕГО ГОВНА ---
(function() {
    settingsStorage.get({
        highlightComments: true,
        profileBar: true,
        countingMode: 'all',
        currentTheme: 'default',
        currentLanguage: 'en',
        plusKeywords: reputationPatterns.plus, 
        minusKeywords: reputationPatterns.minus
    }, (items) => {
        currentSettings = items;
        customReputationPatterns.plus = items.plusKeywords;
        customReputationPatterns.minus = items.minusKeywords;
        if (window.location.href.includes('/id/') || window.location.href.includes('/profiles/')) {
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                initializeRepCounter();
            } else {
                window.addEventListener('load', initializeRepCounter);
            }
        }
        observeMiniprofiles();
    });
})();
