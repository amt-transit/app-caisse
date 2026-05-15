export const Autocomplete = {
    initAddress(inputId, suggestionsId, onSelectCallback = null, options = {}) {
        const input = document.getElementById(inputId);
        const suggestionsBox = document.getElementById(suggestionsId);
        if (!input || !suggestionsBox) return;

        let currentSelectedIndex = -1;
        let currentSuggestionsList = [];
        let lastSelectedValue = input.value.trim();

        suggestionsBox.classList.add('autocomplete-suggestions');
        
        suggestionsBox.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });

        input.addEventListener('blur', () => {
            suggestionsBox.style.display = 'none';
            currentSelectedIndex = -1;
        });

        let timeout;
        
        input.addEventListener('input', () => {
            clearTimeout(timeout);
            const query = input.value.trim();
            
            if (lastSelectedValue && query !== lastSelectedValue) {
                lastSelectedValue = '';
                if (options.clearOnMismatch) {
                    options.clearOnMismatch.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) {
                            el.value = '';
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    });
                }
                if (options.onMismatch) options.onMismatch(input);
            }
            
            if (query.length < 3) {
                suggestionsBox.style.display = 'none';
                currentSelectedIndex = -1;
                return;
            }

            suggestionsBox.innerHTML = '<li class="loading"><i class="fas fa-spinner fa-spin"></i> Recherche en cours...</li>';
            suggestionsBox.style.display = 'block';

            timeout = setTimeout(async () => {
                try {
                    const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
                    const data = await response.json();
                    
                    if (input.value.trim() !== query || document.activeElement !== input) return;

                    if (data.features && data.features.length > 0) {
                        currentSuggestionsList = data.features;
                        currentSelectedIndex = -1;
                        
                        suggestionsBox.innerHTML = data.features.map((item, index) => `
                            <li data-index="${index}" class="suggestion-item">
                                ${item.properties.label}
                            </li>
                        `).join('');
                        suggestionsBox.style.display = 'block';
                        
                        const lis = suggestionsBox.querySelectorAll('li');
                        lis.forEach((li, idx) => {
                            li.addEventListener('click', (e) => {
                                e.stopPropagation();
                                const item = data.features[idx];
                                input.value = item.properties.label;
                                lastSelectedValue = input.value.trim();
                                suggestionsBox.style.display = 'none';
                                input.dispatchEvent(new Event('change'));
                                if (onSelectCallback) onSelectCallback(item, input);
                                currentSelectedIndex = -1;
                            });
                            
                            li.addEventListener('mouseenter', () => {
                                currentSelectedIndex = idx;
                                this.updateHighlight(suggestionsBox, idx);
                            });
                        });
                    } else {
                        suggestionsBox.innerHTML = '<li class="no-results">Aucune adresse trouvée</li>';
                        suggestionsBox.style.display = 'block';
                    }
                } catch (e) {
                    suggestionsBox.innerHTML = '<li class="no-results">Erreur de chargement</li>';
                    suggestionsBox.style.display = 'block';
                }
            }, 300);
        });
    },

    updateHighlight(container, index) {
        const items = container.querySelectorAll('li');
        items.forEach((item, i) => {
            if (i === index) {
                item.classList.add('highlighted');
                item.style.background = 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)';
                item.style.borderLeftColor = '#3b82f6';
            } else {
                item.classList.remove('highlighted');
                item.style.background = '';
                item.style.borderLeftColor = 'transparent';
            }
        });
    },

    initCustom(inputId, suggestionsId, searchCallback, renderItemCallback, onSelectCallback, options = {}) {
        const input = document.getElementById(inputId);
        const suggestionsBox = document.getElementById(suggestionsId);
        if (!input || !suggestionsBox) return;

        let currentSelectedIndex = -1;
        let lastSelectedValue = input.value.trim();
        suggestionsBox.classList.add('autocomplete-suggestions', 'custom-suggestions');
        
        suggestionsBox.addEventListener('mousedown', (e) => e.preventDefault());
        input.addEventListener('blur', () => { suggestionsBox.style.display = 'none'; currentSelectedIndex = -1; });

        let timeout;
        
        input.addEventListener('input', () => {
            clearTimeout(timeout);
            const query = input.value.trim();

            if (lastSelectedValue && query !== lastSelectedValue) {
                lastSelectedValue = '';
                if (options.clearOnMismatch) {
                    options.clearOnMismatch.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
                    });
                }
            }
            
            if (query.length < 2) { suggestionsBox.style.display = 'none'; return; }
            suggestionsBox.innerHTML = '<li class="loading"><i class="fas fa-spinner fa-spin"></i> Recherche...</li>';
            suggestionsBox.style.display = 'block';

            timeout = setTimeout(async () => {
                const matches = await searchCallback(query);
                if (input.value.trim() !== query || document.activeElement !== input) return;
                
                if (matches && matches.length > 0) {
                    suggestionsBox.innerHTML = matches.map((m, idx) => `<li data-index="${idx}" class="suggestion-item">${renderItemCallback(m)}</li>`).join('');
                    suggestionsBox.querySelectorAll('li').forEach((li, idx) => {
                        li.addEventListener('click', (e) => { e.stopPropagation(); suggestionsBox.style.display = 'none'; lastSelectedValue = input.value.trim(); if (onSelectCallback) onSelectCallback(matches[idx], input); });
                    });
                } else {
                    suggestionsBox.innerHTML = '<li class="no-results">Aucun résultat trouvé</li>';
                }
            }, 300);
        });
    }
};