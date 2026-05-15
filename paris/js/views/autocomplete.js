import { createApp, ref, reactive, onMounted, onUnmounted, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const Autocomplete = {
    vueApp: null,
    
    initAddress(inputId, suggestionsId, onSelectCallback = null, options = {}) {
        // Version Vue pour l'autocomplétion d'adresse
        const container = document.getElementById(inputId)?.closest('[data-vue-autocomplete]');
        if (container && this.vueApp) {
            this.vueApp.unmount();
        }
        
        const html = `
            <div id="${inputId}-wrapper" data-vue-autocomplete style="position: relative;">
                <input type="text" id="${inputId}" v-model="searchQuery" @input="onInput" @keydown="onKeydown" @blur="onBlur" placeholder="${options.placeholder || 'Saisissez une adresse...'}" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;">
                <div id="${suggestionsId}" v-show="showSuggestions" class="autocomplete-suggestions" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 8px; max-height: 200px; overflow-y: auto; z-index: 1000; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                    <div v-if="loading" class="loading" style="padding: 10px; text-align: center; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Recherche en cours...</div>
                    <div v-else-if="suggestions.length === 0" class="no-results" style="padding: 10px; text-align: center; color: #64748b;">Aucune adresse trouvée</div>
                    <div v-else v-for="(item, idx) in suggestions" :key="idx" class="suggestion-item" :class="{ highlighted: idx === selectedIndex }" @click="selectSuggestion(item)" @mouseenter="selectedIndex = idx" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f1f5f9;">
                        {{ item.properties.label }}
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
        
        this.initVueAddress(inputId, suggestionsId, onSelectCallback, options);
    },
    
    initVueAddress(inputId, suggestionsId, onSelectCallback, options) {
        if (this.vueApp) this.vueApp.unmount();
        
        const element = document.getElementById(`${inputId}-wrapper`);
        if (!element) return;
        
        this.vueApp = createApp({
            setup() {
                const searchQuery = ref('');
                const suggestions = ref([]);
                const selectedIndex = ref(-1);
                const showSuggestions = ref(false);
                const loading = ref(false);
                let lastSelectedValue = '';
                let timeout = null;
                let currentInput = null;
                
                const onInput = (event) => {
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
                    
                    if (query.length < 3) {
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
                            const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
                            const data = await response.json();
                            
                            if (searchQuery.value !== query) return;
                            
                            if (data.features && data.features.length > 0) {
                                suggestions.value = data.features;
                                selectedIndex.value = -1;
                            } else {
                                suggestions.value = [];
                            }
                        } catch (e) {
                            console.error("Erreur auto-complétion:", e);
                            suggestions.value = [];
                        } finally {
                            loading.value = false;
                        }
                    }, 300);
                };
                
                const selectSuggestion = (item) => {
                    searchQuery.value = item.properties.label;
                    lastSelectedValue = searchQuery.value;
                    showSuggestions.value = false;
                    if (onSelectCallback) onSelectCallback(item, document.getElementById(inputId));
                    selectedIndex.value = -1;
                    
                    const inputEl = document.getElementById(inputId);
                    if (inputEl) inputEl.dispatchEvent(new Event('change'));
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
                
                onMounted(() => {
                    currentInput = document.getElementById(inputId);
                    if (currentInput) {
                        currentInput.value = searchQuery.value;
                    }
                });
                
                return {
                    searchQuery, suggestions, selectedIndex, showSuggestions, loading,
                    onInput, onKeydown, onBlur, selectSuggestion
                };
            }
        });
        
        this.vueApp.mount(element);
    },
    
    initCustom(inputId, suggestionsId, searchCallback, renderItemCallback, onSelectCallback, options = {}) {
        const container = document.getElementById(inputId)?.closest('[data-vue-autocomplete-custom]');
        if (container && this.vueApp) {
            this.vueApp.unmount();
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
        if (this.vueApp) this.vueApp.unmount();
        
        const element = document.getElementById(`${inputId}-custom-wrapper`);
        if (!element) return;
        
        this.vueApp = createApp({
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
        
        this.vueApp.mount(element);
    }
};