import { createApp, ref, reactive, onMounted, onUnmounted, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const Autocomplete = {
    // UNE instance Vue par champ (clé = inputId). Avant : une seule instance
    // partagée -> initialiser un 2e autocomplete démontait le 1er (champ qui
    // disparaît). Ici chaque champ ne démonte QUE sa propre instance.
    vueApps: {},

    // Version SIMPLE (sans Vue, sans remplacement de DOM) : on attache des
    // écouteurs au champ existant + on rend dans la liste de suggestions
    // existante. Robuste : un Vue qui ne monte pas ou un .replaceChild qui
    // perd des références ne peut plus casser silencieusement le composant.
    initAddress(inputId, suggestionsId, onSelectCallback = null, options = {}) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const sugg = document.getElementById(suggestionsId);
        if (!sugg) return;

        // Évite d'attacher plusieurs fois si la vue est re-rendue.
        if (input.dataset.autocompleteAddrInit === '1') return;
        input.dataset.autocompleteAddrInit = '1';

        // position FIXED : ancrée à la fenêtre, donc PAS clippée par les overflow
        // des ancêtres (utile dans les modales qui ont overflow:auto/hidden).
        sugg.style.position = 'fixed';
        sugg.style.background = '#ffffff';
        sugg.style.border = '1px solid #e2e8f0';
        sugg.style.borderRadius = '8px';
        sugg.style.maxHeight = '220px';
        sugg.style.overflowY = 'auto';
        sugg.style.zIndex = '20000'; // au-dessus de toute modale
        sugg.style.boxShadow = '0 6px 16px rgba(0,0,0,0.10)';
        sugg.style.margin = '0';
        sugg.style.padding = '0';
        sugg.style.listStyle = 'none';
        sugg.style.display = 'none';
        // Déplace le <ul> directement sur <body> pour échapper à toute clipping
        // mask créé par 'transform' ou 'will-change' sur un ancêtre (cas connu).
        if (sugg.parentElement !== document.body) document.body.appendChild(sugg);
        // Recalage de la position sous le champ à chaque ouverture (et au scroll).
        const positionList = () => {
            const r = input.getBoundingClientRect();
            sugg.style.top = (r.bottom + 4) + 'px';
            sugg.style.left = r.left + 'px';
            sugg.style.width = r.width + 'px';
        };

        let items = [];
        let timer = null;
        let lastSelected = '';

        const closeList = () => { sugg.style.display = 'none'; };
        const openList = () => { positionList(); sugg.style.display = 'block'; };
        const renderItems = (data) => {
            items = data || [];
            if (items.length === 0) {
                sugg.innerHTML = '<li style="padding:10px; color:#64748b; font-size:13px;">Aucune adresse trouvée</li>';
                openList();
                return;
            }
            sugg.innerHTML = items.map((it, i) =>
                `<li data-i="${i}" style="padding:10px 12px; cursor:pointer; border-bottom:1px solid #f1f5f9; font-size:13px; color:#1e293b;">${(it.properties && it.properties.label) || ''}</li>`
            ).join('');
            openList();
            // mousedown pour devancer le blur de l'input
            sugg.querySelectorAll('li[data-i]').forEach(li => {
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const idx = parseInt(li.dataset.i, 10);
                    const chosen = items[idx];
                    if (!chosen) return;
                    const label = (chosen.properties && chosen.properties.label) || '';
                    input.value = label;
                    lastSelected = label;
                    closeList();
                    if (typeof onSelectCallback === 'function') onSelectCallback(chosen, input);
                    // 'input' AVANT 'change' pour que les v-model Vue voient la
                    // nouvelle valeur (Vue ecoute l'evenement 'input').
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                });
                li.addEventListener('mouseenter', () => { li.style.background = '#f1f5f9'; });
                li.addEventListener('mouseleave', () => { li.style.background = ''; });
            });
        };

        input.addEventListener('input', () => {
            const q = (input.value || '').trim();
            if (lastSelected && q !== lastSelected) {
                lastSelected = '';
                if (options && Array.isArray(options.clearOnMismatch)) {
                    options.clearOnMismatch.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
                }
                if (options && typeof options.onMismatch === 'function') options.onMismatch(input);
            }
            if (q.length < 3) { closeList(); return; }
            if (timer) clearTimeout(timer);
            timer = setTimeout(async () => {
                try {
                    const resp = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`);
                    const data = await resp.json();
                    // Vérifie que l'utilisateur n'a pas tapé autre chose entre-temps.
                    if ((input.value || '').trim() !== q) return;
                    renderItems(data && data.features ? data.features : []);
                } catch (e) {
                    console.warn('[Autocomplete] BAN API indisponible :', e && e.message);
                    closeList();
                }
            }, 250);
        });
        input.addEventListener('blur', () => { setTimeout(closeList, 180); });
        input.addEventListener('focus', () => {
            const q = (input.value || '').trim();
            if (q.length >= 3 && items.length > 0) openList();
        });
        // Recalage si la fenêtre bouge (scroll/resize) pendant que la liste est ouverte.
        const onReposition = () => { if (sugg.style.display === 'block') positionList(); };
        window.addEventListener('scroll', onReposition, true);
        window.addEventListener('resize', onReposition);
        // Navigation clavier : flèches + Entrée + Échap.
        let hoverIdx = -1;
        const highlight = (i) => {
            const lis = sugg.querySelectorAll('li[data-i]');
            lis.forEach((li, idx) => { li.style.background = (idx === i) ? '#e0f2fe' : ''; });
        };
        input.addEventListener('keydown', (e) => {
            if (sugg.style.display !== 'block' || items.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); hoverIdx = (hoverIdx + 1) % items.length; highlight(hoverIdx); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); hoverIdx = hoverIdx <= 0 ? items.length - 1 : hoverIdx - 1; highlight(hoverIdx); }
            else if (e.key === 'Enter' && hoverIdx >= 0) {
                e.preventDefault();
                const li = sugg.querySelector(`li[data-i="${hoverIdx}"]`);
                if (li) li.dispatchEvent(new Event('mousedown'));
            } else if (e.key === 'Escape') { closeList(); }
        });
    },

    initCustom(inputId, suggestionsId, searchCallback, renderItemCallback, onSelectCallback, options = {}) {
        if (this.vueApps[inputId]) {
            try { this.vueApps[inputId].unmount(); } catch (e) { /* déjà démonté */ }
            this.vueApps[inputId] = null;
        }
        
        const html = `
            <div id="${inputId}-custom-wrapper" data-vue-autocomplete-custom style="position: relative;">
                <input type="text" id="${inputId}" v-model="searchQuery" @input="onInput" @keydown="onKeydown" @blur="onBlur" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;">
                <div id="${suggestionsId}" v-show="showSuggestions" class="autocomplete-suggestions custom-suggestions" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; max-height: 200px; overflow-y: auto; z-index: 1000; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                    <div v-if="loading" class="loading" style="padding: 10px; text-align: center; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Recherche en cours...</div>
                    <div v-else-if="suggestions.length === 0" class="no-results" style="padding: 10px; text-align: center; color: #64748b;">Aucun résultat trouvé</div>
                    <div v-else v-for="(item, idx) in suggestions" :key="idx" class="suggestion-item" :class="{ highlighted: idx === selectedIndex }" @click="selectSuggestion(item)" @mouseenter="selectedIndex = idx" v-html="renderItem(item)" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f1f5f9;">
                    </div>
                </div>
            </div>
        `;
        
        const wrapper = document.getElementById(inputId)?.parentElement;
        if (wrapper) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const newWrapper = tempDiv.firstElementChild;
            wrapper.parentNode?.replaceChild(newWrapper, wrapper);
        }
        
        this.initVueCustom(inputId, suggestionsId, searchCallback, renderItemCallback, onSelectCallback, options);
    },
    
    initVueCustom(inputId, suggestionsId, searchCallback, renderItemCallback, onSelectCallback, options) {
        if (this.vueApps[inputId]) {
            try { this.vueApps[inputId].unmount(); } catch (e) { /* déjà démonté */ }
        }

        const element = document.getElementById(`${inputId}-custom-wrapper`);
        if (!element) return;

        const _app = createApp({
            setup() {
                const searchQuery = ref('');
                const suggestions = ref([]);
                const selectedIndex = ref(-1);
                const showSuggestions = ref(false);
                const loading = ref(false);
                let lastSelectedValue = '';
                let timeout = null;
                
                const renderItem = (item) => renderItemCallback(item);
                
                const onInput = async (event) => {
                    const query = event.target.value.trim();
                    searchQuery.value = query;
                    
                    if (lastSelectedValue && query !== lastSelectedValue) {
                        lastSelectedValue = '';
                        if (options.clearOnMismatch) {
                            options.clearOnMismatch.forEach(id => {
                                const el = document.getElementById(id);
                                if (el) el.value = '';
                            });
                        }
                        if (options.onMismatch) options.onMismatch(event.target);
                    }
                    
                    if (query.length < 2) {
                        suggestions.value = [];
                        showSuggestions.value = false;
                        selectedIndex.value = -1;
                        return;
                    }
                    
                    loading.value = true;
                    showSuggestions.value = true;
                    
                    if (timeout) clearTimeout(timeout);
                    timeout = setTimeout(async () => {
                        try {
                            const results = await searchCallback(query);
                            if (searchQuery.value !== query) return;
                            
                            if (results && results.length > 0) {
                                suggestions.value = results;
                                selectedIndex.value = -1;
                            } else {
                                suggestions.value = [];
                            }
                        } catch (e) {
                            console.error("Erreur recherche custom:", e);
                            suggestions.value = [];
                        } finally {
                            loading.value = false;
                        }
                    }, 300);
                };
                
                const selectSuggestion = (item) => {
                    lastSelectedValue = searchQuery.value;
                    showSuggestions.value = false;
                    if (onSelectCallback) onSelectCallback(item, document.getElementById(inputId));
                    selectedIndex.value = -1;
                };
                
                const onKeydown = (event) => {
                    if (!showSuggestions.value || suggestions.value.length === 0) return;
                    
                    switch(event.key) {
                        case 'ArrowDown':
                            event.preventDefault();
                            selectedIndex.value = (selectedIndex.value + 1) % suggestions.value.length;
                            break;
                        case 'ArrowUp':
                            event.preventDefault();
                            selectedIndex.value = selectedIndex.value <= 0 ? suggestions.value.length - 1 : selectedIndex.value - 1;
                            break;
                        case 'Enter':
                            event.preventDefault();
                            if (selectedIndex.value >= 0 && suggestions.value[selectedIndex.value]) {
                                selectSuggestion(suggestions.value[selectedIndex.value]);
                            }
                            break;
                        case 'Escape':
                            showSuggestions.value = false;
                            selectedIndex.value = -1;
                            break;
                    }
                };
                
                const onBlur = () => {
                    setTimeout(() => {
                        showSuggestions.value = false;
                        selectedIndex.value = -1;
                    }, 200);
                };
                
                return {
                    searchQuery, suggestions, selectedIndex, showSuggestions, loading,
                    renderItem, onInput, onKeydown, onBlur, selectSuggestion
                };
            }
        });
        
        this.vueApps[inputId] = _app;
        _app.mount(element);
    }
};