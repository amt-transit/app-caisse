export const Autocomplete = {
    // Variable pour stocker l'index sélectionné
    currentSelectedIndex: -1,
    currentSuggestionsList: [],
    currentInputElement: null,
    currentSuggestionsBox: null,

    initAddress(inputId, suggestionsId, onSelectCallback = null) {
        const input = document.getElementById(inputId);
        const suggestionsBox = document.getElementById(suggestionsId);
        if (!input || !suggestionsBox) return;

        // Ajouter une classe pour le style
        suggestionsBox.classList.add('autocomplete-suggestions');
        
        // Empêche l'input de perdre le focus si on clique sur la barre de scroll ou une suggestion
        suggestionsBox.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });

        // Cache la liste si l'utilisateur clique ailleurs et que l'input perd le focus
        input.addEventListener('blur', () => {
            suggestionsBox.style.display = 'none';
            this.currentSelectedIndex = -1;
        });

        let timeout;
        
        // Gestion de la saisie
        input.addEventListener('input', () => {
            clearTimeout(timeout);
            const query = input.value.trim();
            
            if (query.length < 3) {
                suggestionsBox.style.display = 'none';
                this.currentSelectedIndex = -1;
                return;
            }

            // Ajouter un état de chargement
            suggestionsBox.innerHTML = '<li class="loading"><i class="fas fa-spinner fa-spin"></i> Recherche en cours...</li>';
            suggestionsBox.style.display = 'block';

            timeout = setTimeout(async () => {
                try {
                    const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
                    const data = await response.json();
                    
                    // Sécurité : on annule l'affichage si l'input a été vidé ou modifié pendant le temps de réponse de l'API
                    if (input.value.trim() !== query) return;

                    if (data.features && data.features.length > 0) {
                        this.currentSuggestionsList = data.features;
                        this.currentSelectedIndex = -1;
                        this.renderSuggestions(suggestionsBox, data.features, (item, index) => {
                            input.value = item.properties.label;
                            suggestionsBox.style.display = 'none';
                            input.dispatchEvent(new Event('change'));
                            if (onSelectCallback) onSelectCallback(item, input);
                            this.currentSelectedIndex = -1;
                        }, (index) => {
                            this.currentSelectedIndex = index;
                            this.updateHighlight(suggestionsBox, index);
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
                    this.currentSelectedIndex = (this.currentSelectedIndex + 1) % items.length;
                    this.updateHighlight(suggestionsBox, this.currentSelectedIndex);
                    this.scrollToSelected(items[this.currentSelectedIndex]);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.currentSelectedIndex = this.currentSelectedIndex <= 0 ? items.length - 1 : this.currentSelectedIndex - 1;
                    this.updateHighlight(suggestionsBox, this.currentSelectedIndex);
                    this.scrollToSelected(items[this.currentSelectedIndex]);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (this.currentSelectedIndex >= 0 && items[this.currentSelectedIndex]) {
                        items[this.currentSelectedIndex].click();
                    }
                    break;
                case 'Escape':
                    suggestionsBox.style.display = 'none';
                    this.currentSelectedIndex = -1;
                    break;
            }
        });

        // Fermeture au clic extérieur
        document.addEventListener('click', (e) => {
            if (e.target !== input && !suggestionsBox.contains(e.target)) {
                suggestionsBox.style.display = 'none';
                this.currentSelectedIndex = -1;
            }
        });
    },

    renderSuggestions(container, items, onSelect, onHighlight) {
        container.innerHTML = items.map((item, index) => `
            <li data-index="${index}" class="suggestion-item">
                ${item.properties.label}
            </li>
        `).join('');
        
        container.style.display = 'block';
        
        // Ajouter les événements
        const lis = container.querySelectorAll('li');
        lis.forEach((li, idx) => {
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                onSelect(items[idx], idx);
            });
            
            li.addEventListener('mouseenter', () => {
                this.currentSelectedIndex = idx;
                this.updateHighlight(container, idx);
                if (onHighlight) onHighlight(idx);
            });
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

    initCustom(inputId, suggestionsId, searchCallback, renderItemCallback, onSelectCallback) {
        const input = document.getElementById(inputId);
        const suggestionsBox = document.getElementById(suggestionsId);
        if (!input || !suggestionsBox) return;

        suggestionsBox.classList.add('autocomplete-suggestions', 'custom-suggestions');
        
        // Empêche l'input de perdre le focus si on clique sur la barre de scroll ou une suggestion
        suggestionsBox.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });

        // Cache la liste si l'utilisateur clique ailleurs et que l'input perd le focus
        input.addEventListener('blur', () => {
            suggestionsBox.style.display = 'none';
            this.currentSelectedIndex = -1;
        });

        let timeout;
        
        input.addEventListener('input', () => {
            clearTimeout(timeout);
            const query = input.value.trim();
            
            if (query.length < 2) {
                suggestionsBox.style.display = 'none';
                this.currentSelectedIndex = -1;
                return;
            }

            suggestionsBox.innerHTML = '<li class="loading"><i class="fas fa-spinner fa-spin"></i> Recherche...</li>';
            suggestionsBox.style.display = 'block';

            timeout = setTimeout(async () => {
                const matches = await searchCallback(query);
                // Sécurité : on annule si l'utilisateur a effacé ou tapé autre chose entre-temps
                if (input.value.trim() !== query) return;
                if (matches && matches.length > 0) {
                    this.currentSuggestionsList = matches;
                    this.currentSelectedIndex = -1;
                    
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
                            if (onSelectCallback) onSelectCallback(item, input);
                            this.currentSelectedIndex = -1;
                        });
                        
                        li.addEventListener('mouseenter', () => {
                            this.currentSelectedIndex = idx;
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
                    this.currentSelectedIndex = (this.currentSelectedIndex + 1) % items.length;
                    this.updateHighlight(suggestionsBox, this.currentSelectedIndex);
                    this.scrollToSelected(items[this.currentSelectedIndex]);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.currentSelectedIndex = this.currentSelectedIndex <= 0 ? items.length - 1 : this.currentSelectedIndex - 1;
                    this.updateHighlight(suggestionsBox, this.currentSelectedIndex);
                    this.scrollToSelected(items[this.currentSelectedIndex]);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (this.currentSelectedIndex >= 0 && items[this.currentSelectedIndex]) {
                        items[this.currentSelectedIndex].click();
                    }
                    break;
                case 'Escape':
                    suggestionsBox.style.display = 'none';
                    this.currentSelectedIndex = -1;
                    break;
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target !== input && !suggestionsBox.contains(e.target)) {
                suggestionsBox.style.display = 'none';
                this.currentSelectedIndex = -1;
            }
        });
    }
};