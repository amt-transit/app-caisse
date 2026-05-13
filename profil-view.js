import { db, app as firebaseApp } from './firebase-config.js';
import { getAuth, updateProfile, updatePassword } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

export const ProfilView = {
    tempProfileFile: null,

    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.profil = this;

        const userName = sessionStorage.getItem('userName') || 'Utilisateur';
        const userAgency = sessionStorage.getItem('userAgency') || 'Non définie';
        const userRole = sessionStorage.getItem('userRole') || 'Non défini';
        
        let agencyDisplay = userAgency === 'paris' ? '🇫🇷 Paris' : (userAgency === 'abidjan' ? '🇨🇮 Abidjan' : '🌍 Global (Abidjan & Paris)');
        if (userAgency === 'Non définie') agencyDisplay = 'Non définie';

        const roleDisplay = userRole.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        const html = `
            <style>
                .profile-view-wrapper .form-card { background: white; border-radius: 16px; padding: 25px; border: 1px solid #e2e8f0; }
                .profile-view-wrapper .form-group { margin-bottom: 20px; }
            </style>
            <div class="profile-view-wrapper" style="max-width: 1100px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;">
                <!-- En-tête du Profil -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; flex-wrap: wrap; gap: 15px; background: white; padding: 20px 25px; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="width: 50px; height: 50px; background: #eff6ff; color: #3b82f6; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px;">
                            <i class="fas fa-user-cog"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 800;">Paramètres du Profil</h2>
                            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Gérez vos informations, votre sécurité et vos accréditations.</p>
                        </div>
                    </div>
                    <button class="btn btn-primary" id="saveProfileBtn" onclick="window.app.views.profil.saveProfile()" style="padding: 12px 24px; font-size: 14px; box-shadow: 0 4px 12px rgba(59,130,246,0.3); border: none; border-radius: 8px; cursor: pointer; font-weight: bold; background: #3b82f6; color: white;">
                        <i class="fas fa-save" style="margin-right: 6px;"></i> Enregistrer les modifications
                    </button>
                </div>

                <!-- Grille de cartes -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 25px;">
                    
                    <!-- Carte 1: Photo de profil -->
                    <div class="form-card" style="margin-bottom: 0; display: flex; flex-direction: column; align-items: center; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 20px 0; color: #1e293b; font-size: 15px; align-self: flex-start; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; width: 100%; text-align: left; display: flex; align-items: center;">
                            <i class="fas fa-camera" style="color: #3b82f6; margin-right: 10px; font-size: 18px;"></i> Photo de profil
                        </h4>
                        
                        <div class="user-avatar" id="profileAvatarPreview" style="width: 130px; height: 130px; margin: 10px auto 15px; font-size: 50px; cursor: pointer; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.15); border: 4px solid white; transition: transform 0.2s; background-color: #f1f5f9; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #cbd5e1;" onclick="document.getElementById('profilePhotoInput').click()" title="Changer la photo">
                            <i class="fas fa-user"></i>
                        </div>
                        <input type="file" id="profilePhotoInput" accept="image/*" style="display: none;" onchange="window.app.views.profil.handleProfilePhotoChange(event)">
                        
                        <h3 style="margin: 0 0 5px 0; color: #0f172a; font-size: 18px; font-weight: 700;">${userName}</h3>
                        <p style="margin: 0 0 20px 0; color: #64748b; font-size: 13px; background: #f1f5f9; padding: 4px 12px; border-radius: 20px; display: inline-block;">${roleDisplay}</p>
                        
                        <button class="btn btn-outline" onclick="document.getElementById('profilePhotoInput').click()" style="border-radius: 8px; width: 100%; justify-content: center; padding: 10px; background: white; border: 1px solid #cbd5e1; color: #475569; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-image"></i> Modifier la photo
                        </button>
                    </div>

                    <!-- Carte 2: Infos Personnelles -->
                    <div class="form-card" style="margin-bottom: 0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 20px 0; color: #1e293b; font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; display: flex; align-items: center;">
                            <i class="fas fa-id-card" style="color: #10b981; margin-right: 10px; font-size: 18px;"></i> Identité
                        </h4>
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; margin-bottom: 6px; display: block;">Nom d'utilisateur complet</label>
                            <input type="text" id="profileName" value="${userName}" style="font-size: 14px; padding: 12px 15px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; width: 100%; box-sizing: border-box;">
                        </div>
                        <div style="padding: 15px; background: #f0fdf4; border-radius: 10px; border: 1px solid #bbf7d0; display: flex; gap: 12px; align-items: flex-start;">
                            <i class="fas fa-info-circle" style="color: #16a34a; font-size: 18px; margin-top: 2px;"></i>
                            <p style="margin: 0; font-size: 13px; color: #166534; line-height: 1.5;">
                                Ce nom sera utilisé pour tracer vos actions dans le journal d'audit et apparaîtra sur vos documents (factures, reçus).
                            </p>
                        </div>
                    </div>

                    <!-- Carte 3: Sécurité -->
                    <div class="form-card" style="margin-bottom: 0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 20px 0; color: #1e293b; font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; display: flex; align-items: center;">
                            <i class="fas fa-shield-alt" style="color: #ef4444; margin-right: 10px; font-size: 18px;"></i> Sécurité
                        </h4>
                        <div class="form-group" style="margin-bottom: 10px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; margin-bottom: 6px; display: block;">Nouveau mot de passe</label>
                            <input type="password" id="profileNewPassword" placeholder="••••••••" style="font-size: 14px; padding: 12px 15px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; width: 100%; box-sizing: border-box;">
                        </div>
                        <div style="padding: 15px; background: #fef2f2; border-radius: 10px; border: 1px solid #fecaca; display: flex; gap: 12px; align-items: flex-start; margin-top: 20px;">
                            <i class="fas fa-exclamation-triangle" style="color: #dc2626; font-size: 18px; margin-top: 2px;"></i>
                            <div style="margin: 0; font-size: 13px; color: #991b1b; line-height: 1.5;">
                                <strong>Attention :</strong> Laissez vide si vous ne souhaitez pas changer de mot de passe. Minimum 6 caractères requis.
                            </div>
                        </div>
                    </div>

                    <!-- Carte 4: Infos Pro -->
                    <div class="form-card" style="margin-bottom: 0; background: #f8fafc; border: 1px dashed #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
                        <h4 style="margin: 0 0 20px 0; color: #1e293b; font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; display: flex; align-items: center;">
                            <i class="fas fa-building" style="color: #f59e0b; margin-right: 10px; font-size: 18px;"></i> Accréditations
                        </h4>
                        
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; margin-bottom: 6px; display: block;">Agence / Secteur rattaché</label>
                            <div style="padding: 12px 16px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; color: #334155; font-weight: 600; font-size: 14px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                                ${agencyDisplay}
                            </div>
                        </div>

                        <div class="form-group">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; margin-bottom: 6px; display: block;">Niveau d'accès (Rôle)</label>
                            <div style="padding: 12px 16px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; color: #334155; font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 10px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                                <i class="fas fa-user-shield" style="color: #94a3b8;"></i>
                                ${roleDisplay}
                            </div>
                        </div>
                        
                        <p style="font-size: 12px; color: #64748b; margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-style: italic; text-align: center;">
                            <i class="fas fa-lock" style="margin-right: 5px;"></i> Ces informations sont gérées par votre administrateur réseau.
                        </p>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;

        const savedPhoto = localStorage.getItem('userProfilePhoto');
        if (savedPhoto) {
            const avatar = document.getElementById('profileAvatarPreview');
            if (avatar) {
                avatar.innerHTML = '';
                avatar.style.backgroundImage = `url('${savedPhoto}')`;
                avatar.style.backgroundSize = 'cover';
                avatar.style.backgroundPosition = 'center';
            }
        }
    },

    handleProfilePhotoChange(event) {
        const file = event.target.files[0];
        if (file) {
            this.tempProfileFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                const avatar = document.getElementById('profileAvatarPreview');
                if (avatar) {
                    avatar.innerHTML = '';
                    avatar.style.backgroundImage = `url('${e.target.result}')`;
                    avatar.style.backgroundSize = 'cover';
                    avatar.style.backgroundPosition = 'center';
                }
            };
            reader.readAsDataURL(file);
        }
    },

    async saveProfile() {
        const newName = document.getElementById('profileName').value.trim();
        const newPassword = document.getElementById('profileNewPassword').value;
        
        const notify = (msg, type = 'success') => {
            if (this.app && typeof this.app.showToast === 'function') {
                this.app.showToast(msg, type);
            } else if (window.AppModal) {
                if (type === 'error') window.AppModal.error(msg);
                else window.AppModal.success(msg);
            } else {
                alert(msg);
            }
        };

        if (!newName) {
            notify("Le nom d'utilisateur ne peut pas être vide.", "error");
            return;
        }

        const btn = document.getElementById('saveProfileBtn');
        const oldText = btn ? btn.innerHTML : 'Enregistrer';
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
            btn.disabled = true;
        }

        try {
            const auth = getAuth();
            const user = auth.currentUser;
            if (!user) throw new Error("Utilisateur non connecté.");

            const updates = {};

            // 1. Mise à jour du Nom
            if (newName !== user.displayName) {
                await updateProfile(user, { displayName: newName });
                updates.displayName = newName;
                sessionStorage.setItem('userName', newName);
                const headerName = document.getElementById('userName');
                if (headerName) headerName.textContent = newName;
            }

            // 2. Mise à jour de la Photo via Storage
            if (this.tempProfileFile) {
                const storage = getStorage(firebaseApp);
                const fileExt = this.tempProfileFile.name.split('.').pop();
                const fileName = `profile_photos/${user.uid}_${Date.now()}.${fileExt}`;
                const sRef = storageRef(storage, fileName);
                
                await uploadBytes(sRef, this.tempProfileFile);
                const downloadUrl = await getDownloadURL(sRef);
                
                updates.photoURL = downloadUrl;
                await updateProfile(user, { photoURL: downloadUrl });
                localStorage.setItem('userProfilePhoto', downloadUrl);
                
                // Update DOM avatars
                document.querySelectorAll('.user-avatar, .avatar, #userAvatar, #profileAvatarPreview').forEach(el => {
                    el.innerHTML = '';
                    el.style.backgroundImage = `url('${downloadUrl}')`;
                    el.style.backgroundSize = 'cover';
                    el.style.backgroundPosition = 'center';
                    el.style.color = 'transparent';
                });
                
                this.tempProfileFile = null;
            }

            // Mise à jour dans Firestore (Synchronisation)
            if (Object.keys(updates).length > 0) {
                await updateDoc(doc(db, 'users', user.uid), updates);
            }

            // 3. Mise à jour du Mot de passe
            if (newPassword) {
                if (newPassword.length < 6) {
                    notify("Le mot de passe doit faire au moins 6 caractères.", "error");
                    if (btn) { btn.innerHTML = oldText; btn.disabled = false; }
                    return;
                }
                try {
                    await updatePassword(user, newPassword);
                    await updateDoc(doc(db, 'users', user.uid), { password: newPassword });
                } catch (pwError) {
                    if (pwError.code === 'auth/requires-recent-login') {
                        notify("Par sécurité, veuillez vous déconnecter et vous reconnecter pour modifier le mot de passe.", "error");
                        if (btn) { btn.innerHTML = oldText; btn.disabled = false; }
                        return;
                    } else {
                        throw pwError;
                    }
                }
            }

            notify("Profil mis à jour avec succès !", "success");
            const pwdInput = document.getElementById('profileNewPassword');
            if(pwdInput) pwdInput.value = '';

        } catch (error) {
            console.error("Erreur lors de la mise à jour du profil :", error);
            notify("Erreur : " + error.message, "error");
        } finally {
            if (btn) {
                btn.innerHTML = oldText;
                btn.disabled = false;
            }
        }
    }
};
