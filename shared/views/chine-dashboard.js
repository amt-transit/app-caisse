import { db } from '../../firebase-config.js';
import { collection, query, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, onMounted, computed } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const ChineDashboardView = {
    vueApp: null,

    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.chineDashboard = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .chine-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .access-denied { text-align: center; padding: 50px; background: white; border-radius: 12px; border: 1px solid #fee2e2; }
            </style>

            <div id="vue-chine-app" class="chine-page" v-cloak>
                <!-- Message si mauvaise agence (Sécurité Frontend) -->
                <div v-if="!isChineAgency" class="access-denied">
                    <div style="font-size: 48px; margin-bottom: 15px;">⛔</div>
                    <h2 style="color: #ef4444; margin-top: 0;">Accès Refusé</h2>
                    <p style="color: #64748b;">Cette page est exclusivement réservée aux agences <strong>Chine</strong> et <strong>Abidjan (Chine)</strong>.</p>
                </div>

                <!-- Contenu exclusif Chine -->
                <div v-else>
                    <div style="background: white; border-radius: 16px; padding: 20px 25px; display: flex; align-items: center; gap: 15px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                        <div style="font-size: 32px; background: #fef2f2; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px;">🇨🇳</div>
                        <div>
                            <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #0f172a;">Tableau de Bord Asie</h1>
                            <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Gestion exclusive des flux Chine -> Abidjan</p>
                        </div>
                    </div>

                    <div style="background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0;">
                        <p>Bienvenue sur le module Vue 3 exclusif à la Chine !</p>
                        <p>Vous pourrez y ajouter vos chargements spécifiques, stats locales, etc.</p>
                    </div>
                </div>
            </div>
        `;

        const targetContainer = container || document.getElementById('contentContainer');
        targetContainer.innerHTML = html;
        this.initVue();
    },

    initVue() {
        if (this.vueApp) this.vueApp.unmount();

        this.vueApp = createApp({
            setup() {
                const activeAgency = ref(sessionStorage.getItem('currentActiveAgency') || 'abidjan');
                
                // Vérification stricte de l'agence (IDs : chine ou abidjan_chine)
                const isChineAgency = computed(() => {
                    return activeAgency.value === 'abidjan_chine' || activeAgency.value === 'chine';
                });

                onMounted(() => {
                    if (isChineAgency.value) {
                        console.log("Module Chine partagé initialisé avec succès !");
                    }
                });

                return {
                    isChineAgency,
                    activeAgency
                };
            }
        });

        this.vueApp.mount('#vue-chine-app');
    }
};