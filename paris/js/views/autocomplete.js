export const Autocomplete = {
    initAddress(inputId, suggestionsId, onSelectCallback = null, options = {}) {
        const input = document.getElementById(inputId);
        const suggestionsBox = document.getElementById(suggestionsId);
        if (!input || !suggestionsBox) return;

        // Isolement total de la mémoire (État local pour CHAQUE champ)
        let currentSelectedIndex = -1;
        let currentSuggestionsList = [];
        let lastSelectedValue = input.value.trim();

        // Ajouter une classe pour le style
        suggestionsBox.classList.add('autocomplete-suggestions');
        
        // Empêche l'input de perdre le focus si on clique sur la barre de scroll ou une suggestion
        suggestionsBox.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });

        // Cache la liste si l'utilisateur clique ailleurs et que l'input perd le focus
        input.addEventListener('blur', () => {
            suggestionsBox.style.display = 'none';
            currentSelectedIndex = -1;
        });

        let timeout;
        
        // Gestion de la saisie
        input.addEventListener('input', () => {
            clearTimeout(timeout);
            const query = input.value.trim();
            
            // SÉCURITÉ : Nettoyage intelligent des champs liés si l'utilisateur modifie une sélection validée
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

            // Ajouter un état de chargement
            suggestionsBox.innerHTML = '<li class="loading"><i class="fas fa-spinner fa-spin"></i> Recherche en cours...</li>';
            suggestionsBox.style.display = 'block';

            timeout = setTimeout(async () => {
                try {
                    const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
                    const data = await response.json();
                    
                    // SÉCURITÉ ANTI-GHOST : on annule l'affichage si l'input a été vidé/modifié 
                    // OU si l'utilisateur a déjà cliqué ailleurs sur la page (perte de focus)
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
                        
                        // Ajouter les événements localement
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
                    console.error("Erreur auto-complétion adresse:", e);
                    suggestionsBox.innerHTML = '<li class="no-results">Erreur de chargement</li>';
                    suggestionsBox.style.display = 'block';
                }
            }, 300);
        });

        // Gestion du clavier
        input.addEventListener('keydown', (e) => {
            if (suggestionsBox.style.display !== 'block') return;
            
            const items = suggestionsBox.querySelectorAll('li:not(.no-results):not(.loading)');
            if (items.length === 0) return;
            
            switch(e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    currentSelectedIndex = (currentSelectedIndex + 1) % items.length;
                    this.updateHighlight(suggestionsBox, currentSelectedIndex);
                    this.scrollToSelected(items[currentSelectedIndex]);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    currentSelectedIndex = currentSelectedIndex <= 0 ? items.length - 1 : currentSelectedIndex - 1;
                    this.updateHighlight(suggestionsBox, currentSelectedIndex);
                    this.scrollToSelected(items[currentSelectedIndex]);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (currentSelectedIndex >= 0 && items[currentSelectedIndex]) {
                        items[currentSelectedIndex].click();
                    }
                    break;
                case 'Escape':
                    suggestionsBox.style.display = 'none';
                    currentSelectedIndex = -1;
                    break;
            }
        });

        // Fermeture au clic extérieur
        document.addEventListener('click', (e) => {
            if (e.target !== input && !suggestionsBox.contains(e.target)) {
                suggestionsBox.style.display = 'none';
                currentSelectedIndex = -1;
            }
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

    scrollToSelected(element) {
        if (element) {
            element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    },

    initCustom(inputId, suggestionsId, searchCallback, renderItemCallback, onSelectCallback, options = {}) {
        const input = document.getElementById(inputId);
        const suggestionsBox = document.getElementById(suggestionsId);
        if (!input || !suggestionsBox) return;

        // Isolement total de la mémoire
        let currentSelectedIndex = -1;
        let currentSuggestionsList = [];
        let lastSelectedValue = input.value.trim();

        suggestionsBox.classList.add('autocomplete-suggestions', 'custom-suggestions');
        
        // Empêche l'input de perdre le focus si on clique sur la barre de scroll ou une suggestion
        suggestionsBox.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });

        // Cache la liste si l'utilisateur clique ailleurs et que l'input perd le focus
        input.addEventListener('blur', () => {
            suggestionsBox.style.display = 'none';
            currentSelectedIndex = -1;
        });

        let timeout;
        
        input.addEventListener('input', () => {
            clearTimeout(timeout);
            const query = input.value.trim();

            // SÉCURITÉ : Nettoyage intelligent des champs liés si l'utilisateur modifie une sélection validée
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
            
            if (query.length < 2) {
                suggestionsBox.style.display = 'none';
                currentSelectedIndex = -1;
                return;
            }

            suggestionsBox.innerHTML = '<li class="loading"><i class="fas fa-spinner fa-spin"></i> Recherche...</li>';
            suggestionsBox.style.display = 'block';

            timeout = setTimeout(async () => {
                const matches = await searchCallback(query);
                
                // SÉCURITÉ ANTI-GHOST : focus et texte vérifiés
                if (input.value.trim() !== query || document.activeElement !== input) return;
                
                if (matches && matches.length > 0) {
                    currentSuggestionsList = matches;
                    currentSelectedIndex = -1;
                    
                    suggestionsBox.innerHTML = matches.map((m, idx) => {
                        const html = renderItemCallback(m);
                        return `<li data-index="${idx}" class="suggestion-item">${html}</li>`;
                    }).join('');
                    suggestionsBox.style.display = 'block';

                    // Gestion des événements
                    const lis = suggestionsBox.querySelectorAll('li');
                    lis.forEach((li, idx) => {
                        li.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const item = matches[idx];
                            suggestionsBox.style.display = 'none';
                            lastSelectedValue = input.value.trim();
                            if (onSelectCallback) onSelectCallback(item, input);
                            currentSelectedIndex = -1;
                        });
                        
                        li.addEventListener('mouseenter', () => {
                            currentSelectedIndex = idx;
                            this.updateHighlight(suggestionsBox, idx);
                        });
                    });
                } else {
                    suggestionsBox.innerHTML = '<li class="no-results">Aucun résultat trouvé</li>';
                    suggestionsBox.style.display = 'block';
                }
            }, 300);
        });

        // Gestion du clavier pour custom
        input.addEventListener('keydown', (e) => {
            if (suggestionsBox.style.display !== 'block') return;
            
            const items = suggestionsBox.querySelectorAll('li:not(.no-results):not(.loading)');
            if (items.length === 0) return;
            
            switch(e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    currentSelectedIndex = (currentSelectedIndex + 1) % items.length;
                    this.updateHighlight(suggestionsBox, currentSelectedIndex);
                    this.scrollToSelected(items[currentSelectedIndex]);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    currentSelectedIndex = currentSelectedIndex <= 0 ? items.length - 1 : currentSelectedIndex - 1;
                    this.updateHighlight(suggestionsBox, currentSelectedIndex);
                    this.scrollToSelected(items[currentSelectedIndex]);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (currentSelectedIndex >= 0 && items[currentSelectedIndex]) {
                        items[currentSelectedIndex].click();
                    }
                    break;
                case 'Escape':
                    suggestionsBox.style.display = 'none';
                    currentSelectedIndex = -1;
                    break;
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target !== input && !suggestionsBox.contains(e.target)) {
                suggestionsBox.style.display = 'none';
                currentSelectedIndex = -1;
            }
        });
    }
};