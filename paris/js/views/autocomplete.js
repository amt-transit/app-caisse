export const Autocomplete = {
    initAddress(inputId, suggestionsId, onSelectCallback = null) {
        const input = document.getElementById(inputId);
        const suggestionsBox = document.getElementById(suggestionsId);
        if (!input || !suggestionsBox) return;

        let timeout;
        input.addEventListener('input', () => {
            clearTimeout(timeout);
            const query = input.value.trim();
            
            if (query.length < 3) {
                suggestionsBox.style.display = 'none';
                return;
            }

            timeout = setTimeout(async () => {
                try {
                    const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
                    const data = await response.json();
                    
                    if (data.features && data.features.length > 0) {
                        suggestionsBox.innerHTML = data.features.map(f => `<li data-val="${f.properties.label.replace(/"/g, '&quot;')}">${f.properties.label}</li>`).join('');
                        suggestionsBox.style.display = 'block';

                        suggestionsBox.querySelectorAll('li').forEach((li, index) => {
                            li.addEventListener('click', (e) => {
                                e.stopPropagation();
                                input.value = li.getAttribute('data-val');
                                suggestionsBox.style.display = 'none';
                                input.dispatchEvent(new Event('change'));
                                if (onSelectCallback) onSelectCallback(data.features[index], input);
                            });
                        });
                    } else {
                        suggestionsBox.style.display = 'none';
                    }
                } catch (e) { console.error("Erreur auto-complétion adresse:", e); }
            }, 300);
        });

        document.addEventListener('click', (e) => {
            if (e.target !== input && e.target !== suggestionsBox) suggestionsBox.style.display = 'none';
        });
    },

    initCustom(inputId, suggestionsId, searchCallback, renderItemCallback, onSelectCallback) {
        const input = document.getElementById(inputId);
        const suggestionsBox = document.getElementById(suggestionsId);
        if (!input || !suggestionsBox) return;

        let timeout;
        input.addEventListener('input', () => {
            clearTimeout(timeout);
            const query = input.value.trim();
            
            if (query.length < 2) {
                suggestionsBox.style.display = 'none';
                return;
            }

            timeout = setTimeout(async () => {
                const matches = await searchCallback(query);
                if (matches && matches.length > 0) {
                    suggestionsBox.innerHTML = matches.map((m, idx) => {
                        const html = renderItemCallback(m);
                        return `<li data-index="${idx}">${html}</li>`;
                    }).join('');
                    suggestionsBox.style.display = 'block';

                    suggestionsBox.querySelectorAll('li').forEach(li => {
                        li.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const item = matches[li.getAttribute('data-index')];
                            suggestionsBox.style.display = 'none';
                            if (onSelectCallback) onSelectCallback(item, input);
                        });
                    });
                } else {
                    suggestionsBox.style.display = 'none';
                }
            }, 300);
        });

        document.addEventListener('click', (e) => {
            if (e.target !== input && e.target !== suggestionsBox) suggestionsBox.style.display = 'none';
        });
    }
};