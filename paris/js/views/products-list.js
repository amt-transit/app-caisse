import { db } from '../../../firebase-config.js';
import { collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ProductsListView = {
    products: [],
    filteredProducts: [],

    render(app) {
        this.app = app;
        // Exposer la vue globalement pour les événements onclick
        if (!window.app.views) window.app.views = {};
        window.app.views.productsList = this;

        const html = `
            <div style="max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;">
                
                <!-- EN-TÊTE -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="background: #eff6ff; color: #3b82f6; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px;">
                            📦
                        </div>
                        <div>
                            <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 800;">Produits</h2>
                            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Gestion du catalogue de produits et services</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-primary" onclick="window.app.views.productsList.openAddModal()" style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-plus"></i> Nouveau produit
                        </button>
                    </div>
                </div>

                <!-- KPI GRID -->
                <div class="stats-grid" style="margin-bottom: 25px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 24px; background: #f8fafc; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">📋</div>
                        <div>
                            <div style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Total produits</div>
                            <div id="kpiTotal" style="font-size: 22px; font-weight: 800; color: #0f172a;">0</div>
                        </div>
                    </div>
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 24px; background: #e0f2fe; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">📦</div>
                        <div>
                            <div style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Colis</div>
                            <div id="kpiColis" style="font-size: 22px; font-weight: 800; color: #0f172a;">0</div>
                        </div>
                    </div>
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 24px; background: #fef3c7; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">🔧</div>
                        <div>
                            <div style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Services</div>
                            <div id="kpiServices" style="font-size: 22px; font-weight: 800; color: #0f172a;">0</div>
                        </div>
                    </div>
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 24px; background: #dcfce7; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">📊</div>
                        <div>
                            <div style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Stock</div>
                            <div id="kpiStock" style="font-size: 22px; font-weight: 800; color: #0f172a;">0</div>
                        </div>
                    </div>
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 24px; background: #f3e8ff; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">🏷️</div>
                        <div>
                            <div style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Remises</div>
                            <div id="kpiRemises" style="font-size: 22px; font-weight: 800; color: #0f172a;">0</div>
                        </div>
                    </div>
                </div>

                <!-- FILTRES -->
                <div class="form-card" style="margin-bottom: 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div class="form-grid" style="grid-template-columns: 2fr 1fr auto; align-items: end; margin: 0;">
                        <div class="form-group" style="margin: 0;">
                            <label>🔍 Recherche</label>
                            <input type="text" id="prodSearchInput" placeholder="Référence, catégorie, description...">
                        </div>
                        <div class="form-group" style="margin: 0;">
                            <label>📊 Catégorie</label>
                            <select id="prodCatFilter">
                                <option value="">Toutes les catégories</option>
                                <option value="COLIS">📦 COLIS</option>
                                <option value="SERVICES">🔧 SERVICES</option>
                                <option value="STOCK">📊 STOCK</option>
                                <option value="REMISES">🏷️ REMISES</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- TABLEAU -->
                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02); padding: 0; overflow: hidden;">
                    <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
                        <h3 style="margin: 0; font-size: 16px; color: #1e293b;">📋 Liste des produits</h3>
                        <span class="badge" id="prodCountBadge" style="background: #e2e8f0; color: #475569;">0 produit(s)</span>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="data-table" style="width: 100%; margin: 0;">
                            <thead style="background: white;">
                                <tr><th style="padding: 15px; width: 120px;">📊 Catégorie</th><th>📝 Description</th><th style="text-align: right; width: 150px;">💰 Prix</th><th style="text-align: center; width: 100px;">⚙️ Actions</th></tr>
                            </thead>
                            <tbody id="prodTableBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- MODAL AJOUT / MODIFICATION PRODUIT -->
            <div id="productModal" class="modal" style="display:none; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.8); align-items:center; justify-content:center;">
                <div class="modal-content" style="background:#fff; padding:20px; width:90%; max-width:450px; border-radius:12px;">
                    <span class="close-modal" onclick="window.app.views.productsList.closeProductModal()" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
                    <h2 id="productModalTitle" style="margin-top:0;">Nouveau Produit</h2>
                    <input type="hidden" id="editProductId">
                    
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Catégorie</label>
                        <select id="editProductCategory" style="width:100%; padding:10px; box-sizing:border-box; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px;">
                            <option value="COLIS">📦 COLIS</option>
                            <option value="SERVICES">🔧 SERVICES</option>
                            <option value="STOCK">📊 STOCK</option>
                            <option value="REMISES">🏷️ REMISES</option>
                        </select>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Description</label>
                        <input type="text" id="editProductDesc" style="width:100%; padding:10px; box-sizing:border-box; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px;" placeholder="Ex: Grand Carton">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Prix par défaut (€)</label>
                        <input type="number" id="editProductPrice" style="width:100%; padding:10px; box-sizing:border-box; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px;" placeholder="Ex: 50">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Dimension / Volume</label>
                        <input type="text" id="editProductDim" style="width:100%; padding:10px; box-sizing:border-box; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px;" placeholder="Ex: 0.5 m³, 60x40x40 cm...">
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:25px;">
                        <button id="deleteProductBtn" class="btn" onclick="window.app.views.productsList.deleteProduct()" style="display:none; background: #ef4444; color:white; border:none; padding:10px 15px; border-radius:8px; cursor:pointer; font-weight:bold;">🗑️ Supprimer</button>
                        <div style="margin-left:auto;">
                            <button class="btn" onclick="window.app.views.productsList.closeProductModal()" style="background: #6c757d; color:white; margin-right:10px; border:none; padding:10px 15px; border-radius:8px; cursor:pointer;">Annuler</button>
                            <button id="saveProductBtn" class="btn btn-success" onclick="window.app.views.productsList.saveProduct()" style="background: #10b981; color:white; border:none; padding:10px 15px; border-radius:8px; cursor:pointer; font-weight:bold;">Enregistrer</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;

        document.getElementById('prodSearchInput').addEventListener('input', () => this.applyFilters());
        document.getElementById('prodCatFilter').addEventListener('change', () => this.applyFilters());

        // Chargement des données depuis Firestore
        if (this.unsubProducts) this.unsubProducts();
        this.unsubProducts = onSnapshot(collection(db, "products"), (snapshot) => {
            this.products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.products.sort((a, b) => (a.desc || '').localeCompare(b.desc || ''));
            this.applyFilters();
        }, (error) => {
            console.error("Erreur Firestore (Produits) :", error);
            this.app.showToast("Erreur lors du chargement des produits.", "error");
        });
    },

    applyFilters() {
        const term = document.getElementById('prodSearchInput').value.toLowerCase().trim();
        const cat = document.getElementById('prodCatFilter').value;

        this.filteredProducts = this.products.filter(p => {
            if (term && !p.desc.toLowerCase().includes(term) && !p.category.toLowerCase().includes(term)) return false;
            if (cat && p.category !== cat) return false;
            return true;
        });

        this.renderTable();
    },

    renderTable() {
        document.getElementById('kpiTotal').textContent = this.filteredProducts.length;
        document.getElementById('kpiColis').textContent = this.filteredProducts.filter(p => p.category === 'COLIS').length;
        document.getElementById('kpiServices').textContent = this.filteredProducts.filter(p => p.category === 'SERVICES').length;
        document.getElementById('kpiStock').textContent = this.filteredProducts.filter(p => p.category === 'STOCK').length;
        document.getElementById('kpiRemises').textContent = this.filteredProducts.filter(p => p.category === 'REMISES').length;
        document.getElementById('prodCountBadge').textContent = `${this.filteredProducts.length} produit(s)`;

        const tbody = document.getElementById('prodTableBody');
        
        if (this.filteredProducts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #64748b;">Aucun produit trouvé.</td></tr>';
            return;
        }

        const getCatStyle = (cat) => {
            switch(cat) {
                case 'COLIS': return 'background: #e0f2fe; color: #0369a1;';
                case 'SERVICES': return 'background: #fef3c7; color: #b45309;';
                case 'STOCK': return 'background: #dcfce7; color: #166534;';
                case 'REMISES': return 'background: #f3e8ff; color: #7e22ce;';
                default: return 'background: #f1f5f9; color: #475569;';
            }
        };

        tbody.innerHTML = this.filteredProducts.map(p => `
            <tr>
                <td style="padding: 15px;"><span class="badge" style="${getCatStyle(p.category)} padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 11px;">${p.category}</span></td>
                <td style="font-weight: 600; color: #1e293b;">${p.desc} ${p.dim ? `<br><span style="font-size: 11px; color: #64748b; font-weight: normal;">📏 ${p.dim}</span>` : ''}</td>
                <td style="text-align: right; font-weight: 700; font-family: monospace; font-size: 14px; ${p.price < 0 ? 'color: #ef4444;' : 'color: #0f172a;'}">${this.app.formatMoney(p.price)}</td>
                <td style="text-align: center;"><button class="btn-small" onclick="window.app.views.productsList.openEditModal('${p.id}')" style="background: transparent; border: none; font-size: 16px; cursor: pointer; opacity: 0.7; transition: 0.2s;" title="Modifier" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">✏️</button></td>
            </tr>
        `).join('');
    },

    closeProductModal() {
        document.getElementById('productModal').style.display = 'none';
    },

    openAddModal() {
        document.getElementById('productModalTitle').textContent = 'Nouveau Produit';
        document.getElementById('editProductId').value = '';
        document.getElementById('editProductCategory').value = 'COLIS';
        document.getElementById('editProductDesc').value = '';
        document.getElementById('editProductPrice').value = '';
        document.getElementById('editProductDim').value = '';
        document.getElementById('deleteProductBtn').style.display = 'none';
        document.getElementById('productModal').style.display = 'flex';
    },
    
    openEditModal(id) {
        const product = this.products.find(p => p.id === id);
        if (!product) return;
        
        document.getElementById('productModalTitle').textContent = 'Modifier Produit';
        document.getElementById('editProductId').value = product.id;
        document.getElementById('editProductCategory').value = product.category || 'COLIS';
        document.getElementById('editProductDesc').value = product.desc || '';
        document.getElementById('editProductPrice').value = product.price !== undefined ? product.price : '';
        document.getElementById('editProductDim').value = product.dim || '';
        document.getElementById('deleteProductBtn').style.display = 'block';
        document.getElementById('productModal').style.display = 'flex';
    },

    async saveProduct() {
        const btn = document.getElementById('saveProductBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        }

        const id = document.getElementById('editProductId').value;
        const category = document.getElementById('editProductCategory').value;
        const desc = document.getElementById('editProductDesc').value.trim();
        const price = parseFloat(document.getElementById('editProductPrice').value) || 0;
        const dim = document.getElementById('editProductDim').value.trim();

        if (!desc) {
            this.app.showToast("La description est obligatoire.", "error");
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Enregistrer';
            }
            return;
        }

        try {
            if (id) {
                await updateDoc(doc(db, "products", id), { category, desc, price, dim });
                this.app.showToast("Produit modifié avec succès !", "success");
            } else {
                await addDoc(collection(db, "products"), { category, desc, price, dim, createdAt: new Date().toISOString() });
                this.app.showToast("Produit ajouté avec succès !", "success");
            }
            this.closeProductModal();
        } catch (error) {
            console.error("Erreur saveProduct:", error);
            this.app.showToast("Erreur lors de l'enregistrement.", "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Enregistrer';
            }
        }
    },

    async deleteProduct() {
        const id = document.getElementById('editProductId').value;
        if (!id) return;
        
        if (window.AppModal) {
            if (!await window.AppModal.confirm("Voulez-vous vraiment supprimer ce produit de la base de données ?", "Supprimer", true)) return;
        } else {
            if (!confirm("Voulez-vous vraiment supprimer ce produit ?")) return;
        }

        try {
            await deleteDoc(doc(db, "products", id));
            this.app.showToast("Produit supprimé avec succès !", "success");
            this.closeProductModal();
        } catch (error) {
            console.error("Erreur suppression:", error);
            this.app.showToast("Erreur lors de la suppression.", "error");
        }
    }
};