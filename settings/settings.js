document.addEventListener('DOMContentLoaded', () => {
    const storage = typeof browser !== 'undefined' ? browser.storage.sync : chrome.storage.sync;
    const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;

    const elements = {

        highlightComments: document.getElementById('highlight-comments'),
        profileBar: document.getElementById('profile-bar'),
        countingMode: document.getElementById('counting-mode'),
        themeToggle: document.getElementById('theme-toggle'),
        versionDisplay: document.getElementById('version-display'),
        resetAllBtn: document.getElementById('reset-all-settings-btn'),
        // Кастомний селект яхыка
        langSelectContainer: document.getElementById('language-custom-select'),
        langSelectTrigger: document.querySelector('.custom-select-trigger'),
        langSelectText: document.getElementById('selected-language-text'),
        langOptionsContainer: document.querySelector('.custom-options'),

        editKeywordsBtn: document.getElementById('edit-keywords-btn'),
        keywordsModal: document.getElementById('keywords-modal'),
        plusKeywordsTextarea: document.getElementById('plus-keywords-textarea'),
        minusKeywordsTextarea: document.getElementById('minus-keywords-textarea'),
        saveKeywordsBtn: document.getElementById('save-keywords-btn'),
        cancelKeywordsBtn: document.getElementById('cancel-keywords-btn'),
        resetKeywordsBtn: document.getElementById('reset-keywords-btn')
    };

    let currentLanguage = 'en'; 
    let currentUiStrings = locales['en'].settingsUI; 
    const defaultKeywords = {
        plus: reputationPatterns.plus,
        minus: reputationPatterns.minus
    };


    function populateLanguageSelector() {
        const languageMap = {
            'en': 'English', 'bulgarian': 'Български', 'czech': 'Čeština', 'danish': 'Dansk',
            'dutch': 'Nederlands', 'finnish': 'Suomi', 'french': 'Français', 'german': 'Deutsch',
            'greek': 'Ελληνικά', 'hungarian': 'Magyar', 'indonesian': 'Bahasa Indonesia', 'italian': 'Italiano',
            'japanese': '日本語', 'koreana': '한국어', 'latam': 'Español (Latinoamérica)', 'norwegian': 'Norsk',
            'polish': 'Polski', 'portuguese': 'Português', 'brazilian': 'Português (Brasil)', 'romanian': 'Română',
            'russian': 'Русский', 'schinese': '简体中文', 'spanish': 'Español (España)', 'swedish': 'Svenska',
            'tchinese': '繁體中文', 'thai': 'ไทย', 'turkish': 'Türkçe', 'ukrainian': 'Українська', 'vietnamese': 'Tiếng Việt'
        };
        const sortedLangs = Object.entries(languageMap).sort(([, a], [, b]) => a.localeCompare(b));
        
        elements.langOptionsContainer.innerHTML = ''; 
        
        for (const [langCode, langName] of sortedLangs) {
            if (locales[langCode]) {
                const option = document.createElement('div');
                option.className = 'custom-option';
                option.textContent = langName;
                option.dataset.value = langCode;
                elements.langOptionsContainer.appendChild(option);
            }
        }
    }

    function applyLocalization(lang) {
        const fallbackStrings = locales['en'].settingsUI;
        currentUiStrings = (locales[lang] && locales[lang].settingsUI) || fallbackStrings;
        
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            element.textContent = currentUiStrings[key] || fallbackStrings[key] || `[${key}]`;
        });

        const placeholderText = currentUiStrings.keywordsPlaceholder || fallbackStrings.keywordsPlaceholder;
        elements.plusKeywordsTextarea.placeholder = placeholderText;
        elements.minusKeywordsTextarea.placeholder = placeholderText;
    }

    function applyTheme(themeName) {
        document.body.classList.toggle('theme-oldschool', themeName === 'oldschool');
    }

    function saveAllSettings() {
        const plusKeywordsRaw = elements.plusKeywordsTextarea.value.split(/,/).map(k => k.trim()).filter(Boolean);
        const minusKeywordsRaw = elements.minusKeywordsTextarea.value.split(/,/).map(k => k.trim()).filter(Boolean);

        storage.set({
            highlightComments: elements.highlightComments.checked,
            profileBar: elements.profileBar.checked,
            countingMode: elements.countingMode.value,
            currentTheme: elements.themeToggle.checked ? 'oldschool' : 'default',
            currentLanguage: currentLanguage,

            plusKeywords: plusKeywordsRaw,
            minusKeywords: minusKeywordsRaw
        });
    }

    function loadAllSettings() {
        storage.get({
            highlightComments: true,
            profileBar: true,
            countingMode: 'all',
            currentTheme: 'default',
            currentLanguage: 'en',
            plusKeywords: defaultKeywords.plus,
            minusKeywords: defaultKeywords.minus
        }, (items) => {
            elements.highlightComments.checked = items.highlightComments;
            elements.profileBar.checked = items.profileBar;
            elements.countingMode.value = items.countingMode;
            elements.themeToggle.checked = items.currentTheme === 'oldschool';
            currentLanguage = items.currentLanguage;
            const langName = elements.langOptionsContainer.querySelector(`[data-value="${currentLanguage}"]`)?.textContent;
            if (langName) elements.langSelectText.textContent = langName;
            elements.plusKeywordsTextarea.value = items.plusKeywords.join(', ');
            elements.minusKeywordsTextarea.value = items.minusKeywords.join(', ');

            applyTheme(items.currentTheme);
            applyLocalization(items.currentLanguage);
        });
    }
    
    populateLanguageSelector();
    loadAllSettings();
    displayVersion();

    ['highlightComments', 'profileBar', 'countingMode'].forEach(id => {
        elements[id].addEventListener('change', saveAllSettings);
    });

    elements.themeToggle.addEventListener('change', () => {
        applyTheme(elements.themeToggle.checked ? 'oldschool' : 'default');
        saveAllSettings();
    });

    elements.langSelectTrigger.addEventListener('click', () => {
        elements.langSelectContainer.classList.toggle('open');
    });
    elements.langOptionsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('custom-option')) {
            currentLanguage = e.target.dataset.value;
            elements.langSelectText.textContent = e.target.textContent;
            elements.langSelectContainer.classList.remove('open');
            applyLocalization(currentLanguage);
            saveAllSettings();
        }
    });
    window.addEventListener('click', (e) => {
        if (!elements.langSelectContainer.contains(e.target)) {
            elements.langSelectContainer.classList.remove('open');
        }
    });

    elements.editKeywordsBtn.addEventListener('click', () => {
        elements.keywordsModal.classList.remove('hidden');
    });
    elements.cancelKeywordsBtn.addEventListener('click', () => {
        elements.keywordsModal.classList.add('hidden');
        loadAllSettings(); 
    });
    elements.saveKeywordsBtn.addEventListener('click', () => {
        saveAllSettings();
        elements.keywordsModal.classList.add('hidden');
    });
    elements.resetKeywordsBtn.addEventListener('click', (e) => {
        e.preventDefault(); 
        if (confirm(currentUiStrings.confirmResetKeywords)) {
            elements.plusKeywordsTextarea.value = defaultKeywords.plus.join(', ');
            elements.minusKeywordsTextarea.value = defaultKeywords.minus.join(', ');
        }
    });

    elements.resetAllBtn.addEventListener('click', () => {
        if (confirm(currentUiStrings.confirmResetAll)) {
            storage.clear(() => {
                window.location.reload();
            });
        }
    });
    function displayVersion() {
        const manifest = runtime.getManifest();
        if (elements.versionDisplay) {
            elements.versionDisplay.textContent = `v${manifest.version}`;
        }
    }
});