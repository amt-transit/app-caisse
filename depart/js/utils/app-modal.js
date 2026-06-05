export const AppModal = {
    init: function() {
        if (document.getElementById('app-modal-overlay')) return;
        const html = `
            <div id="app-modal-overlay" class="app-modal-overlay">
                <div class="app-modal-box">
                    <div class="app-modal-icon" id="app-modal-icon"></div>
                    <h3 class="app-modal-title" id="app-modal-title"></h3>
                    <p class="app-modal-message" id="app-modal-message"></p>
                    <input type="text" id="app-modal-input" class="app-modal-input" style="display:none;" autocomplete="off">
                    <div class="app-modal-actions">
                        <button id="app-modal-cancel" class="app-modal-btn app-modal-btn-cancel">Annuler</button>
                        <button id="app-modal-confirm" class="app-modal-btn app-modal-btn-confirm">OK</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    },
    show: function(options) {
        return new Promise((resolve) => {
            this.init();
            const overlay = document.getElementById('app-modal-overlay');
            const title = document.getElementById('app-modal-title');
            const message = document.getElementById('app-modal-message');
            const icon = document.getElementById('app-modal-icon');
            const input = document.getElementById('app-modal-input');
            const btnCancel = document.getElementById('app-modal-cancel');
            const btnConfirm = document.getElementById('app-modal-confirm');

            title.textContent = options.title || 'Information';
            message.innerHTML = (options.message || '').replace(/\n/g, '<br>');
            
            btnCancel.style.display = (options.type === 'confirm' || options.type === 'prompt') ? 'block' : 'none';
            btnConfirm.className = options.isDanger ? 'app-modal-btn app-modal-btn-danger' : 'app-modal-btn app-modal-btn-confirm';
            btnConfirm.textContent = options.confirmText || 'OK';

            if (options.type === 'prompt') {
                input.style.display = 'block';
                input.value = options.defaultValue || '';
                setTimeout(() => { input.focus(); input.select(); }, 100);
            } else {
                input.style.display = 'none';
            }

            if (options.type === 'error') icon.innerHTML = '❌';
            else if (options.type === 'success') icon.innerHTML = '✅';
            else if (options.type === 'confirm') icon.innerHTML = '❓';
            else icon.innerHTML = '💡';

            overlay.classList.add('active');

            const cleanup = () => { overlay.classList.remove('active'); btnConfirm.onclick = null; btnCancel.onclick = null; };
            btnConfirm.onclick = () => { cleanup(); resolve(options.type === 'prompt' ? input.value : true); };
            btnCancel.onclick = () => { cleanup(); resolve(options.type === 'prompt' ? null : false); };
        });
    },
    alert: function(message, title='Information') { return this.show({ type: 'info', message, title }); },
    error: function(message, title='Erreur') { return this.show({ type: 'error', message, title }); },
    success: function(message, title='Succès') { return this.show({ type: 'success', message, title }); },
    confirm: function(message, title='Confirmation', isDanger=false) { return this.show({ type: 'confirm', message, title, isDanger, confirmText: 'Confirmer' }); },
    prompt: function(message, defaultValue='', title='Saisie') { return this.show({ type: 'prompt', message, title, defaultValue, confirmText: 'Valider' }); }
};