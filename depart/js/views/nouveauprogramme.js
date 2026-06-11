import { db } from '../../../commun/firebase-config.js';
import { getCollectionName } from '../../../commun/agencies-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed, reactive, onMounted, onUnmounted, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { loadJsPdf } from '../../../commun/services/pdf-common.js';

// Dépôt AMT : point de DÉPART et d'ARRIVÉE de chaque tournée chauffeur.
// (Modifiable ici si l'entrepôt déménage.)
const DEPOT_ADDRESS = "81 AVENUE ARISTIDE BRIAND 93240 STAINS";

// Cache de géocodage (adresse -> {lat, lon}) partagé pour toute la session.
const _geoCache = new Map();

async function geocodeAddress(address) {
    const key = (address || '').trim().toLowerCase();
    if (!key) return null;
    if (_geoCache.has(key)) return _geoCache.get(key);
    try {
        const resp = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`);
        const data = await resp.json();
        const f = data && data.features && data.features[0];
        const coord = f ? { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] } : null;
        _geoCache.set(key, coord);
        return coord;
    } catch (e) {
        console.warn('Géocodage échoué :', address, e && e.message);
        return null;
    }
}

// Distance à vol d'oiseau (km) — utilisée pour le repli plus-proche-voisin.
function haversineKm(a, b) {
    if (!a || !b) return Infinity;
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// Ordre « plus proche voisin » depuis le dépôt (repli si OSRM indisponible).
function nearestNeighborOrder(depot, stops) {
    const remaining = stops.filter(s => s.coord);
    const ordered = [];
    let current = depot;
    while (remaining.length) {
        let bestIdx = 0, best = Infinity;
        remaining.forEach((s, i) => { const d = haversineKm(current, s.coord); if (d < best) { best = d; bestIdx = i; } });
        const next = remaining.splice(bestIdx, 1)[0];
        ordered.push(next);
        current = next.coord;
    }
    return ordered;
}

// Optimise une tournée (problème du voyageur de commerce) DÉPART+ARRIVÉE au
// dépôt. Essaie OSRM (vrai routier) puis se replie sur le plus-proche-voisin.
async function optimizeRoute(depotCoord, stops) {
    const valid = stops.filter(s => s.coord);
    const invalid = stops.filter(s => !s.coord);
    if (!depotCoord || valid.length === 0) {
        return { ordered: valid, invalid, totalKm: 0, totalMin: 0, legs: [], engine: 'Aucun' };
    }
    // 1) OSRM trip (aller-retour au dépôt = source first + roundtrip).
    try {
        const coords = [depotCoord, ...valid.map(s => s.coord)].map(c => `${c.lon},${c.lat}`).join(';');
        const url = `https://router.project-osrm.org/trip/v1/driving/${coords}?source=first&roundtrip=true&overview=false`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.code === 'Ok' && data.trips && data.trips[0] && data.waypoints) {
            const ordered = valid
                .map((s, i) => ({ s, wp: data.waypoints[i + 1] ? data.waypoints[i + 1].waypoint_index : 999 }))
                .sort((a, b) => a.wp - b.wp)
                .map(x => x.s);
            const trip = data.trips[0];
            const legs = (trip.legs || []).map(l => ({ km: l.distance / 1000, min: l.duration / 60 }));
            return { ordered, invalid, totalKm: trip.distance / 1000, totalMin: trip.duration / 60, legs, engine: 'OSRM (routier)' };
        }
    } catch (e) {
        console.warn('OSRM indisponible, repli plus-proche-voisin :', e && e.message);
    }
    // 2) Repli plus-proche-voisin (vol d'oiseau, ~24 km/h en ville).
    const ordered = nearestNeighborOrder(depotCoord, valid);
    let totalKm = 0, prev = depotCoord;
    const legs = [];
    ordered.forEach(s => { const km = haversineKm(prev, s.coord); legs.push({ km, min: km * 2.5 }); totalKm += km; prev = s.coord; });
    totalKm += haversineKm(prev, depotCoord);
    return { ordered, invalid, totalKm, totalMin: totalKm * 2.5, legs, engine: 'Approx. (vol d\'oiseau)' };
}

export const NouveauProgrammeView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.nouveauProgramme = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .programmes-page {
                    --amt-blue:#1A3553; --amt-blue-d:#13283f; --amt-red:#E51F21; --amt-gold:#F2A312;
                    --ink:#0f172a; --muted:#566273; --line:#e6ebf1; --soft:#f3f6fa;
                    max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease;
                    font-family: 'Jost','Comfortaa',system-ui,-apple-system,sans-serif;
                }
                .prog-header { background: linear-gradient(115deg,#ffffff 55%,#f6f9ff); border-radius: 16px; padding: 20px 22px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--line); border-left: 5px solid var(--amt-blue); margin-bottom: 20px; box-shadow: 0 6px 18px rgba(26,53,83,0.07); flex-wrap: wrap; gap: 15px; }
                .prog-header__content { display: flex; align-items: center; gap: 16px; }
                .prog-header__icon { font-size: 26px; background: var(--amt-blue); color:#fff; width: 54px; height: 54px; display: flex; align-items: center; justify-content: center; border-radius: 14px; box-shadow: 0 6px 14px rgba(26,53,83,0.28); }
                .prog-header__title { margin: 0; font-size: 22px; font-weight: 800; color: var(--amt-blue); font-family: 'Comfortaa','Jost',sans-serif; letter-spacing: -0.3px; }
                .prog-header__subtitle { margin: 3px 0 0 0; font-size: 13px; color: var(--muted); font-weight: 500; }
                .btn-add-chauffeur { background: var(--amt-blue); color: white; border: none; padding: 11px 18px; border-radius: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 10px rgba(26,53,83,0.2); }
                .btn-add-chauffeur:hover { background: var(--amt-blue-d); transform: translateY(-1px); box-shadow: 0 6px 14px rgba(26,53,83,0.28); }

                .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
                .kpi-card { background: white; border-radius: 14px; padding: 18px 20px; display: flex; align-items: center; gap: 15px; border: 1px solid var(--line); box-shadow: 0 2px 8px rgba(26,53,83,0.04); transition: 0.2s; }
                .kpi-card--clickable { cursor: pointer; }
                .kpi-card--clickable:hover { border-color: var(--amt-gold); box-shadow: 0 8px 18px rgba(242,163,18,0.18); transform: translateY(-2px); }
                .kpi-card__icon { font-size: 26px; width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; border-radius: 14px; }
                .kpi-card--purple .kpi-card__icon { background: #fff4e0; color: #c47f10; }
                .kpi-card--blue .kpi-card__icon { background: #e9eef5; color: var(--amt-blue); }
                .kpi-card--orange .kpi-card__icon { background: #fff7ed; color: #ea580c; }
                .kpi-card--green .kpi-card__icon { background: #f0fdf4; color: #16a34a; }
                .kpi-card__value { font-size: 26px; font-weight: 800; color: var(--amt-blue); line-height: 1; margin-bottom: 4px; font-family: 'Comfortaa','Jost',sans-serif; }
                .kpi-card__label { font-size: 11.5px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; }

                .prog-filters { display: flex; flex-wrap: wrap; gap: 12px; background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
                .filter-group { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 6px; }
                .filter-label { font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; }
                .filter-input, .filter-select { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none; }
                .filter-input:focus, .filter-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }

                .prog-layout { display: flex; gap: 20px; align-items: flex-start; }
                @media (max-width: 992px) { .prog-layout { flex-direction: column; } }
                
                .chauffeurs-sidebar { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 15px; }
                @media (max-width: 992px) { .chauffeurs-sidebar { width: 100%; } }
                
                .sidebar-header { display: flex; justify-content: space-between; align-items: center; padding: 13px 16px; background: var(--amt-blue); border-radius: 13px; box-shadow: 0 6px 16px rgba(26,53,83,0.2); }
                .sidebar-title { font-size: 14px; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 9px; color: #fff; font-family: 'Comfortaa','Jost',sans-serif; letter-spacing: 0.5px; text-transform: uppercase; }
                .sidebar-count { background: var(--amt-gold); color: var(--amt-blue); padding: 3px 11px; border-radius: 20px; font-size: 13px; font-weight: 800; box-shadow: 0 2px 5px rgba(242,163,18,0.4); }

                .chauffeurs-list { display: flex; flex-direction: column; gap: 12px; max-height: 800px; overflow-y: auto; padding-right: 5px; }
                .chauffeurs-list::-webkit-scrollbar { width: 5px; }
                .chauffeurs-list::-webkit-scrollbar-thumb { background: #c2cedd; border-radius: 4px; }

                .chauffeur-card { background: white; border: 1px solid var(--line); border-left: 4px solid transparent; border-radius: 14px; padding: 15px 16px; box-shadow: 0 2px 8px rgba(26,53,83,0.05); transition: 0.2s; cursor: pointer; }
                .chauffeur-card:hover { border-color: #d4dde8; border-left-color: var(--amt-gold); box-shadow: 0 7px 16px rgba(26,53,83,0.1); transform: translateY(-1px); }
                .chauffeur-card.active { border-left-color: var(--amt-blue); background: linear-gradient(115deg,#ffffff,#f4f8fd); box-shadow: 0 8px 20px rgba(26,53,83,0.14); }
                .chauffeur-card__header { display: flex; align-items: center; gap: 13px; margin-bottom: 13px; pointer-events: none; }
                .chauffeur-avatar { width: 46px; height: 46px; border-radius: 50%; background: linear-gradient(135deg, var(--amt-blue), #2d567f); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 17px; flex-shrink: 0; border: 2px solid #fff; box-shadow: 0 0 0 2px var(--amt-gold), 0 3px 8px rgba(26,53,83,0.3); font-family: 'Comfortaa','Jost',sans-serif; }
                .chauffeur-name { font-weight: 800; color: var(--amt-blue); font-size: 15.5px; margin-bottom: 3px; font-family: 'Comfortaa','Jost',sans-serif; line-height: 1.2; }
                .chauffeur-meta { font-size: 12.5px; color: #475569; font-weight: 600; }
                .chauffeur-meta .mono { font-variant-numeric: tabular-nums; letter-spacing: 0.3px; }

                .chauffeur-stats { display: flex; gap: 10px; margin-bottom: 14px; padding: 10px 13px; background: var(--soft); border: 1px solid var(--line); border-radius: 10px; pointer-events: none; }
                .chauffeur-stat { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: var(--muted); }
                .stat-value { color: var(--amt-blue); font-weight: 800; font-size: 15px; font-family: 'Comfortaa','Jost',sans-serif; }

                .chauffeur-actions { display: flex; gap: 7px; }
                .btn-action { flex: 1; padding: 9px 8px; border-radius: 10px; font-size: 12.5px; font-weight: 700; cursor: pointer; border: 1px solid transparent; background: white; transition: 0.18s; display: flex; align-items: center; justify-content: center; gap: 5px; }
                .btn-action--add { background: var(--amt-blue); color: #fff; box-shadow: 0 3px 8px rgba(26,53,83,0.18); }
                .btn-action--add:hover { background: var(--amt-blue-d); transform: translateY(-1px); }
                .btn-action--edit, .btn-action--print, .btn-action--delete { flex: 0 0 40px; border-color: #dce3ec; color: var(--muted); }
                .btn-action--edit:hover { background: #fff7e8; color: #c47f10; border-color: var(--amt-gold); }
                .btn-action--print:hover { background: #eef2f7; color: var(--amt-blue); border-color: var(--amt-blue); }
                .btn-action--delete:hover { border-color: var(--amt-red); color: var(--amt-red); background: #fdecec; }
                
                .rdv-table-card { flex: 1; background: white; border-radius: 14px; border: 1px solid var(--line); overflow: hidden; box-shadow: 0 2px 8px rgba(26,53,83,0.05); }
                .rdv-table-header { padding: 15px 20px; border-bottom: 2px solid var(--amt-gold); background: var(--amt-blue); display: flex; justify-content: space-between; align-items: center; }
                .rdv-table-title { margin: 0; font-size: 15px; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 10px; font-family: 'Comfortaa','Jost',sans-serif; letter-spacing: 0.3px; }
                .rdv-table-count { background: var(--amt-gold); color: var(--amt-blue); padding: 3px 11px; border-radius: 20px; font-size: 13px; font-weight: 800; }

                .table-wrap { overflow-x: auto; }
                .rdv-table { width: 100%; border-collapse: collapse; }
                .rdv-table th { text-align: left; padding: 12px 15px; background: #eef2f7; font-size: 11px; font-weight: 800; color: var(--amt-blue); text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid var(--line); }
                .rdv-table td { padding: 12px 15px; border-bottom: 1px solid #eef2f7; font-size: 13px; color: #334155; vertical-align: middle; }
                .rdv-table tr:hover td { background: #f7faff; }

                .type-badge { padding: 4px 9px; border-radius: 7px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; display: inline-block; white-space: nowrap; }
                .badge--depot { background: #e9eef5; color: var(--amt-blue); border: 1px solid #c7d4e3; }
                .badge--recup { background: #fff4e0; color: #b9790c; border: 1px solid #f6d9a0; }

                .client-cell__name { font-weight: 700; color: var(--ink); }
                .client-cell__phone { font-size: 11.5px; color: var(--muted); margin-top: 2px; font-variant-numeric: tabular-nums; }
                .address-cell { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; color: #1e293b; }
                .description-cell { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; color: #64748b; }
                
                .actions-cell { display: flex; gap: 4px; }
                .btn-order, .btn-remove { width: 28px; height: 28px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; transition: 0.2s; }
                .btn-order:hover { background: #f1f5f9; color: #0f172a; border-color: #94a3b8; }
                .btn-remove { border-color: #fecaca; color: #ef4444; background: #fef2f2; }
                .btn-remove:hover { background: #fee2e2; }

                /* Modal Custom */
                .modal-box { background: white; border-radius: 16px; display: flex; flex-direction: column; max-height: 90vh; width: 90%; max-width: 700px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; }
                .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 25px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
                .modal-body { padding: 0; overflow-y: auto; flex: 1; }
                .modal-footer { padding: 20px 25px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; }

                /* Drawer Optimisation */
                .opti-drawer-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.4); backdrop-filter: blur(4px); z-index: 9998; opacity: 0; visibility: hidden; transition: 0.3s; }
                .opti-drawer-overlay.active { opacity: 1; visibility: visible; }
                .opti-panel { position: fixed; top: 0; right: -500px; width: 100%; max-width: 450px; height: 100vh; background: white; z-index: 9999; box-shadow: -5px 0 25px rgba(0,0,0,0.1); display: flex; flex-direction: column; transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                .opti-panel.active { right: 0; }
                .opti-header { display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
                .opti-header__left { display: flex; align-items: center; gap: 15px; }
                .opti-header__icon { font-size: 24px; background: #f3e8ff; color: #9333ea; width: 44px; height: 44px; display: flex; justify-content: center; align-items: center; border-radius: 12px; }
                .opti-header__title { font-size: 16px; font-weight: 800; color: #0f172a; }
                .opti-header__sub { font-size: 12px; color: #64748b; margin-top: 2px; }
                .opti-body { flex: 1; overflow-y: auto; padding: 20px; }
                .opti-kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px; }
                .opti-kpi { padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 5px; }
                .opti-kpi__icon { font-size: 20px; margin-bottom: 5px; }
                .opti-kpi__value { font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1; }
                .opti-kpi__label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; }
                .opti-kpi--purple { background: #faf5ff; border-color: #e9d5ff; }
                .opti-kpi--blue { background: #eff6ff; border-color: #bfdbfe; }
                .opti-kpi--orange { background: #fff7ed; border-color: #fed7aa; }
                .opti-kpi--green { background: #f0fdf4; border-color: #bbf7d0; }
                .opti-avg-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
                .opti-avg { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 8px; font-size: 11px; display: flex; align-items: center; gap: 6px; }
                .opti-avg__label { color: #64748b; }
                .opti-avg__value { font-weight: 700; color: #0f172a; }
                .opti-avg--warn { background: #fffbeb; border-color: #fde68a; }
                .opti-section-title { font-size: 14px; font-weight: 800; color: #1e293b; margin: 20px 0 10px 0; }
                .opti-timeline { display: flex; flex-direction: column; gap: 15px; }
                .opti-stop { display: flex; gap: 15px; }
                .opti-stop__line { display: flex; flex-direction: column; align-items: center; }
                .opti-stop__number { width: 24px; height: 24px; background: #3b82f6; color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 11px; font-weight: bold; z-index: 2; flex-shrink: 0; }
                .opti-stop__connector { width: 2px; flex: 1; background: #e2e8f0; margin-top: 5px; margin-bottom: -15px; }
                .opti-stop:last-child .opti-stop__connector { display: none; }
                .opti-stop__card { flex: 1; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
                .opti-stop__top { display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center; }
                .opti-stop__client { font-weight: 700; color: #0f172a; font-size: 13px; }
                .opti-stop__address { font-size: 11px; color: #475569; margin-bottom: 10px; line-height: 1.4; }
                .opti-stop__meta { display: flex; flex-wrap: wrap; gap: 6px; }
                .opti-stop__tag { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; color: #475569; font-weight: 600; display: flex; gap: 4px; align-items: center; }
                .opti-stop__tag-label { color: #94a3b8; }
                .opti-stop__tag--blue { background: #e0f2fe; color: #0284c7; }
                .opti-stop__tag--orange { background: #ffedd5; color: #ea580c; }
                .opti-stop__tag--green { background: #dcfce7; color: #16a34a; }
                .opti-footer { padding: 15px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; gap: 10px; background: #f8fafc; }

                /* === Fiches PROGRAMME compactes (≤1024px) — override du format
                   générique étalé. Deux tableaux .rdv-table distincts : le tableau
                   principal (6 col.) et celui de la modale d'assignation (4 col.). */
                @media (max-width: 1024px) {
                    /* commun : on enlève les libellés vides et on met les lignes en fiches */
                    .table-wrap .rdv-table thead, .amt-modal .rdv-table thead { display: none; }
                    .table-wrap .rdv-table, .table-wrap .rdv-table tbody,
                    .amt-modal .rdv-table, .amt-modal .rdv-table tbody { display: block; width: 100%; }
                    .table-wrap .rdv-table td::before, .amt-modal .rdv-table td::before { display: none !important; }
                    .table-wrap .rdv-table tbody tr, .amt-modal .rdv-table tbody tr {
                        display: flex !important; flex-wrap: wrap; align-items: center; gap: 5px 10px;
                        padding: 12px 14px !important; border: 1px solid #e8edf3; border-radius: 13px;
                        margin-bottom: 10px; background: #fff; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
                    .table-wrap .rdv-table tbody td, .amt-modal .rdv-table tbody td {
                        display: inline-flex !important; align-items: center; width: auto !important; max-width: 100%;
                        border: none !important; padding: 0 !important; text-align: left !important;
                        justify-content: flex-start !important; font-size: 12.5px; color: #475569; }

                    /* Tableau principal : Type(1) Chauffeur(2) Client(3) Adresse(4) Description(5) Actions(6) */
                    .table-wrap .rdv-table td:nth-child(3) { order: 0; width: 100% !important; }
                    .table-wrap .rdv-table td:nth-child(3) .client-cell__name { font-weight: 800; color: #0f172a; font-size: 14.5px; }
                    .table-wrap .rdv-table td:nth-child(1) { order: 1; }
                    .table-wrap .rdv-table td:nth-child(2) { order: 2; margin-left: auto; font-weight: 700; color: #1e293b; }
                    .table-wrap .rdv-table td:nth-child(4) { order: 3; width: 100% !important; }
                    .table-wrap .rdv-table td.address-cell { max-width: 100% !important; white-space: normal !important; overflow: visible !important; font-weight: 600; }
                    .table-wrap .rdv-table td:nth-child(5) { order: 4; width: 100% !important; }
                    .table-wrap .rdv-table td.description-cell { max-width: 100% !important; white-space: normal !important; overflow: visible !important; }
                    .table-wrap .rdv-table td:nth-child(6) { order: 5; width: 100% !important; justify-content: flex-end !important; margin-top: 5px; border-top: 1px solid #f1f5f9; padding-top: 9px !important; }

                    /* Modale d'assignation : Checkbox(1) Type(2) Client/Adresse(3) Heure(4) */
                    .amt-modal .rdv-table td:nth-child(1) { order: 0; }
                    .amt-modal .rdv-table td:nth-child(3) { order: 1; flex: 1 1 auto; min-width: 0; }
                    .amt-modal .rdv-table td:nth-child(3) > div:first-child { font-weight: 800; color: #0f172a; }
                    .amt-modal .rdv-table td:nth-child(3) > div:last-child { max-width: 100% !important; white-space: normal !important; }
                    .amt-modal .rdv-table td:nth-child(2) { order: 2; }
                    .amt-modal .rdv-table td:nth-child(4) { order: 3; font-weight: 700; color: #334155; }
                }
            </style>

            <div id="vue-nouveauprogramme-app" class="programmes-page" v-cloak>
                <div class="prog-header">
                    <div class="prog-header__content">
                        <div class="prog-header__icon">🚗</div>
                        <div class="prog-header__info">
                            <h1 class="prog-header__title">Programmes chauffeurs</h1>
                            <p class="prog-header__subtitle">{{ drivers.length }} chauffeur(s) · {{ rdvs.length }} RDV pour le {{ formattedDate }}</p>
                        </div>
                    </div>
                    <div class="prog-header__actions">
                        <button class="btn-add-chauffeur" @click="openAddDriverModal">
                            ➕ Ajouter un chauffeur
                        </button>
                    </div>
                </div>

                <div class="kpi-grid">
                    <div class="kpi-card kpi-card--purple kpi-card--clickable" @click="openAssignModal('')" title="Voir les RDV disponibles non assignés">
                        <div class="kpi-card__icon">🗂️</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value">{{ kpis.dispo }}</div>
                            <div class="kpi-card__label">RDV Disponibles</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--blue">
                        <div class="kpi-card__icon">📅</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value">{{ rdvs.length }}</div>
                            <div class="kpi-card__label">RDV Total</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--orange">
                        <div class="kpi-card__icon">📦</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value">{{ kpis.depots }}</div>
                            <div class="kpi-card__label">Dépôts</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--green">
                        <div class="kpi-card__icon">🔄</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value">{{ kpis.recups }}</div>
                            <div class="kpi-card__label">Récupérations</div>
                        </div>
                    </div>
                </div>

                <div class="prog-filters">
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Date</label>
                        <input class="filter-input" type="date" v-model="filters.date">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">👤</span> Chauffeur</label>
                        <select class="filter-select" v-model="filters.driver">
                            <option value="">Tous les chauffeurs</option>
                            <option v-for="d in drivers" :key="d.id" :value="d.name">{{ d.name }}</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">🏷️</span> Type RDV</label>
                        <select class="filter-select" v-model="filters.type">
                            <option value="">Tous les types</option>
                            <option value="DEPOT">📦 DÉPÔT</option>
                            <option value="RECUPERATION">🔄 RÉCUPÉRATION</option>
                        </select>
                    </div>
                    <div class="filter-group" style="flex: 1.5;">
                        <label class="filter-label"><span class="filter-icon">🔍</span> Rechercher</label>
                        <input class="filter-input" v-model="filters.search" placeholder="Nom, téléphone, adresse, description...">
                    </div>
                </div>

                <div class="prog-layout">
                    <div class="chauffeurs-sidebar">
                        <div class="sidebar-header">
                            <h2 class="sidebar-title"><span class="sidebar-icon">👥</span> Chauffeurs <span class="sidebar-count">{{ drivers.length }}</span></h2>
                        </div>
                        <div class="chauffeurs-list">
                            <div v-if="loading" style="text-align: center; padding: 20px; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                            <div v-else-if="drivers.length === 0" style="text-align: center; padding: 20px; color: #64748b;">Aucun chauffeur disponible.</div>
                            <div v-else v-for="d in drivers" :key="d.id" :class="['chauffeur-card', filters.driver === d.name ? 'active' : '']" @click="filters.driver = d.name">
                                <div class="chauffeur-card__header">
                                    <div v-if="d.photoURL" class="chauffeur-avatar" :style="{ backgroundImage: 'url(' + d.photoURL + ')', backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' }"></div>
                                    <div v-else class="chauffeur-avatar">{{ d.name.substring(0, 2).toUpperCase() }}</div>
                                    <div class="chauffeur-info">
                                        <div class="chauffeur-name">{{ d.name }}</div>
                                        <div class="chauffeur-meta">📞 {{ d.phone || 'Non renseigné' }}</div>
                                    </div>
                                </div>
                                <div class="chauffeur-stats">
                                    <div class="chauffeur-stat"><span class="stat-icon">📅</span><span class="stat-value">{{ getDriverRdvsCount(d.name) }}</span><span class="stat-label">RDV</span></div>
                                </div>
                                <div class="chauffeur-actions" @click.stop>
                                    <button class="btn-action btn-action--add" @click="openAssignModal(d.name)" title="Assigner des RDV"><i class="fas fa-plus"></i> RDV</button>
                                    <button class="btn-action btn-action--edit" @click="openOptimizationPanel(d.name)" title="Optimisation IA du parcours">🧠</button>
                                    <button class="btn-action btn-action--print" @click="printRoadmap(d.name)" title="Imprimer Feuille de Route"><i class="fas fa-print"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="rdv-table-card">
                        <div class="rdv-table-header">
                            <h2 class="rdv-table-title"><span class="rdv-table-icon">📋</span> Rendez-vous <span class="rdv-table-count">{{ filteredRdvs.length }}</span></h2>
                        </div>
                        <div class="table-wrap">
                            <table class="rdv-table">
                                <thead>
                                    <tr>
                                        <th style="width: 100px;">Type</th>
                                        <th style="width: 150px;">Chauffeur</th>
                                        <th style="width: 200px;">Client</th>
                                        <th>Adresse</th>
                                        <th>Description</th>
                                        <th style="width: 120px; text-align: right;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="loading"><td colspan="6" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                    <tr v-else-if="filteredRdvs.length === 0"><td colspan="6" style="text-align: center; padding: 40px; color: #64748b;">Aucun RDV ne correspond aux critères.</td></tr>
                                    <tr v-else v-for="(r, index) in filteredRdvs" :key="r.id" style="transition: background 0.2s;">
                                        <td><span :class="['type-badge', r.rdvType === 'DEPOT' ? 'badge--depot' : 'badge--recup']">{{ r.rdvType === 'DEPOT' ? 'DÉPÔT' : 'RÉCUPÉRER' }}</span></td>
                                        <td><div style="font-weight: 700; color: #1e293b;"><span v-if="r.livreur">{{ r.livreur }}</span><span v-else style="color:#ef4444;font-style:italic;">Non assigné</span></div></td>
                                        <td>
                                            <div class="client-cell__name">{{ r.client }}</div>
                                            <div class="client-cell__phone">📞 {{ r.tel || '--' }}</div>
                                        </td>
                                        <td class="address-cell" :title="r.adresse || ''">{{ r.adresse || '-' }}</td>
                                        <td class="description-cell" :title="r.notes || ''">{{ r.notes || '-' }}</td>
                                        <td>
                                            <div class="actions-cell" style="justify-content: flex-end; align-items: center;">
                                                <input v-if="filters.driver" type="number" min="1" :max="driverRdvCount" :value="driverRank(r)" @change="setManualOrder(r.id, $event.target.value)" class="rank-input" title="Saisir le rang (1, 2, 3…) pour déplacer ce RDV" style="width:46px; padding:5px; border:1px solid #cbd5e1; border-radius:6px; text-align:center; font-weight:700; color:#0f172a;">
                                                <button v-if="filters.driver" class="btn-order" @click="moveOrder(r.id, -1)" :disabled="index === 0" :style="index === 0 ? 'opacity:0.3;' : ''" title="Monter">↑</button>
                                                <button v-if="filters.driver" class="btn-order" @click="moveOrder(r.id, 1)" :disabled="index === filteredRdvs.length - 1" :style="index === filteredRdvs.length - 1 ? 'opacity:0.3;' : ''" title="Descendre">↓</button>
                                                <button class="btn-remove" @click="removeRdv(r.id)" title="Retirer ce RDV du programme">❌</button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            <!-- Modal Assignation RDV -->
            <div v-if="showAssignModal" class="modal active amt-modal" style="display:flex; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); align-items:center; justify-content:center;">
                <div class="modal-box">
                    <div class="modal-header">
                        <h2 style="margin:0; font-size:18px; color:#0f172a;">➕ Assigner des Rendez-vous</h2>
                        <button class="icon-btn" @click="closeAssignModal" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
                    </div>
                    <div style="padding: 15px 25px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #475569;">
                        Cochez les rendez-vous disponibles pour les assigner à <strong style="color: #3b82f6;">{{ driverToAssign || 'un chauffeur' }}</strong>.
                    </div>
                    <div class="modal-body" style="padding: 0;">
                        <table class="rdv-table" style="margin: 0; border-bottom: none;">
                            <thead style="position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                                <tr>
                                    <th style="width: 40px; text-align: center;"><input type="checkbox" v-model="selectAllRdv"></th>
                                    <th>Type</th>
                                    <th>Client / Adresse</th>
                                    <th>Heure</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="dispoRdvs.length === 0"><td colspan="4" style="text-align:center; padding:30px; color:#64748b;">Aucun RDV disponible à assigner pour cette date.</td></tr>
                                <tr v-else v-for="r in dispoRdvs" :key="r.id">
                                    <td style="text-align: center;"><input type="checkbox" class="assign-cb" v-model="assignSelectedIds" :value="r.id" style="width:16px; height:16px; cursor:pointer;"></td>
                                    <td><span :class="['type-badge', r.rdvType === 'DEPOT' ? 'badge--depot' : 'badge--recup']">{{ r.rdvType === 'DEPOT' ? 'DÉPÔT' : 'RÉCUPÉRER' }}</span></td>
                                    <td>
                                        <div style="font-weight:700; color:#1e293b;">{{ r.client }}</div>
                                        <div style="font-size:11px; color:#64748b; max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" :title="r.adresse||''">{{ r.adresse || '-' }}</div>
                                    </td>
                                    <td style="font-weight:600; color:#475569;">{{ r.time || '--:--' }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn--ghost" @click="closeAssignModal" style="padding: 10px 15px; border-radius: 8px; background: white; border: 1px solid #cbd5e1; font-weight: 600; cursor: pointer;">Annuler</button>
                        <button class="btn btn--primary" @click="confirmAssign" :disabled="assignSelectedIds.length === 0 || assigning" style="padding: 10px 20px; border-radius: 8px; background: #3b82f6; border: none; color: white; font-weight: 600; cursor: pointer;">
                            <span v-if="assigning"><i class="fas fa-spinner fa-spin"></i> Assignation...</span>
                            <span v-else>Assigner la sélection</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Modal d'Optimisation IA -->
            <div :class="['opti-drawer-overlay', showOptiModal ? 'active' : '']" @click="closeOptimizationPanel"></div>
            <div :class="['opti-panel', showOptiModal ? 'active' : '']">
                <div class="opti-header">
                    <div class="opti-header__left">
                        <div class="opti-header__icon">🧠</div>
                        <div>
                            <div class="opti-header__title">Optimisation automatique</div>
                            <div class="opti-header__sub">{{ optiDriver }} · {{ formattedDate }}</div>
                        </div>
                    </div>
                    <button class="icon-btn" @click="closeOptimizationPanel" style="background:none; border:none; font-size:20px; color:#64748b; cursor:pointer;">✕</button>
                </div>
                <div class="opti-body">
                    <div v-if="optiLoading" style="text-align:center; padding:40px; color:#64748b;">
                        <i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Calcul de l'itinéraire optimal…
                    </div>
                    <template v-else>
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-bottom:15px; font-size:12px; color:#475569;">
                            🏁 <b>Départ &amp; arrivée :</b> {{ DEPOT_ADDRESS }}
                            <div v-if="!optiResult.depotOk" style="color:#b45309; margin-top:4px;">⚠️ Adresse du dépôt introuvable — itinéraire approximatif.</div>
                        </div>
                        <div class="opti-kpi-grid">
                            <div class="opti-kpi opti-kpi--purple"><div class="opti-kpi__icon">📍</div><div class="opti-kpi__value">{{ currentOptimizedOrder.length }}</div><div class="opti-kpi__label">Arrêts</div></div>
                            <div class="opti-kpi opti-kpi--blue"><div class="opti-kpi__icon">🛣️</div><div class="opti-kpi__value">{{ optiResult.totalKm.toFixed(1) }} km</div><div class="opti-kpi__label">Distance (A/R)</div></div>
                            <div class="opti-kpi opti-kpi--orange"><div class="opti-kpi__icon">⏱️</div><div class="opti-kpi__value">{{ Math.floor(optiResult.totalMin / 60) }}h {{ Math.round(optiResult.totalMin % 60) }}m</div><div class="opti-kpi__label">Durée conduite</div></div>
                            <div class="opti-kpi opti-kpi--green"><div class="opti-kpi__icon">🚫</div><div class="opti-kpi__value">{{ optiSkipped.length }}</div><div class="opti-kpi__label">Ratés / ignorés</div></div>
                        </div>
                        <div class="opti-avg-row">
                            <div class="opti-avg"><span class="opti-avg__label">⚡ Moteur</span><span class="opti-avg__value">{{ optiResult.engine }}</span></div>
                            <div v-if="optiResult.invalidCount > 0" class="opti-avg opti-avg--warn"><span class="opti-avg__label">⚠️ Adresses non localisées</span><span class="opti-avg__value">{{ optiResult.invalidCount }}</span></div>
                            <button class="opti-avg" @click="computeOptimization" style="cursor:pointer; border:none; background:#eff6ff; color:#1d4ed8; font-weight:700;">🔄 Recalculer</button>
                        </div>

                        <div class="opti-section-title">🗺️ Ordre recommandé</div>
                        <div class="opti-timeline">
                            <div class="opti-stop">
                                <div class="opti-stop__line"><div class="opti-stop__number" style="background:#1A3553;">🏁</div><div class="opti-stop__connector"></div></div>
                                <div class="opti-stop__card" style="background:#f8fafc;"><div class="opti-stop__client">Départ — Dépôt AMT</div><div class="opti-stop__address">{{ DEPOT_ADDRESS }}</div></div>
                            </div>
                            <div v-for="(r, idx) in currentOptimizedOrder" :key="r.id" class="opti-stop">
                                <div class="opti-stop__line"><div class="opti-stop__number">{{ idx + 1 }}</div><div class="opti-stop__connector"></div></div>
                                <div class="opti-stop__card">
                                    <div class="opti-stop__top"><div class="opti-stop__client">{{ r.client }}</div><span :class="['type-badge', r.rdvType === 'DEPOT' ? 'badge--depot' : 'badge--recup']">{{ r.rdvType === 'DEPOT' ? 'DÉPÔT' : 'RÉCUPÉRER' }}</span></div>
                                    <div class="opti-stop__address">{{ r.adresse || 'Adresse non spécifiée' }}</div>
                                    <div class="opti-stop__meta">
                                        <span class="opti-stop__tag"><span class="opti-stop__tag-label">Avant</span>#{{ getOldIndex(r.id) + 1 }}</span>
                                        <span class="opti-stop__tag opti-stop__tag--blue">{{ legFor(idx).km.toFixed(1) }} km</span>
                                        <span class="opti-stop__tag opti-stop__tag--orange">{{ Math.round(legFor(idx).min) }} min</span>
                                        <button class="opti-stop__tag" @click="skipStop(r.id)" style="cursor:pointer; border:none; background:#fef2f2; color:#dc2626;" title="Le chauffeur a raté ce point — recalculer sans lui">🚫 Passer</button>
                                    </div>
                                </div>
                            </div>
                            <div class="opti-stop">
                                <div class="opti-stop__line"><div class="opti-stop__number" style="background:#1A3553;">🏁</div></div>
                                <div class="opti-stop__card" style="background:#f8fafc;"><div class="opti-stop__client">Retour — Dépôt AMT</div><div class="opti-stop__address">{{ DEPOT_ADDRESS }}</div></div>
                            </div>
                        </div>

                        <div v-if="skippedRdvs.length > 0">
                            <div class="opti-section-title">🚫 Points ratés / ignorés</div>
                            <div v-for="r in skippedRdvs" :key="r.id" style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; margin-bottom:8px;">
                                <div><div style="font-weight:700; color:#0f172a;">{{ r.client }}</div><div style="font-size:11px; color:#64748b;">{{ r.adresse }}</div></div>
                                <button @click="unskipStop(r.id)" style="cursor:pointer; border:1px solid #cbd5e1; background:white; border-radius:6px; padding:5px 10px; font-size:12px; font-weight:600;">↩️ Réintégrer</button>
                            </div>
                        </div>
                    </template>
                </div>
                <div class="opti-footer">
                    <button class="btn btn--ghost" @click="printRoadmap(optiDriver)" style="padding: 10px 15px; border-radius: 8px; border: 1px solid #cbd5e1; background: white; font-weight: 600; cursor: pointer;">📄 Feuille de route</button>
                    <button class="btn btn--primary" @click="applyOptimization" :disabled="savingOpti" style="padding: 10px 20px; border-radius: 8px; background: #10b981; border: none; color: white; font-weight: 600; cursor: pointer;">
                        <span v-if="savingOpti"><i class="fas fa-spinner fa-spin"></i> Application...</span>
                        <span v-else>✅ Valider et appliquer</span>
                    </button>
                </div>
            </div>

            <!-- Modal Ajouter Chauffeur -->
            <div v-if="showAddDriverModal" class="modal active amt-modal" style="display:flex; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); align-items:center; justify-content:center;">
                <div class="modal-box" style="max-width: 450px;">
                    <div class="modal-header">
                        <h2 style="margin:0; font-size:18px; color:#0f172a;">➕ Ajouter un chauffeur</h2>
                        <button class="icon-btn" @click="closeAddDriverModal" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Sélectionner un chauffeur *</label>
                            <select v-model="formDriver.id" class="filter-select" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1;">
                                <option value="">-- Choisir un utilisateur --</option>
                                <option v-for="a in availableAgentsForDropdown" :key="a.id" :value="a.id">{{ a.name }}</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Numéro de téléphone</label>
                            <input type="text" v-model="formDriver.phone" class="filter-input" placeholder="Ex: 0123456789" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1;">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn--ghost" @click="closeAddDriverModal" style="padding: 10px 15px; border-radius: 8px; background: white; border: 1px solid #cbd5e1; font-weight: 600; cursor: pointer;">Annuler</button>
                        <button class="btn btn--primary" @click="saveDriverPhone" :disabled="savingDriver" style="padding: 10px 20px; border-radius: 8px; background: #3b82f6; border: none; color: white; font-weight: 600; cursor: pointer;">
                            <span v-if="savingDriver">Enregistrement...</span>
                            <span v-else>Enregistrer</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;

        this.initVue(globalApp);
    },
    
    initVue(globalApp) {
        if (this.vueApp) this.vueApp.unmount();
        this.vueApp = createApp({
            setup() {
                const rdvs = ref([]);
                const drivers = ref([]);
                const availableAgentsForDropdown = ref([]);
                const loading = ref(true);
                
                const filters = reactive({
                    date: new Date().toISOString().split('T')[0],
                    driver: '',
                    type: '',
                    search: ''
                });
                
                const showAssignModal = ref(false);
                const showOptiModal = ref(false);
                const showAddDriverModal = ref(false);
                
                const assigning = ref(false);
                const savingOpti = ref(false);
                const savingDriver = ref(false);
                
                const driverToAssign = ref('');
                const currentOptimizedOrder = ref([]);
                const optiLoading = ref(false);
                const optiResult = ref({ totalKm: 0, totalMin: 0, legs: [], engine: '', invalidCount: 0, depotOk: true });
                const optiSkipped = ref([]); // ids des RDV ratés / ignorés -> exclus du calcul
                
                const assignSelectedIds = ref([]);
                
                const formDriver = reactive({
                    id: '',
                    phone: ''
                });
                let unsub = null;
                
                const formattedDate = computed(() => new Date(filters.date).toLocaleDateString('fr-FR'));
                
                const loadDrivers = async () => {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const usersSnap = await getDocs(collection(db, "users"));
                    const agentsSnap = await getDocs(collection(db, "agents"));
                    
                    const driverMap = new Map();
                    
                    usersSnap.forEach(doc => {
                        const data = doc.data();
                        if ((data.role === 'chauf' || data.isChauffeur) && (data.agency === activeAgency || data.agency === 'all')) {
                            const name = data.displayName || data.email || 'Inconnu';
                            driverMap.set(name.toLowerCase().trim(), { name, photoURL: data.photoURL, id: doc.id, col: 'users', phone: data.phone || data.tel || '' });
                        }
                    });
                    
                    agentsSnap.forEach(doc => {
                        const data = doc.data();
                        const name = data.name;
                        if (name && (data.agency === activeAgency || data.agency === 'all') && !driverMap.has(name.toLowerCase().trim())) {
                            driverMap.set(name.toLowerCase().trim(), { name, photoURL: data.photoURL, id: doc.id, col: 'agents', phone: data.phone || data.tel || '' });
                        }
                    });
                    drivers.value = Array.from(driverMap.values()).sort((a,b) => a.name.localeCompare(b.name));
                };
                const loadData = () => {
                    if (unsub) unsub();
                    loading.value = true;
                    
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const q = query(
                        collection(db, getCollectionName("appointments")), 
                        where("agency", "==", activeAgency),
                        where("date", "==", filters.date)
                    );
                    unsub = onSnapshot(q, (snapshot) => {
                        const data = snapshot.docs
                            .map(d => ({id: d.id, ...d.data()}))
                            // Tous les RDV ACTIFs du jour sont planifiables par
                            // le chauffeur (y compris « en_attente », sinon un
                            // RDV créé n'apparaît jamais ici). On exclut
                            // seulement les états terminaux.
                            .filter(r => !['annulé', 'annule', 'réalisé', 'realise', 'facturé', 'facture'].includes(r.status));
                            
                        data.sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));
                        rdvs.value = data;
                        loading.value = false;
                    });
                };
                onMounted(() => {
                    loadDrivers();
                    loadData();
                });
                watch(() => filters.date, () => {
                    loadData();
                });
                
                watch(() => formDriver.id, (newId) => {
                    if (!newId) {
                        formDriver.phone = '';
                        return;
                    }
                    const agent = availableAgentsForDropdown.value.find(a => a.id === newId);
                    if (agent) formDriver.phone = agent.phone || '';
                });
                onUnmounted(() => {
                    if (unsub) unsub();
                });
                const filteredRdvs = computed(() => {
                    return rdvs.value.filter(r => {
                        if (filters.driver && r.livreur !== filters.driver) return false;
                        if (filters.type && r.rdvType !== filters.type) return false;
                        if (filters.search) {
                            const searchFilter = filters.search.toLowerCase().trim();
                            const searchStr = `${r.client} ${r.adresse} ${r.tel} ${r.notes}`.toLowerCase();
                            if (!searchStr.includes(searchFilter)) return false;
                        }
                        return true;
                    });
                });
                
                const dispoRdvs = computed(() => {
                    return rdvs.value.filter(r => !r.livreur);
                });
                
                const selectAllRdv = computed({
                    get: () => dispoRdvs.value.length > 0 && assignSelectedIds.value.length === dispoRdvs.value.length,
                    set: (val) => {
                        if (val) assignSelectedIds.value = dispoRdvs.value.map(r => r.id);
                        else assignSelectedIds.value = [];
                    }
                });
                
                const kpis = computed(() => {
                    return {
                        dispo: dispoRdvs.value.length,
                        depots: rdvs.value.filter(r => r.rdvType === 'DEPOT').length,
                        recups: rdvs.value.filter(r => r.rdvType === 'RECUPERATION').length
                    };
                });
                
                const getDriverRdvsCount = (driverName) => {
                    return rdvs.value.filter(r => r.livreur === driverName).length;
                };
                
                const openAssignModal = (driverName) => {
                    if (!driverName && !filters.driver) {
                        globalApp.showToast("Veuillez d'abord sélectionner un chauffeur dans la liste de gauche.", "error");
                        return;
                    }
                    driverToAssign.value = driverName || filters.driver;
                    assignSelectedIds.value = [];
                    showAssignModal.value = true;
                };
                
                const closeAssignModal = () => {
                    showAssignModal.value = false;
                };
                
                const confirmAssign = async () => {
                    if (assignSelectedIds.value.length === 0) {
                        globalApp.showToast("Veuillez sélectionner au moins un RDV.", "error");
                        return;
                    }
                    
                    assigning.value = true;
                    
                    try {
                        const batch = writeBatch(db);
                        const driverRdvs = rdvs.value.filter(r => r.livreur === driverToAssign.value);
                        let nextOrder = driverRdvs.length > 0 ? Math.max(...driverRdvs.map(r => r.orderInRoute || 0)) + 1 : 0;
                        
                        assignSelectedIds.value.forEach(id => {
                            batch.update(doc(db, getCollectionName("appointments"), id), {
                                livreur: driverToAssign.value,
                                status: 'en_cours',
                                orderInRoute: nextOrder++
                            });
                        });
                        
                        await batch.commit();
                        globalApp.showToast(`${assignSelectedIds.value.length} RDV assigné(s) avec succès !`, "success");
                        closeAssignModal();
                    } catch(e) {
                        globalApp.showToast("Erreur lors de l'assignation.", "error");
                    } finally {
                        assigning.value = false;
                    }
                };
                
                const removeRdv = async (id) => {
                    try {
                        await updateDoc(doc(db, getCollectionName("appointments"), id), {
                            livreur: null,
                            status: 'confirmé', 
                            orderInRoute: null
                        });
                        globalApp.showToast("RDV retiré du programme.", "success");
                    } catch(e) {
                        globalApp.showToast("Erreur lors du retrait.", "error");
                    }
                };
                
                const moveOrder = async (id, direction) => {
                    if (!filters.driver) return;
                    
                    const driverRdvs = rdvs.value.filter(r => r.livreur === filters.driver);
                    const index = driverRdvs.findIndex(r => r.id === id);
                    
                    if (index === -1) return;
                    
                    const newIndex = index + direction;
                    if (newIndex < 0 || newIndex >= driverRdvs.length) return;
                    
                    const itemA = driverRdvs[index];
                    const itemB = driverRdvs[newIndex];
                    
                    driverRdvs.forEach((r, idx) => r.orderInRoute = r.orderInRoute !== undefined ? r.orderInRoute : idx);
                    
                    const temp = itemA.orderInRoute;
                    itemA.orderInRoute = itemB.orderInRoute;
                    itemB.orderInRoute = temp;
                    
                    try {
                        const batch = writeBatch(db);
                        batch.update(doc(db, getCollectionName("appointments"), itemA.id), { orderInRoute: itemA.orderInRoute });
                        batch.update(doc(db, getCollectionName("appointments"), itemB.id), { orderInRoute: itemB.orderInRoute });
                        await batch.commit();
                    } catch(e) {
                        globalApp.showToast("Erreur lors de la réorganisation.", "error");
                    }
                };
                
                const optiDriver = ref('');

                // Calcule (ou recalcule) le meilleur trajet pour le chauffeur
                // courant, en excluant les RDV ratés/ignorés (optiSkipped).
                // Départ ET arrivée au dépôt AMT.
                const computeOptimization = async () => {
                    optiLoading.value = true;
                    try {
                        const depotCoord = await geocodeAddress(DEPOT_ADDRESS);
                        const driverRdvs = rdvs.value
                            .filter(r => r.livreur === optiDriver.value && !optiSkipped.value.includes(r.id));
                        // Géocodage en parallèle (BAN).
                        const stops = await Promise.all(driverRdvs.map(async r => ({ rdv: r, coord: await geocodeAddress(r.adresse) })));
                        const result = await optimizeRoute(depotCoord, stops);
                        currentOptimizedOrder.value = result.ordered.map(s => s.rdv);
                        optiResult.value = {
                            totalKm: result.totalKm,
                            totalMin: result.totalMin,
                            legs: result.legs,
                            engine: result.engine,
                            invalidCount: result.invalid.length,
                            depotOk: !!depotCoord
                        };
                    } catch (e) {
                        globalApp.showToast("Erreur lors du calcul de l'itinéraire.", "error");
                    } finally {
                        optiLoading.value = false;
                    }
                };

                const openOptimizationPanel = async (driverName) => {
                    const driverRdvs = rdvs.value.filter(r => r.livreur === driverName);
                    if (driverRdvs.length === 0) {
                        globalApp.showToast("Aucun RDV assigné à ce chauffeur pour calculer le trajet.", "error");
                        return;
                    }
                    optiDriver.value = driverName;
                    optiSkipped.value = [];
                    currentOptimizedOrder.value = [];
                    showOptiModal.value = true;
                    await computeOptimization();
                };

                // Marque un point comme raté/ignoré et recalcule le meilleur
                // trajet sur les points restants (départ/arrivée au dépôt).
                const skipStop = async (id) => {
                    if (!optiSkipped.value.includes(id)) optiSkipped.value.push(id);
                    await computeOptimization();
                };
                const unskipStop = async (id) => {
                    optiSkipped.value = optiSkipped.value.filter(x => x !== id);
                    await computeOptimization();
                };
                const skippedRdvs = computed(() =>
                    rdvs.value.filter(r => r.livreur === optiDriver.value && optiSkipped.value.includes(r.id))
                );

                const closeOptimizationPanel = () => {
                    showOptiModal.value = false;
                };

                const applyOptimization = async () => {
                    if (currentOptimizedOrder.value.length === 0 && optiSkipped.value.length === 0) return;
                    savingOpti.value = true;

                    try {
                        const batch = writeBatch(db);
                        let idx = 0;
                        // 1) Points optimisés dans l'ordre.
                        currentOptimizedOrder.value.forEach((r) => {
                            batch.update(doc(db, getCollectionName("appointments"), r.id), { orderInRoute: idx++ });
                        });
                        // 2) Points ratés/ignorés -> placés en fin de tournée.
                        optiSkipped.value.forEach((id) => {
                            batch.update(doc(db, getCollectionName("appointments"), id), { orderInRoute: idx++ });
                        });
                        await batch.commit();

                        globalApp.showToast("Nouvel ordre optimisé appliqué avec succès !", "success");
                        closeOptimizationPanel();
                    } catch(e) {
                        globalApp.showToast("Erreur lors de l'application de l'optimisation.", "error");
                    } finally {
                        savingOpti.value = false;
                    }
                };

                const getOldIndex = (id) => {
                    const driverRdvs = rdvs.value.filter(r => r.livreur === optiDriver.value);
                    return driverRdvs.findIndex(orig => orig.id === id);
                };
                // Distance/durée d'approche d'un arrêt (leg correspondant).
                const legFor = (idx) => {
                    const l = optiResult.value.legs && optiResult.value.legs[idx];
                    return l ? l : { km: 0, min: 0 };
                };
                
                const openAddDriverModal = async () => {
                    formDriver.id = '';
                    formDriver.phone = '';
                    showAddDriverModal.value = true;
                    
                    try {
                        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                        const usersSnap = await getDocs(collection(db, "users"));
                        const agentsSnap = await getDocs(collection(db, "agents"));
                        
                        const agentsList = [];
                        
                        usersSnap.forEach(doc => {
                            const data = doc.data();
                            if (data.agency === activeAgency || data.agency === 'all') {
                                const name = data.displayName || data.email || 'Inconnu';
                                agentsList.push({ id: doc.id, name, phone: data.phone || data.tel || '', col: 'users' });
                            }
                        });
                        
                        agentsSnap.forEach(doc => {
                            const data = doc.data();
                            const name = data.name;
                            if (name && (data.agency === activeAgency || data.agency === 'all')) {
                                if (!agentsList.find(a => a.name.toLowerCase() === name.toLowerCase())) {
                                    agentsList.push({ id: doc.id, name, phone: data.phone || data.tel || '', col: 'agents' });
                                }
                            }
                        });

                        agentsList.sort((a,b) => a.name.localeCompare(b.name));
                        availableAgentsForDropdown.value = agentsList;
                        
                    } catch (error) {
                        console.error("Erreur chargement agents:", error);
                    }
                };
                
                const closeAddDriverModal = () => {
                    showAddDriverModal.value = false;
                };
                
                const saveDriverPhone = async () => {
                    if (!formDriver.id) {
                        globalApp.showToast("Veuillez sélectionner un utilisateur.", "error");
                        return;
                    }

                    const driver = availableAgentsForDropdown.value.find(d => d.id === formDriver.id);
                    if (!driver) return;

                    savingDriver.value = true;

                    try {
                        await updateDoc(doc(db, driver.col, driver.id), {
                            phone: formDriver.phone.trim(),
                            isChauffeur: true
                        });
                        
                        globalApp.showToast("Utilisateur ajouté comme chauffeur avec succès.", "success");
                        closeAddDriverModal();
                        await loadDrivers();
                    } catch (error) {
                        globalApp.showToast("Erreur lors de l'enregistrement.", "error");
                    } finally {
                        savingDriver.value = false;
                    }
                };
                
                // Rang (1..N) d'un RDV dans la tournée du chauffeur courant.
                const driverRank = (r) => {
                    const list = rdvs.value.filter(x => x.livreur === filters.driver)
                        .sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));
                    return list.findIndex(x => x.id === r.id) + 1;
                };
                const driverRdvCount = computed(() =>
                    filters.driver ? rdvs.value.filter(x => x.livreur === filters.driver).length : 0
                );

                // Saisie manuelle du rang : on déplace le RDV à la position
                // demandée et on renumérote toute la tournée du chauffeur.
                const setManualOrder = async (id, rawValue) => {
                    if (!filters.driver) return;
                    const list = rdvs.value.filter(x => x.livreur === filters.driver)
                        .sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));
                    const newRank = parseInt(rawValue);
                    const curIdx = list.findIndex(x => x.id === id);
                    if (curIdx === -1) return;
                    if (isNaN(newRank) || newRank < 1 || newRank > list.length || newRank - 1 === curIdx) {
                        rdvs.value = [...rdvs.value]; // valeur invalide -> on rerend (annule la saisie)
                        return;
                    }
                    const [moved] = list.splice(curIdx, 1);
                    list.splice(newRank - 1, 0, moved);
                    try {
                        const batch = writeBatch(db);
                        list.forEach((r, idx) => { r.orderInRoute = idx; batch.update(doc(db, getCollectionName("appointments"), r.id), { orderInRoute: idx }); });
                        await batch.commit();
                        globalApp.showToast("Ordre mis à jour.", "success");
                    } catch (e) {
                        globalApp.showToast("Erreur lors de la réorganisation.", "error");
                    }
                };

                const printRoadmap = async (driverName) => {
                    const driverRdvs = rdvs.value.filter(r => r.livreur === driverName)
                        .sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));
                    if (driverRdvs.length === 0) {
                        globalApp.showToast("Aucun RDV assigné à ce chauffeur.", "error");
                        return;
                    }
                    try {
                        const { jsPDF } = await loadJsPdf();
                        const docp = new jsPDF('p', 'mm', 'a4');
                        const BLUE = [26, 53, 83];     // bleu AMT
                        const GOLD = [253, 198, 21];   // jaune AMT
                        const pageW = docp.internal.pageSize.getWidth();
                        const nbDepot = driverRdvs.filter(r => r.rdvType === 'DEPOT').length;
                        const nbRecup = driverRdvs.length - nbDepot;

                        // En-tete : banniere bleue + lisere dore
                        docp.setFillColor(...BLUE);
                        docp.rect(0, 0, pageW, 30, 'F');
                        docp.setFillColor(...GOLD);
                        docp.rect(0, 30, pageW, 2.5, 'F');
                        docp.setTextColor(255, 255, 255);
                        docp.setFont('helvetica', 'bold'); docp.setFontSize(18);
                        docp.text("FEUILLE DE ROUTE", 14, 15);
                        docp.setFont('helvetica', 'normal'); docp.setFontSize(10);
                        docp.text("AMT Trans'it", 14, 23);
                        docp.setFont('helvetica', 'bold'); docp.setFontSize(12);
                        docp.text(driverName, pageW - 14, 13, { align: 'right' });
                        docp.setFont('helvetica', 'normal'); docp.setFontSize(9.5);
                        docp.text(`Date : ${formattedDate.value}`, pageW - 14, 20, { align: 'right' });
                        docp.text(`${driverRdvs.length} arret(s)  -  ${nbDepot} depot  -  ${nbRecup} recup`, pageW - 14, 26, { align: 'right' });

                        // Depart / Arrivee (depot)
                        docp.setFontSize(9); docp.setTextColor(80);
                        docp.setFont('helvetica', 'bold');
                        docp.text("Depart / Arrivee :", 14, 40);
                        docp.setFont('helvetica', 'normal');
                        docp.text(String(DEPOT_ADDRESS || ''), 47, 40);

                        const body = driverRdvs.map((r, i) => {
                            let acc = r.adresse || '';
                            if (r.etage) acc += `\nEtage/Bat. : ${r.etage}`;
                            if (r.acces && r.acces !== 'Aucun') acc += `\nAcces : ${r.acces}${r.codeAcces ? ' (' + r.codeAcces + ')' : ''}`;
                            return [
                                i + 1,
                                r.rdvType === 'DEPOT' ? 'DÉPÔT' : 'RÉCUP',
                                r.client || '',
                                r.tel || '',
                                acc,
                                (r.notes || '').replace(/\s+/g, ' ').trim()
                            ];
                        });
                        docp.autoTable({
                            startY: 46,
                            head: [['#', 'Type', 'Client', 'Téléphone', 'Adresse & Accès', 'Description']],
                            body,
                            theme: 'striped',
                            styles: { fontSize: 8.5, cellPadding: 2.5, overflow: 'linebreak', valign: 'middle', lineColor: [226, 232, 240], lineWidth: 0.1 },
                            headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold', fontSize: 9 },
                            alternateRowStyles: { fillColor: [245, 248, 252] },
                            columnStyles: { 0: { cellWidth: 9, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 17, halign: 'center' }, 2: { cellWidth: 32, fontStyle: 'bold' }, 3: { cellWidth: 26 } },
                            didParseCell: (data) => {
                                if (data.section === 'body' && data.column.index === 1) {
                                    data.cell.styles.fontStyle = 'bold';
                                    data.cell.styles.textColor = (data.cell.raw && String(data.cell.raw)[0] === 'D') ? [180, 83, 9] : [22, 101, 52];
                                }
                            },
                            didDrawPage: (data) => {
                                const h = docp.internal.pageSize.getHeight();
                                docp.setFontSize(8); docp.setTextColor(150); docp.setFont('helvetica', 'normal');
                                docp.text("AMT Trans'it - Feuille de route chauffeur", 14, h - 8);
                                docp.text(`Page ${data.pageNumber}`, pageW - 14, h - 8, { align: 'right' });
                            }
                        });
                        docp.save(`Feuille_route_${driverName}_${filters.date}.pdf`);
                    } catch (e) {
                        globalApp.showToast("Erreur lors de la génération du PDF.", "error");
                    }
                };
                return {
                    rdvs, drivers, loading, filters, formattedDate, filteredRdvs, kpis,
                    showAssignModal, showOptiModal, showAddDriverModal, assigning, savingOpti, savingDriver,
                    driverToAssign, dispoRdvs, assignSelectedIds, selectAllRdv, currentOptimizedOrder,
                    formDriver, availableAgentsForDropdown, optiDriver,
                    getDriverRdvsCount, openAssignModal, closeAssignModal, confirmAssign, removeRdv, moveOrder,
                    openOptimizationPanel, closeOptimizationPanel, applyOptimization, getOldIndex,
                    openAddDriverModal, closeAddDriverModal, saveDriverPhone, printRoadmap,
                    optiLoading, optiResult, optiSkipped, computeOptimization, skipStop, unskipStop, skippedRdvs, legFor,
                    setManualOrder, driverRank, driverRdvCount, DEPOT_ADDRESS
                };
            }
        });

        this.vueApp.mount('#vue-nouveauprogramme-app');
    }
};